import { expect, it } from 'vitest';
import {
  normalizeActivity,
  normalizeKind,
} from '../src/modules/legacy-import/mapping.js';
import type { Mapping } from '../src/modules/legacy-import/package.js';
import type {
  DecodedActivity,
  Issue,
} from '../src/modules/legacy-import/types.js';

const kindId = '6a859b002489ecc2e1afefa9';
const mapping: Mapping = {
  version: 1,
  calendarTimezone: 'Europe/Helsinki',
  midnightDateOnly: true,
  zeroPolicy: {
    distance: 'omit',
    duration: 'omit',
    ascent: 'omit',
    calories: 'omit',
    steps: 'omit',
    avgHR: 'omit',
    cadenceAvg: 'omit',
  },
  unsupportedUnits: 'named-unitless',
  kinds: [
    {
      sourceId: kindId,
      targetKind: 'Walking',
      targetVariant: 'Outdoor',
      presentationApproved: true,
      descriptionLossApproved: true,
    },
  ],
  precisionExceptions: [
    {
      sourceId: '6a85a86fd22d3159d3bd2537',
      field: 'distance',
      from: '4030.0000000000005',
      to: '4030',
    },
  ],
};
function candidate(patch: Partial<DecodedActivity> = {}) {
  const a: DecodedActivity = {
    id: '000000000000000000000001',
    kindId,
    ownerPresent: false,
    when: '2026-01-02T22:30:00.000Z',
    title: ' Test ',
    notes: ' Private fixture ',
    createdAt: '2026-01-03T10:00:00.000Z',
    updatedAt: '2026-01-03T10:00:00.000Z',
    numbers: { distance: '1250', duration: '600', calories: '0' },
    ...patch,
  };
  const identity = {
    system: 'legacy-activus-mongodb' as const,
    datasetId: 'test',
    collection: 'activities' as const,
    id: a.id,
  };
  const kind = normalizeKind(
    {
      id: kindId,
      name: 'Walking',
      iconName: 'ico-walk',
      legacyKindId: 'old',
      description: '',
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    },
    { ...identity, collection: 'kinds', id: kindId },
    mapping,
    () => {},
  );
  const issues: Pick<Issue, 'code' | 'severity'>[] = [];
  const result = normalizeActivity(
    a,
    identity,
    kind,
    mapping,
    { owner: true, midnight: true },
    (severity, code) => issues.push({ severity, code }),
  );
  return { result, issues };
}
it('uses Helsinki calendar rollover while preserving the UTC instant', () => {
  const { result, issues } = candidate();
  expect(result.activityDate).toBe('2026-01-03');
  expect(result.startedAt).toBe('2026-01-02T22:30:00.000Z');
  expect(issues.some((i) => i.severity === 'error')).toBe(false);
});
it('preserves a confirmed midnight date with no invented start', () => {
  const { result } = candidate({ when: '2026-01-02T00:00:00.000Z' });
  expect(result.activityDate).toBe('2026-01-02');
  expect(result.startedAt).toBeNull();
});
it('omits zeros and absent measurements and uses the ascent alias only once', () => {
  const { result } = candidate({
    numbers: {
      distance: '0',
      duration: '0',
      calories: '0',
      ascent: '10',
      elevation: '10',
      avgHR: '0',
    },
  });
  expect(result.durationSeconds).toBeNull();
  expect(
    result.measurements.map((m) => [m.field, m.sourceField, m.value]),
  ).toEqual([['ascent', 'ascent', '10']]);
  expect(
    candidate({
      numbers: {
        distance: '0',
        duration: '0',
        calories: '0',
        ascent: '0',
        elevation: '0',
      },
    }).result.measurements,
  ).toEqual([]);
  expect(
    candidate({ numbers: { elevation: '12' } }).result.measurements[0]
      ?.sourceField,
  ).toBe('elevation');
});
it('corrects only the approved source ID and exact distance value', () => {
  const patch = { numbers: { distance: '4030.0000000000005' } };
  const corrected = candidate({ ...patch, id: '6a85a86fd22d3159d3bd2537' });
  expect(corrected.result.measurements[0]?.value).toBe('4030');
  expect(corrected.issues).toContainEqual({
    severity: 'warning',
    code: 'PRECISION_EXCEPTION_APPLIED',
  });
  const other = candidate(patch);
  expect(other.result.measurements[0]?.value).toBe('4030.0000000000005');
  expect(other.issues).toContainEqual({
    severity: 'error',
    code: 'NUMERIC_PRECISION_PENDING',
  });
});
