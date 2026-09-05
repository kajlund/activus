import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { pino } from 'pino';
import {
  TagSchema,
  TagListResponseSchema,
  ActivitySchema,
  ActivityListResponseSchema,
  ApiErrorResponseSchema,
} from '@activus/contracts';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { activityDoubles, validActivity } from './support/activities.js';
import { validKind } from './support/activity-kind-repository.js';
import { validMeasurement, validVariant } from './support/configuration.js';
let deps: ReturnType<typeof activityDoubles>;
let app: ReturnType<typeof createApp>;
let kindId: string;
const request = (path: string, method = 'GET', body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
const createActivity = (patch: Record<string, unknown> = {}) =>
  request('/activities', 'POST', {
    ...validActivity,
    activityKindId: kindId,
    ...patch,
  });
const createTag = async (name: string) =>
  TagSchema.parse(await (await request('/tags', 'POST', { name })).json());
async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = ApiErrorResponseSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(response.headers.get('X-Request-Id'));
}
beforeEach(async () => {
  deps = activityDoubles();
  kindId = (await deps.activityKinds.create(validKind)).id;
  app = createApp(
    parseEnv({ NODE_ENV: 'production' }),
    pino({ level: 'silent' }),
    deps,
  );
});
it('covers tag create/list/detail/update/archive/restore with historical name reservation', async () => {
  const response = await request('/tags', 'POST', {
    name: '  Commute ',
    color: '#aa12ff',
  });
  expect(response.status).toBe(201);
  const tag = TagSchema.parse(await response.json());
  expect(tag).toMatchObject({ name: 'Commute', color: '#AA12FF' });
  expect(response.headers.get('Location')).toBe(`/api/v1/tags/${tag.id}`);
  expect(await (await request(`/tags/${tag.id}`)).json()).toEqual(tag);
  expect(
    (await request(`/tags/${tag.id}`, 'PATCH', { color: null })).status,
  ).toBe(200);
  const archived = TagSchema.parse(
    await (await request(`/tags/${tag.id}/archive`, 'POST')).json(),
  );
  expect(archived.isArchived).toBe(true);
  expect(
    await (await request(`/tags/${tag.id}/archive`, 'POST')).json(),
  ).toEqual(archived);
  expect(
    TagListResponseSchema.parse(await (await request('/tags')).json()).items,
  ).toEqual([]);
  expect(
    TagListResponseSchema.parse(
      await (await request('/tags?includeArchived=true')).json(),
    ).items,
  ).toEqual([archived]);
  await error(
    await request('/tags', 'POST', { name: 'COMMUTE' }),
    409,
    'TAG_NAME_CONFLICT',
  );
  const restored = TagSchema.parse(
    await (await request(`/tags/${tag.id}/restore`, 'POST')).json(),
  );
  expect(restored.isArchived).toBe(false);
  expect(
    await (await request(`/tags/${tag.id}/restore`, 'POST')).json(),
  ).toEqual(restored);
  await error(await request(`/tags/${tag.id}`, 'DELETE'), 404, 'NOT_FOUND');
});
it('orders alphabetically and searches names without implicit wildcard semantics', async () => {
  for (const name of ['Zulu', 'alpha', 'Beta', '100%_ recovery'])
    await createTag(name);
  expect(
    TagListResponseSchema.parse(
      await (await request('/tags')).json(),
    ).items.map((t) => t.name),
  ).toEqual(['100%_ recovery', 'alpha', 'Beta', 'Zulu']);
  expect(
    TagListResponseSchema.parse(
      await (await request('/tags?search=RECOVERY')).json(),
    ).items,
  ).toHaveLength(1);
  expect(
    TagListResponseSchema.parse(
      await (await request('/tags?search=%25_')).json(),
    ).items,
  ).toHaveLength(1);
});
it.each([
  { name: '' },
  { name: ' ' },
  { name: 'x'.repeat(121) },
  { name: 'x', color: 'red' },
  { name: 'x', color: '#123' },
  { name: 'x', isArchived: true },
  { name: 'x', activityKindId: randomUUID() },
])('rejects invalid tag bodies %o', async (body) => {
  await error(await request('/tags', 'POST', body), 400, 'TAG_INVALID');
});
it.each(['GET', 'PATCH', 'archive', 'restore'])(
  'rejects malformed/missing tag IDs for %s',
  async (operation) => {
    for (const id of ['bad', randomUUID()]) {
      const suffix = ['archive', 'restore'].includes(operation)
        ? `/${operation}`
        : '';
      const method = suffix ? 'POST' : operation;
      await error(
        await request(
          `/tags/${id}${suffix}`,
          method,
          method === 'PATCH' ? { name: 'x' } : undefined,
        ),
        id === 'bad' ? 400 : 404,
        id === 'bad' ? 'TAG_INVALID' : 'TAG_NOT_FOUND',
      );
    }
  },
);
it.each([
  'includeArchived=maybe',
  'includeArchived=true&includeArchived=false',
  'search=',
  'sort=name',
  `search=${'a'.repeat(121)}`,
])('rejects invalid tag query %s', async (q) => {
  await error(await request(`/tags?${q}`), 400, 'TAG_INVALID');
});
it('rejects empty PATCH and rename conflicts', async () => {
  const a = await createTag('Race');
  await createTag('Recovery');
  await error(await request(`/tags/${a.id}`, 'PATCH', {}), 400, 'TAG_INVALID');
  await error(
    await request(`/tags/${a.id}`, 'PATCH', { name: 'RECOVERY' }),
    409,
    'TAG_NAME_CONFLICT',
  );
});
it('creates activities with ordered tags and independently edits tags and values', async () => {
  const a = await createTag('Race');
  const b = await createTag('Commute');
  const d = await deps.measurements.create(kindId, validMeasurement);
  const m = { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' };
  const response = await createActivity({
    tagIds: [a.id, b.id],
    measurements: [m],
  });
  expect(response.status).toBe(201);
  const activity = ActivitySchema.parse(await response.json());
  expect(activity.tags.map((t) => t.name)).toEqual(['Commute', 'Race']);
  expect(
    ActivitySchema.parse(
      await (await request(`/activities/${activity.id}`)).json(),
    ).tags,
  ).toEqual(activity.tags);
  expect(
    ActivityListResponseSchema.parse(
      await (await request('/activities')).json(),
    ).items[0]?.tags,
  ).toEqual(activity.tags);
  const tagChange = ActivitySchema.parse(
    await (
      await request(`/activities/${activity.id}`, 'PATCH', { tagIds: [a.id] })
    ).json(),
  );
  expect(tagChange.measurements).toEqual(activity.measurements);
  const valueChange = ActivitySchema.parse(
    await (
      await request(`/activities/${activity.id}`, 'PATCH', {
        measurements: [{ ...m, value: '2' }],
      })
    ).json(),
  );
  expect(valueChange.tags).toEqual(tagChange.tags);
  expect(
    ActivitySchema.parse(
      await (
        await request(`/activities/${activity.id}`, 'PATCH', { tagIds: [] })
      ).json(),
    ).tags,
  ).toEqual([]);
});
it('rejects invalid assignments and preserves the aggregate on a failed update', async () => {
  const a = await createTag('Race');
  const activity = ActivitySchema.parse(
    await (await createActivity({ tagIds: [a.id] })).json(),
  );
  await error(
    await createActivity({ tagIds: [a.id, a.id.toUpperCase()] }),
    400,
    'ACTIVITY_TAG_DUPLICATE',
  );
  await error(
    await createActivity({ tagIds: ['Race'] }),
    400,
    'ACTIVITY_TAG_INVALID',
  );
  await error(
    await createActivity({ tagIds: [a.id, randomUUID()] }),
    404,
    'TAG_NOT_FOUND',
  );
  await error(
    await request(`/activities/${activity.id}`, 'PATCH', {
      name: 'Must not persist',
      tagIds: [randomUUID()],
    }),
    404,
    'TAG_NOT_FOUND',
  );
  expect(await (await request(`/activities/${activity.id}`)).json()).toEqual(
    activity,
  );
  expect(deps.rows.size).toBe(1);
});
it('retains archived history implicitly and explicitly but forbids new archived assignments', async () => {
  const a = await createTag('Race');
  const activity = ActivitySchema.parse(
    await (await createActivity({ tagIds: [a.id] })).json(),
  );
  await request(`/tags/${a.id}/archive`, 'POST');
  for (const patch of [{ notes: 'History' }, { tagIds: [a.id] }]) {
    const response = await request(
      `/activities/${activity.id}`,
      'PATCH',
      patch,
    );
    expect(response.status).toBe(200);
    expect(
      ActivitySchema.parse(await response.json()).tags[0]?.isArchived,
    ).toBe(true);
  }
  await error(await createActivity({ tagIds: [a.id] }), 409, 'TAG_ARCHIVED');
  await request(`/activities/${activity.id}`, 'PATCH', { tagIds: [] });
  await error(
    await request(`/activities/${activity.id}`, 'PATCH', { tagIds: [a.id] }),
    409,
    'TAG_ARCHIVED',
  );
});
it('filters any/all and combines tags with date, variant, search, partial and pagination', async () => {
  const a = await createTag('Race');
  const b = await createTag('Recovery');
  const v = await deps.variants.create(kindId, validVariant);
  const first = ActivitySchema.parse(
    await (
      await createActivity({
        tagIds: [a.id, b.id],
        activityVariantId: v.id,
        name: 'First',
        isPartial: true,
      })
    ).json(),
  );
  const second = ActivitySchema.parse(
    await (
      await createActivity({ tagIds: [a.id], activityDate: '2024-02-28' })
    ).json(),
  );
  const base = `/activities?tagIds=${a.id},${b.id}`;
  expect(
    ActivityListResponseSchema.parse(
      await (await request(base)).json(),
    ).items.map((a) => a.id),
  ).toEqual([first.id, second.id]);
  expect(
    ActivityListResponseSchema.parse(
      await (await request(`${base}&tagMatch=all`)).json(),
    ).items.map((a) => a.id),
  ).toEqual([first.id]);
  const combined = `${base}&dateFrom=2024-02-29&dateTo=2024-02-29&activityKindId=${kindId}&activityVariantId=${v.id}&search=FIRST&isPartial=true&limit=1&offset=0`;
  const page = ActivityListResponseSchema.parse(
    await (await request(combined)).json(),
  );
  expect(page.items.map((a) => a.id)).toEqual([first.id]);
  expect(page.pagination.hasMore).toBe(false);
  await request(`/tags/${b.id}/archive`, 'POST');
  expect(
    ActivityListResponseSchema.parse(
      await (await request(`${base}&tagMatch=all`)).json(),
    ).items[0]?.tags.some((t) => t.isArchived),
  ).toBe(true);
  await error(
    await request(`/activities?tagIds=${randomUUID()}`),
    404,
    'TAG_NOT_FOUND',
  );
});
it.each([
  'tagMatch=any',
  'tagIds=',
  'tagIds=bad',
  `tagIds=${randomUUID()},`,
  `tagIds=${randomUUID()}&tagMatch=none`,
  `tagIds=${randomUUID()}&tagIds=${randomUUID()}`,
])('rejects invalid tag filters %s', async (q) => {
  await error(await request(`/activities?${q}`), 400, 'ACTIVITY_INVALID');
});
it('rejects duplicate filter IDs including mixed-case UUIDs', async () => {
  const id = randomUUID();
  await error(
    await request(`/activities?tagIds=${id},${id.toUpperCase()}`),
    400,
    'ACTIVITY_INVALID',
  );
});
