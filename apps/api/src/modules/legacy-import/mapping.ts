import { compare, decimal, decimalString } from '../activities/decimal.js';
import type { Mapping } from './package.js';
import type {
  ActivityCandidate,
  AddIssue,
  DecodedActivity,
  DecodedKind,
  KindCandidate,
  MeasurementCandidate,
  SourceIdentity,
  TargetMapping,
} from './types.js';

// Exact Phase 5A evidence. Proposals remain pending until explicitly configured.
export const kindProfile: Record<
  string,
  { name: string; icon: string; legacyIcon: string }
> = {
  '6a859b002489ecc2e1afefa7': {
    name: 'Strength Training',
    icon: 'dumbbell',
    legacyIcon: 'ico-gym',
  },
  '6a859b002489ecc2e1afefa8': {
    name: 'Swimming',
    icon: 'waves',
    legacyIcon: 'ico-swim',
  },
  '6a859b002489ecc2e1afefa9': {
    name: 'Walking',
    icon: 'footprints',
    legacyIcon: 'ico-walk',
  },
  '6a859b002489ecc2e1afefaa': {
    name: 'Cycling',
    icon: 'bike',
    legacyIcon: 'ico-bike',
  },
  '6a859b002489ecc2e1afefab': {
    name: 'Running',
    icon: 'footprints',
    legacyIcon: 'ico-run',
  },
  '6a859b002489ecc2e1afefac': {
    name: 'Physio Exercises',
    icon: 'activity',
    legacyIcon: 'ico-activity',
  },
  '6a859b002489ecc2e1afefad': {
    name: 'Stretching',
    icon: 'person-standing',
    legacyIcon: 'ico-stretch',
  },
  '6a859b002489ecc2e1afefae': {
    name: 'Meditation',
    icon: 'person-standing',
    legacyIcon: 'ico-meditation',
  },
  '6a859b002489ecc2e1afefaf': {
    name: 'Treadmill',
    icon: 'footprints',
    legacyIcon: 'ico-walk',
  },
  '6a859b002489ecc2e1afefb0': {
    name: 'Martial Arts',
    icon: 'activity',
    legacyIcon: 'ico-kendo',
  },
};
export function normalizeKind(
  k: DecodedKind,
  source: SourceIdentity,
  mapping: Mapping | null,
  add: AddIssue,
): KindCandidate {
  const profile = kindProfile[k.id];
  const choice = mapping?.kinds.find((m) => m.sourceId === k.id);
  const proposed: TargetMapping = {
    kind: profile?.name === 'Treadmill' ? null : (profile?.name ?? null),
    variant: profile?.name === 'Walking' ? 'Outdoor' : null,
    resolved: false,
  };
  if (!profile || profile.name !== k.name || profile.legacyIcon !== k.iconName)
    add(
      'error',
      'KIND_MAPPING_MISSING',
      'kindId',
      'Unknown or changed source kind; an explicit evidence-based mapping is required.',
    );
  else if (!choice?.targetKind)
    add(
      'error',
      'KIND_MAPPING_PENDING',
      'kindId',
      'Proposed kind/environment mapping is not approved.',
    );
  else {
    const compatible =
      k.name === 'Treadmill'
        ? (choice.targetKind === 'Treadmill' &&
            choice.targetVariant === null) ||
          (['Walking', 'Running'].includes(choice.targetKind) &&
            choice.targetVariant === 'Treadmill')
        : choice.targetKind === k.name &&
          (k.name === 'Walking'
            ? [null, 'Outdoor'].includes(choice.targetVariant)
            : choice.targetVariant === null);
    if (!compatible)
      add(
        'error',
        'KIND_MAPPING_UNSUPPORTED',
        'kindId',
        'Configured mapping is outside the documented Phase 5A choices.',
      );
    else
      Object.assign(proposed, {
        kind: choice.targetKind,
        variant: choice.targetVariant,
        resolved: true,
      });
  }
  if (!choice?.presentationApproved)
    add(
      'error',
      'KIND_PRESENTATION_PENDING',
      'iconName',
      'Supported icon, color and order defaults need approval.',
    );
  if (k.description && !choice?.descriptionLossApproved)
    add(
      'error',
      'KIND_DESCRIPTION_PENDING',
      'description',
      'Kind description has no destination column; explicit retention/loss policy required.',
    );
  if (k.updatedAt < k.createdAt)
    add(
      'error',
      'METADATA_ORDER_INVALID',
      'updatedAt',
      'Update timestamp precedes creation timestamp.',
    );
  return {
    source,
    target: proposed,
    iconName: profile?.icon ?? 'activity',
    color: '#64748B',
    sortOrder: Object.values(kindProfile)
      .map((p) => p.name)
      .sort()
      .indexOf(profile?.name ?? ''),
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
    archivedAt: null,
    primaryMeasurementDefinitionId: null,
  };
}
export interface Confirmations {
  owner: boolean;
  midnight: boolean;
}
const measurementSpec = {
  distance: {
    name: 'Distance',
    valueType: 'decimal',
    canonicalUnit: 'metre',
    displayUnit: 'kilometre',
    precision: 2,
  },
  ascent: {
    name: 'Ascent',
    valueType: 'decimal',
    canonicalUnit: 'metre',
    displayUnit: 'metre',
    precision: 0,
  },
  steps: {
    name: 'Steps',
    valueType: 'integer',
    canonicalUnit: 'count',
    displayUnit: 'count',
    precision: null,
  },
  calories: {
    name: 'Calories (kcal)',
    valueType: 'decimal',
    canonicalUnit: null,
    displayUnit: null,
    precision: 0,
  },
  avgHR: {
    name: 'Average heart rate (bpm)',
    valueType: 'integer',
    canonicalUnit: null,
    displayUnit: null,
    precision: null,
  },
  cadenceAvg: {
    name: 'Average cadence (spm)',
    valueType: 'integer',
    canonicalUnit: null,
    displayUnit: null,
    precision: null,
  },
} as const;
function canonicalDate(instant: string, zone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((v) => [v.type, v.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
export function normalizeActivity(
  a: DecodedActivity,
  source: SourceIdentity,
  kind: KindCandidate | undefined,
  mapping: Mapping | null,
  confirmed: Confirmations,
  add: AddIssue,
): ActivityCandidate {
  if (
    a.kindId === '6a859b002489ecc2e1afefaf' &&
    kind?.target.variant === 'Treadmill'
  )
    add(
      'warning',
      'TREADMILL_MANUAL_REVIEW',
      'kindId',
      'Provisional Walking/Treadmill assignment approved for manual review; preserve original title and notes.',
    );
  if (!confirmed.owner)
    add(
      'error',
      'OWNER_SCOPE_PENDING',
      'userId',
      'Owner inclusion has not been confirmed for these source bytes.',
    );
  else if (!a.ownerPresent)
    add(
      'warning',
      'OWNER_ABSENT_INCLUDED',
      'userId',
      'Missing owner marker included under explicit owner-scope confirmation.',
    );
  const candidate: ActivityCandidate = {
    source,
    sourceExternalId: `activities:${a.id}`,
    kindSourceId: a.kindId,
    target: kind?.target ?? { kind: null, variant: null, resolved: false },
    activityDate: null,
    startedAt: null,
    startResolved: false,
    durationSeconds: null,
    durationResolved: false,
    name: a.title || null,
    notes: a.notes || null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    measurements: [],
    tagIds: [],
    effort: null,
    feeling: null,
  };
  if (!kind)
    add(
      'error',
      'REFERENCE_BROKEN',
      'kindId',
      'Referenced kind is missing, invalid or ambiguous.',
    );
  else if (!kind.target.resolved)
    add(
      'error',
      'ACTIVITY_KIND_MAPPING_PENDING',
      'kindId',
      'Referenced kind/environment mapping is unresolved.',
    );
  if (a.when.endsWith('T00:00:00.000Z')) {
    if (confirmed.midnight) {
      candidate.activityDate = a.when.slice(0, 10);
      candidate.startResolved = true;
      add(
        'warning',
        'DATE_ONLY_START_OMITTED',
        'when',
        'Confirmed date-only record: calendar date preserved and start omitted.',
      );
    } else
      add(
        'error',
        'MIDNIGHT_POLICY_PENDING',
        'when',
        'Midnight precision is unconfirmed for this snapshot.',
      );
  } else if (mapping?.calendarTimezone) {
    candidate.activityDate = canonicalDate(a.when, mapping.calendarTimezone);
    candidate.startedAt = a.when;
    candidate.startResolved = true;
  } else
    add(
      'error',
      'CALENDAR_POLICY_PENDING',
      'when',
      'Select an explicit calendar timezone for nonmidnight records.',
    );
  if (a.updatedAt < a.createdAt)
    add(
      'error',
      'METADATA_ORDER_INVALID',
      'updatedAt',
      'Update timestamp precedes creation timestamp.',
    );
  const effective = { ...a.numbers };
  if (effective.ascent === undefined && effective.elevation !== undefined) {
    effective.ascent = effective.elevation;
    add(
      'warning',
      'ELEVATION_AS_ASCENT',
      'elevation',
      'Legacy elevation mapped to ascent once.',
    );
  } else if (
    effective.ascent !== undefined &&
    effective.elevation !== undefined
  ) {
    if (compare(decimal(effective.ascent), decimal(effective.elevation)) !== 0)
      add(
        'error',
        'ASCENT_CONFLICT',
        'elevation',
        'Ascent and elevation disagree; explicit resolution required.',
      );
    else
      add(
        'warning',
        'ASCENT_ALIAS_IGNORED',
        'elevation',
        'Equal elevation alias ignored; ascent counted once.',
      );
  }
  for (const field of [
    'duration',
    'distance',
    'ascent',
    'steps',
    'calories',
    'avgHR',
    'cadenceAvg',
  ] as const) {
    let value = effective[field];
    if (value === undefined) continue; // Missing is never zero.
    let resolved = true;
    const d = decimal(value);
    if (
      compare(d, decimal(0)) < 0 ||
      compare(d, decimal(Number.MAX_SAFE_INTEGER)) > 0 ||
      (['duration', 'steps', 'avgHR', 'cadenceAvg'].includes(field) &&
        d.scale !== 0)
    ) {
      add(
        'error',
        'NUMERIC_RANGE_INVALID',
        field,
        'Value violates nonnegative, safe magnitude or integer rules.',
      );
      continue;
    }
    if (value === '0') {
      const policy = mapping?.zeroPolicy[field];
      if (!policy) {
        add(
          'error',
          'ZERO_POLICY_PENDING',
          field,
          'Stored zero may mean unknown; field-level policy required.',
        );
        resolved = false;
      } else if (policy === 'omit') {
        if (field === 'duration') candidate.durationResolved = true;
        add(
          'warning',
          'ZERO_OMITTED',
          field,
          'Stored zero omitted under the explicit field policy.',
        );
        continue;
      }
    }
    if (field === 'duration') {
      if (resolved) {
        candidate.durationSeconds = Number(value);
        candidate.durationResolved = true;
      }
      continue;
    }
    const spec = measurementSpec[field];
    if (d.scale > (spec.precision ?? 0)) {
      const exception = mapping?.precisionExceptions.find(
        (e) => e.sourceId === a.id && e.field === field && e.from === value,
      );
      if (exception) {
        value = decimalString(decimal(exception.to));
        add(
          'warning',
          'PRECISION_EXCEPTION_APPLIED',
          field,
          'Exact source-ID/value exception applied in memory only.',
        );
      } else {
        add(
          'error',
          'NUMERIC_PRECISION_PENDING',
          field,
          'Value exceeds proposed canonical precision; no rounding is approved.',
        );
        resolved = false;
      }
    }
    if (
      ['calories', 'avgHR', 'cadenceAvg'].includes(field) &&
      !mapping?.unsupportedUnits
    ) {
      add(
        'error',
        'UNIT_MAPPING_PENDING',
        field,
        'Legacy unit has no registry entry; named unitless fallback is unapproved.',
      );
      resolved = false;
    }
    const measurement: MeasurementCandidate = {
      field,
      sourceField:
        field === 'ascent' && a.numbers.ascent === undefined
          ? 'elevation'
          : field,
      value,
      ...spec,
      resolved,
    };
    candidate.measurements.push(measurement);
    if (
      kind?.target.kind === 'Meditation' &&
      field === 'calories' &&
      value !== '0'
    )
      add(
        'warning',
        'UNUSUAL_VALUE_REVIEW',
        field,
        'Unusual but plausible measurement; no automatic correction.',
      );
  }
  return candidate;
}
