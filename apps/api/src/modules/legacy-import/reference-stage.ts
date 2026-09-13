import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  activityKinds,
  activityVariants,
  measurementDefinitions,
  legacyReferenceMappings,
} from '../../db/schema.js';
import { dryRun, type DryRunReport } from './dry-run.js';
import {
  planReferences,
  referenceReadiness,
  type ReferenceState,
  type PlanEntry,
} from './reference-plan.js';

type Connection = Pick<Database, 'select' | 'execute' | 'insert'>;
export async function readReferenceState(
  db: Connection,
  source: string,
): Promise<ReferenceState> {
  const ledger = await db.execute(
    sql`SELECT to_regclass('public.legacy_reference_mappings') IS NOT NULL AS present`,
  );
  return {
    kinds: await db.select().from(activityKinds),
    variants: await db.select().from(activityVariants),
    definitions: await db.select().from(measurementDefinitions),
    mappings: ledger.rows[0]?.present
      ? await db
          .select()
          .from(legacyReferenceMappings)
          .where(eq(legacyReferenceMappings.source, source))
      : [],
  };
}
async function createReference(
  db: Connection,
  e: PlanEntry,
  parentId: string | undefined,
): Promise<string> {
  if (e.entity === 'kind') {
    const v = e.values;
    const [row] = await db
      .insert(activityKinds)
      .values({
        name: String(v.name),
        iconName: String(v.iconName),
        color: String(v.color),
        sortOrder: Number(v.sortOrder),
        createdAt: new Date(String(v.createdAt)),
        updatedAt: new Date(String(v.updatedAt)),
      })
      .returning({ id: activityKinds.id });
    if (!row) throw Error('Missing created kind');
    return row.id;
  }
  if (!parentId) throw Error('Missing parent');
  if (e.entity === 'variant') {
    const [row] = await db
      .insert(activityVariants)
      .values({
        activityKindId: parentId,
        name: String(e.values.name),
        sortOrder: Number(e.values.sortOrder),
        isDefault: false,
      })
      .returning({ id: activityVariants.id });
    if (!row) throw Error('Missing created variant');
    return row.id;
  }
  const [row] = await db
    .insert(measurementDefinitions)
    .values({
      ...e.values,
      activityKindId: parentId,
      activityVariantId: null,
    } as typeof measurementDefinitions.$inferInsert)
    .returning({ id: measurementDefinitions.id });
  if (!row) throw Error('Missing created definition');
  return row.id;
}
export async function previewReferences(db: Database, source: DryRunReport) {
  return db.transaction(
    async (tx) => {
      const state = await readReferenceState(
        tx,
        source.identity.sourceNamespace ?? '',
      );
      return makeReport(source, state, 'preview', 'not-started');
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
function makeReport(
  source: DryRunReport,
  state: ReferenceState,
  mode: 'preview' | 'apply',
  transaction: 'not-started' | 'committed' | 'rolled-back',
) {
  return {
    reportVersion: 'activus-legacy-reference-v1' as const,
    mode,
    stage: 'reference-data' as const,
    identity: source.identity,
    sourceSummary: source.summary,
    sourceIssues: source.issues.filter(
      (i) => i.severity === 'error' || i.code === 'TREADMILL_MANUAL_REVIEW',
    ),
    plan: planReferences(source, state),
    transaction,
    readiness: referenceReadiness(source, state),
    activityWrites: 0,
  };
}
export type ReferenceReport = ReturnType<typeof makeReport>;
export async function applyReferences(
  db: Database,
  input: string,
  source: DryRunReport,
  preview: ReferenceReport,
): Promise<ReferenceReport> {
  if (preview.plan.counts.block) return { ...preview, mode: 'apply' };
  let attempted = preview;
  try {
    const result = await db.transaction(async (tx) => {
      // Serialize reference changes, including unrelated writers; never lock or update MongoDB.
      await tx.execute(
        sql`LOCK TABLE activity_kinds, activity_variants, measurement_definitions, legacy_reference_mappings IN SHARE ROW EXCLUSIVE MODE`,
      );
      await tx.execute(sql`LOCK TABLE activities IN SHARE MODE`);
      const current = await dryRun(input);
      if (current.identity.sourceNamespace !== source.identity.sourceNamespace)
        throw Error('Source namespace changed');
      let state = await readReferenceState(
        tx,
        source.identity.sourceNamespace ?? '',
      );
      attempted = makeReport(current, state, 'apply', 'not-started');
      if (
        attempted.plan.counts.block ||
        attempted.plan.fingerprint !== preview.plan.fingerprint ||
        JSON.stringify(attempted.plan.entries) !==
          JSON.stringify(preview.plan.entries)
      )
        throw Error('Preview changed');
      const before = await tx.execute(
        sql`SELECT count(*)::text AS count, md5(coalesce(string_agg(md5(row_to_json(a)::text), '' ORDER BY id), '')) AS digest FROM activities a`,
      );
      const ids = new Map<string, string>();
      for (const entry of attempted.plan.entries) {
        const id =
          entry.destinationId ??
          (await createReference(
            tx,
            entry,
            entry.parent ? ids.get(entry.parent) : undefined,
          ));
        ids.set(entry.key, id);
        for (const identity of entry.identities) {
          if (
            state.mappings.some(
              (m) =>
                m.sourceId === identity.sourceId &&
                m.role === identity.role &&
                m.collection === 'kinds',
            )
          )
            continue;
          await tx.insert(legacyReferenceMappings).values({
            source: source.identity.sourceNamespace!,
            collection: 'kinds',
            sourceId: identity.sourceId,
            role: identity.role,
            kindId: entry.entity === 'kind' ? id : null,
            variantId: entry.entity === 'variant' ? id : null,
            definitionId: entry.entity === 'definition' ? id : null,
            fingerprint: attempted.plan.fingerprint,
            disposition: entry.action === 'create' ? 'created' : 'reused',
            formatVersion: 1,
          });
        }
        entry.destinationId = id;
      }
      state = await readReferenceState(tx, source.identity.sourceNamespace!);
      const reconciled = makeReport(current, state, 'apply', 'committed');
      if (
        reconciled.plan.counts.block ||
        reconciled.plan.entries.some((e) => e.action !== 'already-imported')
      )
        throw Error('Reconciliation failed');
      const after = await tx.execute(
        sql`SELECT count(*)::text AS count, md5(coalesce(string_agg(md5(row_to_json(a)::text), '' ORDER BY id), '')) AS digest FROM activities a`,
      );
      if (JSON.stringify(before.rows) !== JSON.stringify(after.rows))
        throw Error('Activities changed');
      return { ...reconciled, plan: attempted.plan };
    });
    return result;
  } catch {
    return {
      ...attempted,
      mode: 'apply',
      transaction: 'rolled-back',
      readiness: { ...attempted.readiness, readyForActivityImport: false },
    };
  }
}
