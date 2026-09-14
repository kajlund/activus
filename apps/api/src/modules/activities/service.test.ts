import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import {
  ActivityDateSchema,
  ActivityListQuerySchema,
  type ActivityMeasurementInput,
} from '@activus/contracts';
import { ActivityService } from './service.js';
import {
  activityDoubles,
  validActivity,
} from '../../../test/support/activities.js';
import { validKind } from '../../../test/support/activity-kind-repository.js';
import {
  validMeasurement,
  validVariant,
} from '../../../test/support/configuration.js';
let deps: ReturnType<typeof activityDoubles>;
let service: ActivityService;
let kindId: string;
beforeEach(async () => {
  deps = activityDoubles();
  service = new ActivityService(deps.activities);
  kindId = (await deps.activityKinds.create(validKind)).id;
});
const create = (patch: Record<string, unknown> = {}) =>
  service.create({ ...validActivity, activityKindId: kindId, ...patch });
it('preserves imported source identity during an ordinary edit without duplicating the activity', async () => {
  const activity = await create();
  const row = deps.rows.get(activity.id)!;
  row.source = 'legacy-activus-mongodb:sanitized-test';
  row.sourceExternalId = 'activities:000000000000000000000001';
  const edited = await service.update(activity.id, {
    name: 'Reviewed fixture',
  });
  expect(edited.name).toBe('Reviewed fixture');
  expect(deps.rows.size).toBe(1);
  expect(deps.rows.get(activity.id)).toMatchObject({
    id: activity.id,
    source: row.source,
    sourceExternalId: row.sourceExternalId,
  });
});
it('keeps journal date independent of time, normalizes text and defaults partial to false', async () => {
  const a = await create({
    startedAt: '2024-03-01T00:30:00+02:00',
    name: '  Walk ',
    notes: ' \n ',
  });
  expect(a).toMatchObject({
    activityDate: '2024-02-29',
    startedAt: '2024-02-29T22:30:00.000Z',
    name: 'Walk',
    notes: null,
    isPartial: false,
  });
});
it.each([
  '2023-02-29',
  '2024-04-31',
  '2024-1-01',
  '0000-01-01',
  '2024-01-01T00:00:00Z',
])('rejects invalid journal date %s', (d) =>
  expect(ActivityDateSchema.safeParse(d).success).toBe(false),
);
it('requires parent and selected variant definitions unless explicitly partial', async () => {
  const v = await deps.variants.create(kindId, validVariant);
  const p = await deps.measurements.create(kindId, {
    ...validMeasurement,
    isRequired: true,
  });
  const child = await deps.measurements.create(kindId, {
    ...validMeasurement,
    name: 'Extra',
    activityVariantId: v.id,
    isRequired: true,
  });
  await expect(create()).rejects.toMatchObject({
    code: 'ACTIVITY_REQUIRED_MEASUREMENT_MISSING',
    details: { missingDefinitionIds: [p.id] },
  });
  await expect(create({ activityVariantId: v.id })).rejects.toMatchObject({
    details: { missingDefinitionIds: [p.id, child.id] },
  });
  expect((await create({ isPartial: true })).isPartial).toBe(true);
  expect(deps.rows.size).toBe(1);
});
it('validates duplicates, ownership, type, units, range and precision before saving', async () => {
  const d = await deps.measurements.create(kindId, validMeasurement);
  const m = {
    measurementDefinitionId: d.id,
    valueType: 'decimal',
    value: '1.23',
    unitId: 'kilometre',
  };
  const a = await create({ measurements: [m] });
  expect(a.measurements[0]).toMatchObject({
    canonicalValue: '1230',
    displayValue: '1.23',
    canonicalUnit: 'metre',
  });
  for (const [measurements, code] of [
    [[m, m], 'ACTIVITY_MEASUREMENT_DUPLICATE'],
    [
      [{ ...m, measurementDefinitionId: randomUUID() }],
      'ACTIVITY_MEASUREMENT_NOT_EFFECTIVE',
    ],
    [
      [{ ...m, valueType: 'integer', value: 1 }],
      'ACTIVITY_MEASUREMENT_TYPE_MISMATCH',
    ],
    [[{ ...m, unitId: 'kilogram' }], 'ACTIVITY_MEASUREMENT_UNIT_MISMATCH'],
    [[{ ...m, value: '-1' }], 'ACTIVITY_MEASUREMENT_VALUE_INVALID'],
    [
      [{ ...m, value: '0.000001', unitId: 'metre' }],
      'ACTIVITY_MEASUREMENT_VALUE_INVALID',
    ],
  ] as const)
    await expect(create({ measurements })).rejects.toMatchObject({ code });
  expect(deps.rows.size).toBe(1);
});
it.each(['integer', 'duration', 'rating', 'boolean', 'text'] as const)(
  'validates and returns %s values',
  async (valueType) => {
    const d = await deps.measurements.create(kindId, {
      ...validMeasurement,
      valueType,
      canonicalUnit: valueType === 'duration' ? 'second' : null,
      displayUnit: valueType === 'duration' ? 'minute' : null,
      precision: null,
      minimumValue: valueType === 'rating' ? 1 : null,
      maximumValue: valueType === 'rating' ? 5 : null,
      aggregation: 'none',
      personalBestDirection: 'none',
    });
    const value =
      valueType === 'boolean'
        ? false
        : valueType === 'text'
          ? '  Smooth  '
          : valueType === 'duration'
            ? 120
            : 3;
    const a = await create({
      measurements: [
        {
          measurementDefinitionId: d.id,
          valueType,
          value,
          ...(valueType === 'duration' ? { unitId: 'second' } : {}),
        },
      ],
    });
    expect(a.measurements[0]?.canonicalValue).toBe(
      valueType === 'text' ? 'Smooth' : value,
    );
  },
);
it('preserves omitted values, replaces explicitly, and empty text removes', async () => {
  const d = await deps.measurements.create(kindId, {
    ...validMeasurement,
    valueType: 'text',
    canonicalUnit: null,
    displayUnit: null,
    precision: null,
    minimumValue: null,
    aggregation: 'none',
    personalBestDirection: 'none',
  });
  const m: ActivityMeasurementInput = {
    measurementDefinitionId: d.id,
    valueType: 'text',
    value: 'Smooth',
  };
  const a = await create({ measurements: [m] });
  expect((await service.update(a.id, { notes: 'fixed' })).measurements).toEqual(
    a.measurements,
  );
  expect(
    (await service.update(a.id, { measurements: [{ ...m, value: ' ' }] }))
      .measurements,
  ).toEqual([]);
});
it('requires explicit compatible replacement on kind/variant change', async () => {
  const d = await deps.measurements.create(kindId, validMeasurement);
  const m = { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' };
  const a = await create({ measurements: [m] });
  const other = await deps.activityKinds.create({
    ...validKind,
    name: 'Other',
  });
  await expect(
    service.update(a.id, { activityKindId: other.id }),
  ).rejects.toMatchObject({
    status: 409,
    code: 'ACTIVITY_MEASUREMENTS_REQUIRED_FOR_KIND_CHANGE',
    details: { incompatibleDefinitionIds: [d.id] },
  });
  await expect(
    service.update(a.id, { activityKindId: other.id, measurements: [m] }),
  ).rejects.toMatchObject({
    status: 409,
    code: 'ACTIVITY_MEASUREMENTS_INCOMPATIBLE',
  });
  expect(
    (await service.update(a.id, { activityKindId: other.id, measurements: [] }))
      .measurements,
  ).toEqual([]);
});
it('permits archived historical corrections but rejects new archived references', async () => {
  const v = await deps.variants.create(kindId, validVariant);
  const d = await deps.measurements.create(kindId, validMeasurement);
  const m = { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' };
  const a = await create({ activityVariantId: v.id, measurements: [m] });
  const empty = await create();
  await deps.measurements.setArchived(d.id, true);
  await expect(
    service.update(empty.id, { measurements: [m] }),
  ).rejects.toMatchObject({ code: 'ACTIVITY_ARCHIVED_MEASUREMENT_ADDITION' });
  await deps.variants.setArchived(v.id, true);
  await deps.activityKinds.setArchived(kindId, true);
  const updated = await service.update(a.id, {
    name: 'Corrected',
    measurements: [{ ...m, value: '2' }],
  });
  expect(updated.kind.isArchived).toBe(true);
  expect(updated.variant?.isArchived).toBe(true);
  expect(updated.measurements[0]).toMatchObject({
    canonicalValue: '2',
    isArchived: true,
  });
  await expect(create()).rejects.toMatchObject({
    code: 'ACTIVITY_KIND_ARCHIVED',
  });
  expect(
    (await service.update(a.id, { measurements: [] })).measurements,
  ).toHaveLength(0);
});
it('selects primary measurement or duration fallback without duplicating duration', async () => {
  const d = await deps.measurements.create(kindId, validMeasurement);
  await create({
    durationSeconds: 123,
    measurements: [
      { measurementDefinitionId: d.id, valueType: 'decimal', value: '2' },
    ],
  });
  const q = ActivityListQuerySchema.parse({});
  expect((await service.list(q)).items[0]?.fallback).toEqual({
    type: 'duration',
    durationSeconds: 123,
  });
  await deps.activityKinds.update(kindId, {
    primaryMeasurementDefinitionId: d.id,
  });
  expect(
    (await service.list(q)).items[0]?.primaryMeasurement?.canonicalValue,
  ).toBe('2');
});
it.each([{}, { source: 'x' }, { sourceExternalId: 'x' }])(
  'rejects invalid PATCH %o',
  async (input) => {
    const a = await create();
    await expect(service.update(a.id, input)).rejects.toMatchObject({
      status: 400,
    });
  },
);
it('revalidates completeness on replacement and explicit completion', async () => {
  const d = await deps.measurements.create(kindId, {
    ...validMeasurement,
    isRequired: true,
  });
  const a = await create({ isPartial: true });
  await expect(
    service.update(a.id, { isPartial: false }),
  ).rejects.toMatchObject({ code: 'ACTIVITY_REQUIRED_MEASUREMENT_MISSING' });
  const complete = await service.update(a.id, {
    isPartial: false,
    measurements: [
      { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' },
    ],
  });
  expect(complete.isPartial).toBe(false);
  await expect(
    service.update(a.id, { measurements: [] }),
  ).rejects.toMatchObject({ code: 'ACTIVITY_REQUIRED_MEASUREMENT_MISSING' });
  await deps.measurements.setArchived(d.id, true);
  expect(
    (await service.update(a.id, { measurements: [] })).measurements,
  ).toEqual([]);
});
it('preserves compatible parent values on explicit variant changes and orders parents first', async () => {
  const v = await deps.variants.create(kindId, validVariant);
  const p = await deps.measurements.create(kindId, {
    ...validMeasurement,
    name: 'Zulu',
    sortOrder: 99,
  });
  const child = await deps.measurements.create(kindId, {
    ...validMeasurement,
    name: 'Alpha',
    activityVariantId: v.id,
  });
  const m = { measurementDefinitionId: p.id, valueType: 'decimal', value: '1' };
  const a = await create({ measurements: [m] });
  await expect(
    service.update(a.id, { activityVariantId: v.id }),
  ).rejects.toMatchObject({ details: { incompatibleDefinitionIds: [] } });
  const b = await service.update(a.id, {
    activityVariantId: v.id,
    measurements: [m, { ...m, measurementDefinitionId: child.id }],
  });
  expect(b.measurements.map((v) => v.source)).toEqual([
    'inherited',
    'variant-specific',
  ]);
  await expect(
    service.update(a.id, {
      activityVariantId: null,
      measurements: [m, { ...m, measurementDefinitionId: child.id }],
    }),
  ).rejects.toMatchObject({ code: 'ACTIVITY_MEASUREMENTS_INCOMPATIBLE' });
});
