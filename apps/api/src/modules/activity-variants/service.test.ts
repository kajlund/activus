import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../errors.js';
import { VariantService } from './service.js';
import {
  configurationDoubles,
  validVariant,
} from '../../../test/support/configuration.js';
import { validKind } from '../../../test/support/activity-kind-repository.js';

let deps: ReturnType<typeof configurationDoubles>;
let service: VariantService;
let kindId: string;
beforeEach(async () => {
  deps = configurationDoubles();
  service = new VariantService(deps.variants, deps.activityKinds);
  kindId = (await deps.activityKinds.create(validKind)).id;
});
it('normalizes names, preserves scope and deterministic order', async () => {
  await service.create(kindId, {
    ...validVariant,
    name: ' Zulu ',
    sortOrder: 1,
  });
  await service.create(kindId, { ...validVariant, name: ' Beta ' });
  await service.create(kindId, { ...validVariant, name: ' Alpha ' });
  expect((await service.list(kindId, false)).items.map((v) => v.name)).toEqual([
    'Alpha',
    'Beta',
    'Zulu',
  ]);
  await expect(
    service.create(kindId, { ...validVariant, name: 'alpha' }),
  ).rejects.toMatchObject({ code: 'ACTIVITY_VARIANT_NAME_CONFLICT' });
});
it('replaces and explicitly clears defaults, and archiving clears the default', async () => {
  const first = await service.create(kindId, {
    ...validVariant,
    isDefault: true,
  });
  const second = await service.create(kindId, {
    ...validVariant,
    name: 'Indoor',
    isDefault: true,
  });
  expect((await service.get(first.id)).isDefault).toBe(false);
  expect((await service.update(first.id, { isDefault: true })).isDefault).toBe(
    true,
  );
  expect((await service.get(second.id)).isDefault).toBe(false);
  expect((await service.update(first.id, { isDefault: false })).isDefault).toBe(
    false,
  );
  await service.update(first.id, { isDefault: true });
  const archived = await service.archive(first.id);
  expect(archived).toMatchObject({ isArchived: true, isDefault: false });
  expect(await service.archive(first.id)).toEqual(archived);
  const restored = await service.restore(first.id);
  expect(restored).toMatchObject({ isArchived: false, isDefault: false });
  expect(await service.restore(first.id)).toEqual(restored);
});
it('rejects new/default/restored variants under archived parents and never moves ownership', async () => {
  const variant = await service.create(kindId, validVariant);
  await service.archive(variant.id);
  await deps.activityKinds.setArchived(kindId, true);
  await expect(service.create(kindId, validVariant)).rejects.toMatchObject({
    code: 'ACTIVITY_KIND_ARCHIVED',
  });
  await expect(service.restore(variant.id)).rejects.toMatchObject({
    code: 'ACTIVITY_KIND_ARCHIVED',
  });
  await expect(
    service.update(variant.id, { isDefault: true }),
  ).rejects.toMatchObject({ code: 'ACTIVITY_KIND_ARCHIVED' });
  await expect(
    service.update(variant.id, { activityKindId: kindId }),
  ).rejects.toMatchObject({ code: 'ACTIVITY_VARIANT_INVALID' });
});
it('preserves repository restore conflicts', async () => {
  const variant = await service.create(kindId, validVariant);
  await service.archive(variant.id);
  vi.spyOn(deps.variants, 'setArchived').mockRejectedValue(
    new ApiError(409, 'ACTIVITY_VARIANT_NAME_CONFLICT', 'Reserved'),
  );
  await expect(service.restore(variant.id)).rejects.toMatchObject({
    status: 409,
    code: 'ACTIVITY_VARIANT_NAME_CONFLICT',
  });
});
