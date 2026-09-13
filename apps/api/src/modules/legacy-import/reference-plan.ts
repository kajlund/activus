import { createHash } from 'node:crypto';
import type { DryRunReport } from './dry-run.js';
import type {
  activityKinds,
  activityVariants,
  measurementDefinitions,
  legacyReferenceMappings,
} from '../../db/schema.js';

export type Kind = typeof activityKinds.$inferSelect;
export type Variant = typeof activityVariants.$inferSelect;
export type Definition = typeof measurementDefinitions.$inferSelect;
export type Ledger = typeof legacyReferenceMappings.$inferSelect;
export interface ReferenceState {
  kinds: Kind[];
  variants: Variant[];
  definitions: Definition[];
  mappings: Ledger[];
}
export interface ReferenceSpec {
  key: string;
  entity: 'kind' | 'variant' | 'definition';
  parent: string | null;
  values: Record<string, string | number | boolean | null>;
  identities: { sourceId: string; role: string }[];
}
export interface PlanEntry extends ReferenceSpec {
  action: 'create' | 'reuse' | 'already-imported' | 'block';
  destinationId: string | null;
  reason: string | null;
}
const key = (entity: string, parent: string, name: string) =>
  JSON.stringify([
    entity,
    parent.trim().toLowerCase(),
    name.trim().toLowerCase(),
  ]);
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const activityOnly = new Set([
  'CALENDAR_POLICY_PENDING',
  'NUMERIC_PRECISION_PENDING',
]);
export function referenceSpecs(report: DryRunReport): ReferenceSpec[] {
  const specs = new Map<string, ReferenceSpec>();
  function add(spec: ReferenceSpec) {
    const old = specs.get(spec.key);
    if (!old) specs.set(spec.key, spec);
    else
      for (const identity of spec.identities)
        if (
          !old.identities.some(
            (i) => i.sourceId === identity.sourceId && i.role === identity.role,
          )
        )
          old.identities.push(identity);
  }
  for (const r of report.records) {
    const c = r.candidate;
    if (
      r.collection !== 'kinds' ||
      !c ||
      !('iconName' in c) ||
      !c.target.kind ||
      !r.sourceId
    )
      continue;
    const parent = key('kind', '', c.target.kind);
    // A mapped environmental kind must use its approved parent presentation.
    const native = report.records.find(
      (k) =>
        k.collection === 'kinds' &&
        k.sourceId !== r.sourceId &&
        k.candidate?.target.kind === c.target.kind &&
        k.candidate.target.variant !== 'Treadmill',
    )?.candidate;
    const presentation =
      c.target.variant === 'Treadmill' && native && 'iconName' in native
        ? native
        : c;
    add({
      key: parent,
      entity: 'kind',
      parent: null,
      values: {
        name: c.target.kind,
        iconName: presentation.iconName,
        color: presentation.color,
        sortOrder: presentation.sortOrder,
        createdAt: presentation.createdAt,
        updatedAt: presentation.updatedAt,
      },
      identities: [{ sourceId: r.sourceId, role: 'kind' }],
    });
    if (c.target.variant)
      add({
        key: key('variant', c.target.kind, c.target.variant),
        entity: 'variant',
        parent,
        values: {
          name: c.target.variant,
          sortOrder: c.target.variant === 'Outdoor' ? 0 : 1,
          isDefault: false,
        },
        identities: [{ sourceId: r.sourceId, role: 'variant' }],
      });
  }
  for (const r of report.records) {
    const c = r.candidate;
    if (!c || !('measurements' in c) || !c.target.kind) continue;
    for (const m of c.measurements) {
      add({
        key: key('definition', c.target.kind, m.name),
        entity: 'definition',
        parent: key('kind', '', c.target.kind),
        values: {
          name: m.name,
          valueType: m.valueType,
          canonicalUnit: m.canonicalUnit,
          displayUnit: m.displayUnit,
          precision: m.precision,
          isRequired: false,
          minimumValue: 0,
          maximumValue: null,
          aggregation: ['avgHR', 'cadenceAvg'].includes(m.field)
            ? 'average'
            : 'total',
          personalBestDirection: 'none',
          sortOrder: [
            'distance',
            'ascent',
            'steps',
            'calories',
            'avgHR',
            'cadenceAvg',
          ].indexOf(m.field),
        },
        identities: [
          { sourceId: c.kindSourceId, role: `measurement:${m.field}` },
        ],
      });
    }
  }
  return [...specs.values()]
    .sort(
      (a, b) =>
        ['kind', 'variant', 'definition'].indexOf(a.entity) -
          ['kind', 'variant', 'definition'].indexOf(b.entity) ||
        a.key.localeCompare(b.key, 'en'),
    )
    .map((s) => ({
      ...s,
      identities: s.identities.sort((a, b) =>
        a.sourceId.localeCompare(b.sourceId),
      ),
    }));
}
export function planReferences(report: DryRunReport, state: ReferenceState) {
  const specs = referenceSpecs(report);
  // Activity time/correction decisions do not change reference definitions. Source bytes do.
  const fingerprint = hash({
    version: 1,
    policy: report.referencePolicyFingerprint,
    files: report.files.map((f) => [f.collection, f.sha256]),
    specs,
  });
  const blockers = report.issues
    .filter((i) => i.severity === 'error' && !activityOnly.has(i.code))
    .map((i) => ({ code: i.code, sourceId: i.sourceId, field: i.field }));
  const entries: PlanEntry[] = [];
  for (const spec of specs) {
    const parent = entries.find((e) => e.key === spec.parent);
    const rows =
      spec.entity === 'kind'
        ? state.kinds
        : spec.entity === 'variant'
          ? state.variants
          : state.definitions;
    const matches = rows.filter(
      (r) =>
        r.name.trim().toLowerCase() ===
          String(spec.values.name).trim().toLowerCase() &&
        (spec.entity === 'kind' ||
          ('activityKindId' in r &&
            r.activityKindId === parent?.destinationId)) &&
        (!('activityVariantId' in r) || r.activityVariantId === null),
    );
    const existing = matches[0];
    const ledger = spec.identities.map((i) =>
      state.mappings.find(
        (m) =>
          m.source === report.identity.sourceNamespace &&
          m.collection === 'kinds' &&
          m.sourceId === i.sourceId &&
          m.role === i.role,
      ),
    );
    let reason: string | null = null;
    if (parent?.action === 'block') reason = 'Parent mapping is blocked';
    if (matches.length > 1) reason = 'Multiple exact destination names';
    if (
      existing &&
      (existing.archivedAt ||
        Object.entries(spec.values).some(
          ([field, value]) =>
            !['createdAt', 'updatedAt', 'sortOrder', 'color'].includes(field) &&
            (existing as unknown as Record<string, unknown>)[field] !== value,
        ))
    )
      reason = 'Existing destination configuration differs or is archived';
    for (const m of ledger)
      if (
        m &&
        (m.fingerprint !== fingerprint ||
          m.formatVersion !== 1 ||
          (m.kindId ?? m.variantId ?? m.definitionId) !== existing?.id)
      )
        reason = 'Previously mapped source, rules or destination changed';
    entries.push({
      ...spec,
      action: reason
        ? 'block'
        : ledger.every(Boolean)
          ? 'already-imported'
          : existing
            ? 'reuse'
            : 'create',
      destinationId: existing?.id ?? null,
      reason,
    });
  }
  const expected = new Set(
    specs.flatMap((s) => s.identities.map((i) => `${i.sourceId}:${i.role}`)),
  );
  if (
    state.mappings.some(
      (m) =>
        m.source === report.identity.sourceNamespace &&
        (m.collection !== 'kinds' || !expected.has(`${m.sourceId}:${m.role}`)),
    )
  )
    blockers.push({
      code: 'UNEXPECTED_PRIOR_MAPPING',
      sourceId: null,
      field: 'ledger',
    });
  return {
    fingerprint,
    entries,
    blockers,
    counts: {
      create: entries.filter((e) => e.action === 'create').length,
      reuse: entries.filter((e) => e.action === 'reuse').length,
      alreadyImported: entries.filter((e) => e.action === 'already-imported')
        .length,
      skip: 0,
      block:
        entries.filter((e) => e.action === 'block').length + blockers.length,
    },
  };
}
export function referenceReadiness(
  report: DryRunReport,
  state: ReferenceState,
) {
  const plan = planReferences(report, state);
  const missing: Record<string, number> = {};
  let checked = 0,
    fullyResolvable = 0;
  for (const r of report.records.filter((r) => r.collection === 'activities')) {
    checked++;
    const c = r.candidate;
    if (!c || !('measurements' in c)) {
      missing['invalid-source'] = (missing['invalid-source'] ?? 0) + 1;
      continue;
    }
    const roles = [
      'kind',
      ...(c.target.variant ? ['variant'] : []),
      ...c.measurements.map((m) => `measurement:${m.field}`),
    ];
    const absent = roles.filter(
      (role) =>
        !plan.entries.some(
          (e) =>
            e.action === 'already-imported' &&
            e.identities.some(
              (i) => i.sourceId === c.kindSourceId && i.role === role,
            ),
        ),
    );
    if (!absent.length) fullyResolvable++;
    for (const role of absent) {
      const id = `kinds:${c.kindSourceId}:${role}`;
      missing[id] = (missing[id] ?? 0) + 1;
    }
  }
  return {
    checked,
    fullyResolvable,
    intentionallyExcluded: 0,
    missing,
    readyForActivityImport:
      checked === fullyResolvable &&
      report.summary.errors === 0 &&
      plan.counts.block === 0,
  };
}
