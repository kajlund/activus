import { randomUUID } from 'node:crypto';
import {
  ActivityKindSchema,
  ActivityKindListResponseSchema,
  ApiErrorResponseSchema,
} from '@activus/contracts';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import {
  FakeActivityKindRepository,
  validKind,
} from '../../../test/support/activity-kind-repository.js';

describe('activity-kind REST API (no TCP or database)', () => {
  let app: ReturnType<typeof createApp>;
  const base = '/api/v1/activity-kinds';
  beforeEach(() => {
    app = createApp(
      parseEnv({ NODE_ENV: 'production' }),
      pino({ level: 'silent' }),
      { activityKinds: new FakeActivityKindRepository() },
    );
  });
  const request = (path: string, method = 'GET', body?: unknown) =>
    app.request(`${base}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
  async function create(name = 'Walking') {
    const response = await request('', 'POST', { ...validKind, name });
    expect(response.status).toBe(201);
    const kind = ActivityKindSchema.parse(await response.json());
    expect(response.headers.get('Location')).toBe(`${base}/${kind.id}`);
    return kind;
  }
  async function expectError(response: Response, status: number, code: string) {
    expect(response.status).toBe(status);
    const result = ApiErrorResponseSchema.parse(await response.json());
    expect(result.error.code).toBe(code);
    expect(result.error.requestId).toBe(response.headers.get('X-Request-Id'));
  }

  it('creates, fetches and partially updates a kind', async () => {
    const kind = await create();
    const get = await request(`/${kind.id}`);
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual(kind);
    const update = await request(`/${kind.id}`, 'PATCH', {
      name: ' Hiking ',
      color: '#aabbcc',
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({
      id: kind.id,
      name: 'Hiking',
      color: '#AABBCC',
      iconName: kind.iconName,
      sortOrder: kind.sortOrder,
      createdAt: kind.createdAt,
    });
  });

  it('lists active kinds by default and archived kinds only explicitly', async () => {
    const one = await create('Walking');
    const two = await create('Cycling');
    const archived = await request(`/${one.id}/archive`, 'POST');
    expect(archived.status).toBe(200);
    const archivedBody: unknown = await archived.json();
    expect(await (await request(`/${one.id}/archive`, 'POST')).json()).toEqual(
      archivedBody,
    );
    expect(
      ActivityKindListResponseSchema.parse(await (await request('')).json())
        .items,
    ).toEqual([two]);
    expect(
      ActivityKindListResponseSchema.parse(
        await (await request('?includeArchived=false')).json(),
      ).items,
    ).toEqual([two]);
    const all = ActivityKindListResponseSchema.parse(
      await (await request('?includeArchived=true')).json(),
    );
    expect(all.items.map((kind) => kind.name)).toEqual(['Cycling', 'Walking']);
    expect(all.items[1]?.isArchived).toBe(true);
    expect((await request(`/${one.id}`)).status).toBe(200);
    const restore = await request(`/${one.id}/restore`, 'POST');
    expect(restore.status).toBe(200);
    const restored = ActivityKindSchema.parse(await restore.json());
    expect(restored.isArchived).toBe(false);
    expect(await (await request(`/${one.id}/restore`, 'POST')).json()).toEqual(
      restored,
    );
  });

  it.each([
    '?includeArchived=yes',
    '?includeArchived=',
    '?other=true',
    '?includeArchived=true&includeArchived=false',
  ])('rejects invalid query %s', async (query) => {
    await expectError(await request(query), 400, 'ACTIVITY_KIND_INVALID');
  });

  it.each([
    {},
    null,
    [],
    { ...validKind, name: ' ' },
    { ...validKind, color: '#123' },
    { ...validKind, sortOrder: -1 },
    { ...validKind, extra: true },
  ])('rejects invalid creation %o', async (body) => {
    await expectError(
      await request('', 'POST', body),
      400,
      'ACTIVITY_KIND_INVALID',
    );
  });

  it.each([
    {},
    { isArchived: true },
    { archivedAt: null },
    { name: '' },
    { sortOrder: 1.5 },
    { color: null },
  ])('rejects invalid PATCH %o', async (body) => {
    const row = await create();
    await expectError(
      await request(`/${row.id}`, 'PATCH', body),
      400,
      'ACTIVITY_KIND_INVALID',
    );
  });

  it('rejects malformed JSON and wrong content type', async () => {
    await expectError(
      await app.request(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
      400,
      'ACTIVITY_KIND_INVALID',
    );
    await expectError(
      await app.request(base, {
        method: 'POST',
        body: JSON.stringify(validKind),
      }),
      400,
      'ACTIVITY_KIND_INVALID',
    );
  });

  it.each([
    ['GET', ''],
    ['PATCH', ''],
    ['POST', '/archive'],
    ['POST', '/restore'],
  ])('handles missing and invalid IDs for %s %s', async (method, suffix) => {
    const body = method === 'PATCH' ? { name: 'Hiking' } : undefined;
    await expectError(
      await request(`/${randomUUID()}${suffix}`, method, body),
      404,
      'ACTIVITY_KIND_NOT_FOUND',
    );
    await expectError(
      await request(`/invalid${suffix}`, method, body),
      400,
      'ACTIVITY_KIND_INVALID',
    );
  });

  it('returns conflicts for create and rename, including archived names', async () => {
    const one = await create('Walking');
    const two = await create('Cycling');
    await expectError(
      await request('', 'POST', { ...validKind, name: 'walking' }),
      409,
      'ACTIVITY_KIND_NAME_CONFLICT',
    );
    await expectError(
      await request(`/${two.id}`, 'PATCH', { name: ' WALKING ' }),
      409,
      'ACTIVITY_KIND_NAME_CONFLICT',
    );
    await request(`/${one.id}/archive`, 'POST');
    await expectError(
      await request('', 'POST', { ...validKind, name: 'walking' }),
      409,
      'ACTIVITY_KIND_NAME_CONFLICT',
    );
  });

  it('does not expose a permanent deletion endpoint', async () => {
    const kind = await create();
    await expectError(await request(`/${kind.id}`, 'DELETE'), 404, 'NOT_FOUND');
    expect((await request(`/${kind.id}`)).status).toBe(200);
  });
});
