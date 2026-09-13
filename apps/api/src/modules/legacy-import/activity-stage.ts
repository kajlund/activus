import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { CreateActivityRequestSchema } from '@activus/contracts';
import type { Database } from '../../db/client.js';
import {
  activities,
  activityMeasurements,
  activityTags,
} from '../../db/schema.js';
import { validateActivityWrite } from '../activities/service.js';
import { effective } from '../activities/validator.js';
import { decimal, decimalString } from '../activities/decimal.js';
import type {
  ActivityRecord,
  ValueRecord,
  ActivityWrite,
  ValueFields,
} from '../activities/model.js';
import { dryRun } from './dry-run.js';
import type { ActivityCandidate } from './types.js';
import { readReferenceState } from './reference-stage.js';
import { referenceReadiness, type ReferenceState } from './reference-plan.js';

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Connection = Pick<Database, 'select' | 'execute' | 'insert'>;
export async function loadActivitySource(input: string) {
  const candidates: ActivityCandidate[] = [];
  const report = await dryRun(input, (c) => candidates.push(c));
  candidates.sort((a, b) =>
    a.sourceExternalId.localeCompare(b.sourceExternalId),
  );
  return { report, candidates };
}
export type ActivitySource = Awaited<ReturnType<typeof loadActivitySource>>;
interface State {
  references: ReferenceState;
  activities: ActivityRecord[];
  measurements: ValueRecord[];
  tags: (typeof activityTags.$inferSelect)[];
}
async function readState(db: Connection, source: string): Promise<State> {
  return {
    references: await readReferenceState(db, source),
    activities: await db.select().from(activities),
    measurements: await db.select().from(activityMeasurements),
    tags: await db.select().from(activityTags),
  };
}
type ImportFields = ActivityWrite['fields'] & {
  source: string;
  sourceExternalId: string;
  createdAt: Date;
  updatedAt: Date;
};
interface Planned {
  sourceId: string;
  destinationId: string | null;
  action: 'create' | 'already-imported' | 'conflict' | 'blocked';
  reason: string | null;
  fields: ImportFields | null;
  values: ValueFields[];
  isPartial: boolean;
}
function canonicalActivity(a: ImportFields) {
  return [
    a.activityKindId,
    a.activityVariantId,
    a.activityDate,
    a.startedAt?.toISOString() ?? null,
    a.durationSeconds,
    a.name,
    a.notes,
    a.effort,
    a.feeling,
    a.isPartial,
    a.source,
    a.sourceExternalId,
    a.createdAt.toISOString(),
    a.updatedAt.toISOString(),
  ];
}
function canonicalValues(values: ValueFields[]) {
  return values
    .map((v) => [
      v.measurementDefinitionId,
      v.numericValue === null ? null : decimalString(decimal(v.numericValue)),
      v.integerValue,
      v.booleanValue,
      v.textValue,
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}
export function prepareActivity(
  c: ActivityCandidate,
  source: string,
  refs: ReferenceState,
) {
  const lookup = (role: string) =>
    refs.mappings.find(
      (m) =>
        m.source === source &&
        m.collection === 'kinds' &&
        m.sourceId === c.kindSourceId &&
        m.role === role,
    );
  const kindId = lookup('kind')?.kindId;
  const variantId = c.target.variant ? lookup('variant')?.variantId : null;
  if (!kindId || (c.target.variant && !variantId))
    throw Error('REFERENCE_MAPPING_MISSING');
  const measurements = c.measurements.map((m) => {
    const id = lookup(`measurement:${m.field}`)?.definitionId;
    if (!id || !m.resolved) throw Error('MEASUREMENT_MAPPING_MISSING');
    // Canonical units are the validator default; no display-unit conversion.
    return {
      measurementDefinitionId: id,
      valueType: m.valueType,
      value: m.valueType === 'integer' ? Number(m.value) : m.value,
    };
  });
  const present = new Set(measurements.map((m) => m.measurementDefinitionId));
  const isPartial = refs.definitions.some(
    (d) =>
      effective(d, kindId, variantId ?? null) &&
      !d.archivedAt &&
      d.isRequired &&
      !present.has(d.id),
  );
  const request = CreateActivityRequestSchema.parse({
    activityKindId: kindId,
    activityVariantId: variantId,
    activityDate: c.activityDate,
    startedAt: c.startedAt,
    durationSeconds: c.durationSeconds,
    name: c.name,
    notes: c.notes,
    effort: null,
    feeling: null,
    isPartial,
    measurements,
    tagIds: [],
  });
  const write = validateActivityWrite(
    {
      existing: undefined,
      kind: refs.kinds.find((k) => k.id === kindId),
      variants: refs.variants.filter((v) => v.activityKindId === kindId),
      definitions: refs.definitions,
      tags: [],
    },
    request,
  );
  return {
    fields: {
      ...write.fields,
      source,
      sourceExternalId: c.sourceExternalId,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    },
    values: write.measurements ?? [],
    isPartial,
  };
}
function plan(source: ActivitySource, state: State) {
  const namespace = source.report.identity.sourceNamespace ?? '';
  const readiness = referenceReadiness(source.report, state.references);
  const packageErrors = source.report.issues
    .filter((i) => i.severity === 'error')
    .map((i) => ({ code: i.code, sourceId: i.sourceId, field: i.field }));
  if (!readiness.readyForActivityImport)
    packageErrors.push({
      code: 'REFERENCE_OR_SOURCE_NOT_READY',
      sourceId: null,
      field: 'references',
    });
  const entries: Planned[] = source.candidates.map((c) => {
    const base = {
      sourceId: c.source.id!,
      destinationId: null,
      fields: null,
      values: [],
      isPartial: false,
    };
    if (
      source.report.records.some(
        (r) =>
          r.collection === 'activities' &&
          r.sourceId === c.source.id &&
          r.status !== 'normalizable',
      )
    )
      return { ...base, action: 'blocked', reason: 'SOURCE_VALIDATION_FAILED' };
    try {
      const desired = prepareActivity(c, namespace, state.references);
      const matches = state.activities.filter(
        (a) =>
          a.source === namespace && a.sourceExternalId === c.sourceExternalId,
      );
      const existing = matches[0];
      if (matches.length > 1)
        return {
          ...base,
          ...desired,
          action: 'conflict',
          reason: 'DUPLICATE_SOURCE_IDENTITY',
        };
      if (!existing)
        return { ...base, ...desired, action: 'create', reason: null };
      const owned = state.measurements.filter(
        (m) => m.activityId === existing.id,
      );
      const equivalent =
        hash(canonicalActivity(existing as ImportFields)) ===
          hash(canonicalActivity(desired.fields)) &&
        hash(canonicalValues(owned)) ===
          hash(canonicalValues(desired.values)) &&
        owned.every(
          (m) =>
            m.createdAt.toISOString() === c.createdAt &&
            m.updatedAt.toISOString() === c.updatedAt,
        ) &&
        !state.tags.some((t) => t.activityId === existing.id);
      return {
        ...base,
        ...desired,
        destinationId: existing.id,
        action: equivalent ? 'already-imported' : 'conflict',
        reason: equivalent ? null : 'CANONICAL_CONTENT_CHANGED',
      };
    } catch {
      return {
        ...base,
        action: 'blocked',
        reason: 'DOMAIN_VALIDATION_OR_MAPPING_FAILED',
      };
    }
  });
  for (const record of source.report.records.filter(
    (r) => r.collection === 'activities' && !r.candidate,
  ))
    entries.push({
      sourceId: record.sourceId ?? `line:${record.line}`,
      destinationId: null,
      action: 'blocked',
      reason: 'SOURCE_DECODE_FAILED',
      fields: null,
      values: [],
      isPartial: false,
    });
  entries.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const expected = new Set(source.candidates.map((c) => c.sourceExternalId));
  const lineage = state.activities.filter((a) => a.source === namespace);
  const unexpected = lineage
    .filter((a) => !expected.has(a.sourceExternalId ?? ''))
    .map((a) => ({ destinationId: a.id, sourceExternalId: a.sourceExternalId }))
    .sort((a, b) => a.destinationId.localeCompare(b.destinationId));
  if (unexpected.length)
    packageErrors.push({
      code: 'UNEXPECTED_DESTINATION_IDENTITIES',
      sourceId: null,
      field: 'sourceExternalId',
    });
  const byDefinition: Record<string, number> = {};
  for (const e of entries)
    for (const v of e.values)
      byDefinition[v.measurementDefinitionId] =
        (byDefinition[v.measurementDefinitionId] ?? 0) + 1;
  const counts = {
    source: source.report.summary.byCollection.activities?.read ?? 0,
    accepted: entries.filter(
      (e) => e.action === 'create' || e.action === 'already-imported',
    ).length,
    create: entries.filter((e) => e.action === 'create').length,
    alreadyImported: entries.filter((e) => e.action === 'already-imported')
      .length,
    skipped: 0,
    blocked: entries.filter((e) => e.action === 'blocked').length,
    conflicts: entries.filter((e) => e.action === 'conflict').length,
    proposedMeasurements: entries.reduce((n, e) => n + e.values.length, 0),
  };
  const safe =
    packageErrors.length === 0 &&
    counts.blocked === 0 &&
    counts.conflicts === 0 &&
    counts.accepted === counts.source;
  return {
    entries,
    packageErrors,
    unexpected,
    readiness,
    counts,
    safe,
    byDefinition: Object.fromEntries(Object.entries(byDefinition).sort()),
    lineageCount: lineage.length,
    fingerprint: hash({
      source: source.report,
      entries: entries.map((e) => ({
        ...e,
        fields: e.fields ? canonicalActivity(e.fields) : null,
        values: canonicalValues(e.values),
      })),
    }),
  };
}
function reportFor(
  source: ActivitySource,
  state: State,
  p: ReturnType<typeof plan>,
) {
  const warnings = source.report.issues.filter(
    (i) => i.severity === 'warning' && i.code !== 'DESTINATION_CHECK_REQUIRED',
  );
  for (const e of p.entries)
    if (e.isPartial)
      warnings.push({
        severity: 'warning',
        code: 'IMPORT_PARTIAL_REQUIRED_VALUES_ABSENT',
        collection: 'activities',
        sourceId: e.sourceId,
        line: 0,
        field: 'isPartial',
        message:
          'Missing required values retained as an explicitly partial activity.',
      });
  const warningCounts: Record<string, number> = {};
  for (const w of warnings)
    warningCounts[w.code] = (warningCounts[w.code] ?? 0) + 1;
  const lineageIds = new Set(
    state.activities
      .filter((a) => a.source === source.report.identity.sourceNamespace)
      .map((a) => a.id),
  );
  return {
    reportVersion: 'activus-legacy-activities-v1' as const,
    stage: 'activities' as const,
    mode: 'preview' as 'preview' | 'apply',
    identity: source.report.identity,
    referenceReadiness: p.readiness,
    transaction: 'not-started' as 'not-started' | 'committed' | 'rolled-back',
    failureCode: null as string | null,
    counts: { ...p.counts, created: 0, createdMeasurements: 0 },
    destination: {
      activities: state.activities.length,
      measurements: state.measurements.length,
      lineageActivities: p.lineageCount,
      lineageMeasurements: state.measurements.filter((m) =>
        lineageIds.has(m.activityId),
      ).length,
    },
    measurementCountsByDefinition: p.byDefinition,
    omissions: {
      zeroMeasurements: source.report.summary.issuesByCode.ZERO_OMITTED
        ? source.report.issues.filter(
            (i) => i.code === 'ZERO_OMITTED' && i.field !== 'duration',
          ).length
        : 0,
      zeroDurations: source.report.issues.filter(
        (i) => i.code === 'ZERO_OMITTED' && i.field === 'duration',
      ).length,
      absentMeasurements: source.report.summary.omittedAbsentMeasurements,
    },
    dates: {
      dateOnly: source.candidates.filter((c) => c.startedAt === null).length,
      timed: source.candidates.filter((c) => c.startedAt !== null).length,
    },
    warnings: warnings.sort(
      (a, b) =>
        (a.sourceId ?? '').localeCompare(b.sourceId ?? '') ||
        a.code.localeCompare(b.code),
    ),
    warningCounts,
    errors: p.packageErrors,
    records: p.entries.map((e) => ({
      sourceId: e.sourceId,
      destinationId: e.destinationId,
      action: e.action,
      reason: e.reason,
      measurements: e.values.length,
    })),
    unexpectedDestinationIdentities: p.unexpected,
    unmatchedSourceIdentities: p.entries
      .filter((e) => e.action !== 'already-imported')
      .map((e) => e.sourceId),
    safeToApply: p.safe,
    complete: p.safe && p.counts.alreadyImported === p.counts.source,
    planFingerprint: p.fingerprint,
  };
}
export type ActivityImportReport = ReturnType<typeof reportFor>;
export async function previewActivities(db: Database, source: ActivitySource) {
  return db.transaction(
    async (tx) => {
      const state = await readState(
        tx,
        source.report.identity.sourceNamespace ?? '',
      );
      return reportFor(source, state, plan(source, state));
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
// Digest all non-imported data under transaction locks, without logging payloads.
async function protectedState(db: Connection, source: string) {
  const tables = [
    'activity_kinds',
    'activity_variants',
    'measurement_definitions',
    'legacy_reference_mappings',
    'goals',
    'goal_tags',
    'tags',
    'activity_tags',
  ];
  const values = [];
  for (const table of tables) {
    const rows = await db.execute(
      sql`SELECT md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text),'')) AS digest FROM ${sql.identifier(table)} t`,
    );
    values.push(rows.rows);
  }
  const rows = await db.execute(
    sql`SELECT md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY id),'')) AS digest FROM activities t WHERE source IS DISTINCT FROM ${source}`,
  );
  values.push(rows.rows);
  const measurements = await db.execute(
    sql`SELECT md5(coalesce(string_agg(row_to_json(m)::text, '' ORDER BY m.id),'')) AS digest FROM activity_measurements m JOIN activities a ON a.id=m.activity_id WHERE a.source IS DISTINCT FROM ${source}`,
  );
  values.push(measurements.rows);
  return hash(values);
}
export async function applyActivities(
  db: Database,
  input: string,
  preview: ActivityImportReport,
): Promise<ActivityImportReport> {
  if (!preview.safeToApply) return { ...preview, mode: 'apply' };
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`LOCK TABLE activity_kinds, activity_variants, measurement_definitions, legacy_reference_mappings, goals, goal_tags, tags, activity_tags IN SHARE MODE`,
      );
      await tx.execute(
        sql`LOCK TABLE activities, activity_measurements IN SHARE ROW EXCLUSIVE MODE`,
      );
      const source = await loadActivitySource(input);
      const namespace = source.report.identity.sourceNamespace ?? '';
      const before = await readState(tx, namespace);
      const p = plan(source, before);
      if (!p.safe || p.fingerprint !== preview.planFingerprint)
        throw Error('PLAN_CHANGED');
      const protectedBefore = await protectedState(tx, namespace);
      let created = 0,
        createdMeasurements = 0;
      for (const e of p.entries) {
        if (e.action !== 'create') continue;
        if (!e.fields) throw Error('INVALID_PLAN');
        const [row] = await tx
          .insert(activities)
          .values(e.fields)
          .returning({ id: activities.id });
        if (!row) throw Error('INSERT_FAILED');
        if (e.values.length)
          await tx.insert(activityMeasurements).values(
            e.values.map((v) => ({
              ...v,
              activityId: row.id,
              createdAt: e.fields!.createdAt,
              updatedAt: e.fields!.updatedAt,
            })),
          );
        created++;
        createdMeasurements += e.values.length;
      }
      const after = await readState(tx, namespace);
      const result = reportFor(source, after, plan(source, after));
      if (
        !result.complete ||
        (await protectedState(tx, namespace)) !== protectedBefore
      )
        throw Error('RECONCILIATION_FAILED');
      const fresh = await loadActivitySource(input);
      if (hash(fresh) !== hash(source))
        throw Error('SOURCE_CHANGED_DURING_APPLY');
      return {
        ...result,
        mode: 'apply',
        transaction: 'committed',
        counts: {
          ...result.counts,
          created,
          createdMeasurements,
          alreadyImported: p.counts.alreadyImported,
        },
      };
    });
  } catch {
    return {
      ...preview,
      mode: 'apply',
      transaction: 'rolled-back',
      failureCode: 'ACTIVITY_BATCH_FAILED_OR_PREVIEW_CHANGED',
      safeToApply: false,
      complete: false,
    };
  }
}
