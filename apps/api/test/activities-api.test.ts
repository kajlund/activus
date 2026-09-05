import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { pino } from 'pino';
import {
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
const request = (path = '', method = 'GET', body?: unknown) =>
  app.request(`/api/v1/activities${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
const create = (patch: Record<string, unknown> = {}) =>
  request('', 'POST', { ...validActivity, activityKindId: kindId, ...patch });
async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = ApiErrorResponseSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(response.headers.get('X-Request-Id'));
  return body.error;
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
it('creates, reads, corrects and permanently deletes an activity', async () => {
  const response = await create({ name: ' Walk ', notes: ' Notes ' });
  expect(response.status).toBe(201);
  const a = ActivitySchema.parse(await response.json());
  expect(response.headers.get('Location')).toBe(`/api/v1/activities/${a.id}`);
  expect(await (await request(`/${a.id}`)).json()).toEqual(a);
  const patch = await request(`/${a.id}`, 'PATCH', { name: null });
  expect(patch.status).toBe(200);
  expect(await patch.json()).toMatchObject({ name: null, notes: 'Notes' });
  const deleted = await request(`/${a.id}`, 'DELETE');
  expect(deleted.status).toBe(204);
  expect(await deleted.text()).toBe('');
  await error(await request(`/${a.id}`), 404, 'ACTIVITY_NOT_FOUND');
  await error(await request(`/${a.id}`, 'DELETE'), 404, 'ACTIVITY_NOT_FOUND');
});
it('enforces completeness and allows explicit partial records', async () => {
  await deps.measurements.create(kindId, {
    ...validMeasurement,
    isRequired: true,
  });
  await error(await create(), 400, 'ACTIVITY_REQUIRED_MEASUREMENT_MISSING');
  expect((await create({ isPartial: true })).status).toBe(201);
});
it('replaces measurements atomically and returns structured change conflicts', async () => {
  const d = await deps.measurements.create(kindId, validMeasurement);
  const m = {
    measurementDefinitionId: d.id,
    valueType: 'decimal',
    value: '123.45',
  };
  const a = ActivitySchema.parse(
    await (await create({ measurements: [m] })).json(),
  );
  const other = await deps.activityKinds.create({
    ...validKind,
    name: 'Other',
  });
  const conflict = await error(
    await request(`/${a.id}`, 'PATCH', { activityKindId: other.id }),
    409,
    'ACTIVITY_MEASUREMENTS_REQUIRED_FOR_KIND_CHANGE',
  );
  expect(conflict.details?.incompatibleDefinitionIds).toEqual([d.id]);
  await error(
    await request(`/${a.id}`, 'PATCH', {
      activityKindId: other.id,
      measurements: [m],
    }),
    409,
    'ACTIVITY_MEASUREMENTS_INCOMPATIBLE',
  );
  await error(
    await request(`/${a.id}`, 'PATCH', {
      name: 'Should not persist',
      measurements: [{ ...m, unitId: 'kilogram' }],
    }),
    400,
    'ACTIVITY_MEASUREMENT_UNIT_MISMATCH',
  );
  expect(await (await request(`/${a.id}`)).json()).toEqual(a);
  const replacement = await request(`/${a.id}`, 'PATCH', {
    activityKindId: other.id,
    measurements: [],
  });
  expect(replacement.status).toBe(200);
  expect(await replacement.json()).toMatchObject({
    activityKindId: other.id,
    measurements: [],
  });
});
it('lists all filters and load-more metadata without exposing notes', async () => {
  const v = await deps.variants.create(kindId, validVariant);
  await create({ activityDate: '2024-01-01', name: 'First', notes: 'PRIVATE' });
  await create({
    activityDate: '2024-01-02',
    activityVariantId: v.id,
    notes: 'A literal 100%_ trail',
    isPartial: true,
  });
  await create({ activityDate: '2024-01-03', name: 'Third' });
  const page = ActivityListResponseSchema.parse(
    await (await request('?limit=1')).json(),
  );
  expect(page.items[0]?.name).toBe('Third');
  expect(page.pagination).toEqual({
    limit: 1,
    offset: 0,
    hasMore: true,
    nextOffset: 1,
  });
  for (const query of [
    `dateFrom=2024-01-02&dateTo=2024-01-02`,
    `activityVariantId=${v.id}`,
    `isPartial=true`,
    `search=100%25_`,
    `activityKindId=${kindId}&offset=1&limit=1`,
  ]) {
    const r = ActivityListResponseSchema.parse(
      await (await request(`?${query}`)).json(),
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      activityDate: '2024-01-02',
      hasNotes: true,
    });
    expect(r.items[0]).not.toHaveProperty('notes');
  }
});
it.each([
  'limit=0',
  'limit=101',
  'offset=-1',
  'offset=1.2',
  'limit=2&limit=3',
  'dateFrom=2024-02-30',
  'dateFrom=2024-02-02&dateTo=2024-01-01',
  'isPartial=yes',
  'order=name',
  'search=',
  'activityKindId=bad',
])('rejects invalid query %s', async (q) => {
  await error(await request(`?${q}`), 400, 'ACTIVITY_INVALID');
});
it.each(['GET', 'PATCH', 'DELETE'])(
  'rejects invalid/missing IDs on %s',
  async (method) => {
    await error(
      await request(
        '/bad',
        method,
        method === 'PATCH' ? { name: 'x' } : undefined,
      ),
      400,
      'ACTIVITY_INVALID',
    );
    await error(
      await request(
        `/${randomUUID()}`,
        method,
        method === 'PATCH' ? { name: 'x' } : undefined,
      ),
      404,
      'ACTIVITY_NOT_FOUND',
    );
  },
);
it.each([
  { durationSeconds: -1 },
  { effort: 6 },
  { feeling: 0 },
  { activityDate: '2023-02-29' },
  { unknown: true },
  { measurements: [{ measurementDefinitionId: 'bad' }] },
])('rejects invalid create %o', async (patch) => {
  await error(await create(patch), 400, 'ACTIVITY_INVALID');
});
it('rejects missing/archived parents and incompatible variants', async () => {
  await error(
    await create({ activityKindId: randomUUID() }),
    404,
    'ACTIVITY_KIND_NOT_FOUND',
  );
  await error(
    await create({ activityVariantId: randomUUID() }),
    400,
    'ACTIVITY_VARIANT_KIND_MISMATCH',
  );
  const v = await deps.variants.create(kindId, validVariant);
  await deps.variants.setArchived(v.id, true);
  await error(
    await create({ activityVariantId: v.id }),
    409,
    'ACTIVITY_VARIANT_ARCHIVED',
  );
  await deps.activityKinds.setArchived(kindId, true);
  await error(await create(), 409, 'ACTIVITY_KIND_ARCHIVED');
});
it('corrects archived values and forbids new additions', async () => {
  const d = await deps.measurements.create(kindId, validMeasurement);
  const m = { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' };
  const a = ActivitySchema.parse(
    await (await create({ measurements: [m] })).json(),
  );
  await deps.measurements.setArchived(d.id, true);
  await error(
    await create({ measurements: [m] }),
    409,
    'ACTIVITY_ARCHIVED_MEASUREMENT_ADDITION',
  );
  const r = await request(`/${a.id}`, 'PATCH', {
    measurements: [{ ...m, value: '2' }],
  });
  expect(r.status).toBe(200);
  expect(ActivitySchema.parse(await r.json()).measurements[0]).toMatchObject({
    isArchived: true,
    canonicalValue: '2',
  });
});
it('rejects empty PATCH, malformed JSON and source identity', async () => {
  const a = ActivitySchema.parse(await (await create()).json());
  await error(await request(`/${a.id}`, 'PATCH', {}), 400, 'ACTIVITY_INVALID');
  await error(
    await create({ source: 'legacy', sourceExternalId: '123' }),
    400,
    'ACTIVITY_SOURCE_IDENTITY_FORBIDDEN',
  );
  await error(
    await request(`/${a.id}`, 'PATCH', { sourceExternalId: '123' }),
    400,
    'ACTIVITY_SOURCE_IDENTITY_FORBIDDEN',
  );
  await error(
    await app.request('/api/v1/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }),
    400,
    'ACTIVITY_INVALID',
  );
});
