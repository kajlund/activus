import { beforeEach, expect, it } from 'vitest';
import { MeasurementService } from './service.js';
import { ActivityKindService } from '../activity-kinds/service.js';
import {
  configurationDoubles,
  validMeasurement,
  validVariant,
} from '../../../test/support/configuration.js';
import { validKind } from '../../../test/support/activity-kind-repository.js';

let deps: ReturnType<typeof configurationDoubles>;
let service: MeasurementService;
let kindId: string;
beforeEach(async () => {
  deps = configurationDoubles();
  service = new MeasurementService(
    deps.measurements,
    deps.activityKinds,
    deps.variants,
  );
  kindId = (await deps.activityKinds.create(validKind)).id;
});
it('validates merged PATCH data and preserves omitted fields', async () => {
  const row = await service.create(kindId, {
    ...validMeasurement,
    name: ' Distance ',
  });
  expect(row.name).toBe('Distance');
  await expect(
    service.update(row.id, { valueType: 'boolean' }),
  ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_INVALID' });
  expect((await service.update(row.id, { name: 'Length' })).displayUnit).toBe(
    'kilometre',
  );
  await expect(
    service.update(row.id, { activityVariantId: null }),
  ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_INVALID' });
});
it('validates ownership and marks effective inheritance explicitly', async () => {
  const variant = await deps.variants.create(kindId, validVariant);
  const otherKind = await deps.activityKinds.create({
    ...validKind,
    name: 'Cycling',
  });
  await expect(
    service.create(otherKind.id, {
      ...validMeasurement,
      activityVariantId: variant.id,
    }),
  ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_VARIANT_MISMATCH' });
  await service.create(kindId, validMeasurement);
  await expect(
    service.create(kindId, {
      ...validMeasurement,
      activityVariantId: variant.id,
      name: 'distance',
    }),
  ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_NAME_CONFLICT' });
  await service.create(kindId, {
    ...validMeasurement,
    activityVariantId: variant.id,
    name: 'Elevation',
  });
  const view = await service.list(kindId, {
    includeArchived: false,
    effective: true,
    activityVariantId: variant.id,
  });
  expect(view.view).toBe('effective');
  if (view.view === 'effective')
    expect(view.items.map((m) => [m.name, m.source])).toEqual([
      ['Distance', 'inherited'],
      ['Elevation', 'variant-specific'],
    ]);
});
it('archives/restores idempotently, reserves names and rejects archived parents', async () => {
  const row = await service.create(kindId, validMeasurement);
  const archived = await service.archive(row.id);
  expect(await service.archive(row.id)).toEqual(archived);
  await expect(service.create(kindId, validMeasurement)).rejects.toMatchObject({
    code: 'MEASUREMENT_DEFINITION_NAME_CONFLICT',
  });
  expect(
    (await service.list(kindId, { includeArchived: false, effective: false }))
      .items,
  ).toEqual([]);
  expect(
    (await service.list(kindId, { includeArchived: true, effective: false }))
      .items,
  ).toHaveLength(1);
  const restored = await service.restore(row.id);
  expect(await service.restore(row.id)).toEqual(restored);
  await service.archive(row.id);
  await deps.activityKinds.setArchived(kindId, true);
  await expect(service.restore(row.id)).rejects.toMatchObject({
    code: 'ACTIVITY_KIND_ARCHIVED',
  });
  await expect(
    service.create(kindId, { ...validMeasurement, name: 'New' }),
  ).rejects.toMatchObject({ code: 'ACTIVITY_KIND_ARCHIVED' });
});
it('rejects creation/restoration on archived variants', async () => {
  const variant = await deps.variants.create(kindId, validVariant);
  const row = await service.create(kindId, {
    ...validMeasurement,
    activityVariantId: variant.id,
  });
  await service.archive(row.id);
  await deps.variants.setArchived(variant.id, true);
  await expect(service.restore(row.id)).rejects.toMatchObject({
    code: 'ACTIVITY_VARIANT_ARCHIVED',
  });
  await expect(
    service.create(kindId, {
      ...validMeasurement,
      activityVariantId: variant.id,
      name: 'New',
    }),
  ).rejects.toMatchObject({ code: 'ACTIVITY_VARIANT_ARCHIVED' });
});
it('selects/clears an eligible primary and rejects archiving it until cleared', async () => {
  const kinds = new ActivityKindService(deps.activityKinds, deps.measurements);
  const row = await service.create(kindId, validMeasurement);
  expect(
    (await kinds.update(kindId, { primaryMeasurementDefinitionId: row.id }))
      .primaryMeasurementDefinitionId,
  ).toBe(row.id);
  await expect(service.archive(row.id)).rejects.toMatchObject({
    code: 'MEASUREMENT_DEFINITION_IS_PRIMARY',
  });
  await kinds.update(kindId, { primaryMeasurementDefinitionId: null });
  await service.archive(row.id);
  await expect(
    kinds.update(kindId, { primaryMeasurementDefinitionId: row.id }),
  ).rejects.toMatchObject({ code: 'PRIMARY_MEASUREMENT_INVALID' });
});
