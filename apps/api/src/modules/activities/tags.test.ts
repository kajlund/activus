import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { ActivityListQuerySchema } from '@activus/contracts';
import { ActivityService } from './service.js';
import {
  activityDoubles,
  validActivity,
} from '../../../test/support/activities.js';
import { validKind } from '../../../test/support/activity-kind-repository.js';
import { validMeasurement } from '../../../test/support/configuration.js';
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
const tag = (name: string) => deps.tags.create({ name, color: null });
it('defaults to no tags and rejects duplicates after UUID normalization', async () => {
  expect((await create()).tags).toEqual([]);
  const t = await tag('Race');
  await expect(
    create({ tagIds: [t.id, t.id.toUpperCase()] }),
  ).rejects.toMatchObject({ code: 'ACTIVITY_TAG_DUPLICATE' });
  expect(deps.rows.size).toBe(1);
});
it.each([
  { tagIds: ['bad'] },
  { tagIds: null },
  { tagIds: 'Commute' },
  { tagIds: Array.from({ length: 101 }, () => randomUUID()) },
])('rejects malformed or oversized tag IDs %o', async (input) => {
  await expect(create(input)).rejects.toMatchObject({
    code: 'ACTIVITY_TAG_INVALID',
  });
});
it('rejects unknown and newly archived assignments without persisting anything', async () => {
  const t = await tag('Race');
  await deps.tags.setArchived(t.id, true);
  await expect(create({ tagIds: [t.id] })).rejects.toMatchObject({
    code: 'TAG_ARCHIVED',
  });
  await expect(create({ tagIds: [randomUUID()] })).rejects.toMatchObject({
    code: 'TAG_NOT_FOUND',
  });
  expect(deps.rows.size).toBe(0);
});
it('preserves omitted tags/measurements and independently replaces each complete set', async () => {
  const t = await tag('Race');
  const b = await tag('Recovery');
  const d = await deps.measurements.create(kindId, validMeasurement);
  const m = { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' };
  const a = await create({ tagIds: [t.id], measurements: [m] });
  const tagChange = await service.update(a.id, { tagIds: [b.id] });
  expect(tagChange.measurements).toEqual(a.measurements);
  expect(tagChange.tags.map((t) => t.id)).toEqual([b.id]);
  const valueChange = await service.update(a.id, {
    measurements: [{ ...m, value: '2' }],
  });
  expect(valueChange.tags).toEqual(tagChange.tags);
  expect((await service.update(a.id, { tagIds: [] })).tags).toEqual([]);
});
it('preserves historical archived tags explicitly or by omission, but cannot re-add after removal', async () => {
  const t = await tag('Race');
  const a = await create({ tagIds: [t.id] });
  await deps.tags.setArchived(t.id, true);
  expect(
    (await service.update(a.id, { notes: 'Historical' })).tags[0]?.isArchived,
  ).toBe(true);
  expect(
    (await service.update(a.id, { tagIds: [t.id] })).tags[0]?.isArchived,
  ).toBe(true);
  await service.update(a.id, { tagIds: [] });
  await expect(service.update(a.id, { tagIds: [t.id] })).rejects.toMatchObject({
    code: 'TAG_ARCHIVED',
  });
});
it('filters any/all, includes archived tags and paginates distinct activities', async () => {
  const a = await tag('alpha');
  const b = await tag('Beta');
  const both = await create({
    activityDate: '2024-03-03',
    tagIds: [b.id, a.id],
  });
  const one = await create({ activityDate: '2024-03-02', tagIds: [a.id] });
  await create();
  await deps.tags.setArchived(b.id, true);
  const q = { tagIds: `${a.id},${b.id}` };
  expect(
    (await service.list(ActivityListQuerySchema.parse(q))).items.map(
      (a) => a.id,
    ),
  ).toEqual([both.id, one.id]);
  const all = await service.list(
    ActivityListQuerySchema.parse({ ...q, tagMatch: 'all' }),
  );
  expect(all.items.map((a) => a.id)).toEqual([both.id]);
  expect(all.items[0]?.tags.map((t) => t.name)).toEqual(['alpha', 'Beta']);
  expect(
    (await service.list(ActivityListQuerySchema.parse({ ...q, limit: '1' })))
      .pagination,
  ).toMatchObject({ hasMore: true, nextOffset: 1 });
  await expect(
    service.list(ActivityListQuerySchema.parse({ tagIds: randomUUID() })),
  ).rejects.toMatchObject({ code: 'TAG_NOT_FOUND' });
});
