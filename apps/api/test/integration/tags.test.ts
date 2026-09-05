import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { eq, inArray, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { pino } from 'pino';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ActivityListQuerySchema, ActivitySchema } from '@activus/contracts';
import { loadRootEnv } from '../../src/config/load-env.js';
import { parseEnv } from '../../src/config/env.js';
import { createDatabase } from '../../src/db/client.js';
import {
  activities,
  activityMeasurements,
  activityKinds,
  measurementDefinitions,
  tags,
  activityTags,
} from '../../src/db/schema.js';
import { createActivityKindRepository } from '../../src/modules/activity-kinds/repository.js';
import { createMeasurementRepository } from '../../src/modules/measurement-definitions/repository.js';
import { createActivityRepository } from '../../src/modules/activities/repository.js';
import { createTagRepository } from '../../src/modules/tags/repository.js';
import { TagService } from '../../src/modules/tags/service.js';
import { ActivityService } from '../../src/modules/activities/service.js';
import { createApp } from '../../src/app.js';
import { testDatabaseConfig } from '../support/test-database-config.js';
import { validKind } from '../support/activity-kind-repository.js';
import { validMeasurement } from '../support/configuration.js';
import { validActivity } from '../support/activities.js';
loadRootEnv();
const env = parseEnv(process.env);
const safe = env.TEST_DATABASE_URL ? testDatabaseConfig(env) : undefined;
describe.skipIf(!safe)('PostgreSQL tags and activity assignments', () => {
  let database: ReturnType<typeof createDatabase>;
  let repository: ReturnType<typeof createActivityRepository>;
  let tagRepository: ReturnType<typeof createTagRepository>;
  let tagService: TagService;
  let service: ActivityService;
  let kindId: string;
  const ownedKinds: string[] = [];
  const ownedTags: string[] = [];
  const create = (patch: Record<string, unknown> = {}) =>
    service.create({ ...validActivity, activityKindId: kindId, ...patch });
  async function tag(name = randomUUID()) {
    const row = await tagService.create({ name });
    ownedTags.push(row.id);
    return row;
  }
  const list = (q: Record<string, string> = {}) =>
    service.list(
      ActivityListQuerySchema.parse({ activityKindId: kindId, ...q }),
    );
  beforeAll(async () => {
    if (!safe) throw new Error('Missing safe test database');
    database = createDatabase(safe, pino({ level: 'silent' }));
    await database.open();
    const result = await database.db.execute(
      sql`SELECT current_database() AS database, current_user AS username, r.rolsuper, r.rolcreatedb, r.rolcreaterole FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const identity = result.rows[0];
    if (
      !identity ||
      identity.database !==
        decodeURIComponent(new URL(safe.DATABASE_URL).pathname.slice(1)) ||
      identity.username !== 'activus_test' ||
      identity.rolsuper ||
      identity.rolcreatedb ||
      identity.rolcreaterole
    )
      throw new Error(
        'Refusing to migrate: test database identity/role guard failed',
      );
    await migrate(database.db, {
      migrationsFolder: fileURLToPath(
        new URL('../../../../drizzle', import.meta.url),
      ),
    });
    repository = createActivityRepository(database.db);
    tagRepository = createTagRepository(database.db);
    service = new ActivityService(repository);
    tagService = new TagService(tagRepository);
  });
  beforeEach(async () => {
    kindId = (
      await createActivityKindRepository(database.db).create({
        ...validKind,
        name: randomUUID(),
      })
    ).id;
    ownedKinds.push(kindId);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (!database) return;
    // Delete only this suite's generated identities, with activity-owned join cascade.
    if (ownedKinds.length) {
      await database.db
        .delete(activities)
        .where(inArray(activities.activityKindId, ownedKinds));
      await database.db
        .delete(measurementDefinitions)
        .where(inArray(measurementDefinitions.activityKindId, ownedKinds));
      await database.db
        .delete(activityKinds)
        .where(inArray(activityKinds.id, ownedKinds));
    }
    if (ownedTags.length)
      await database.db.delete(tags).where(inArray(tags.id, ownedTags));
    ownedKinds.length = 0;
    ownedTags.length = 0;
  });
  afterAll(async () => {
    if (database) await database.close();
  });
  it('protects case-insensitive names against direct concurrent inserts', async () => {
    const name = randomUUID();
    const outcomes = await Promise.allSettled(
      [name, name.toUpperCase()].map(async (name) => {
        const row = (
          await database.db.insert(tags).values({ name }).returning()
        )[0]!;
        ownedTags.push(row.id);
        return row;
      }),
    );
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { cause: { constraint: 'tags_name_unique' } },
    });
  });
  it('reserves archived names and restores idempotently without name reuse conflicts', async () => {
    const a = await tag();
    const archived = await tagService.archive(a.id);
    expect(await tagService.archive(a.id)).toEqual(archived);
    await expect(
      tagService.create({ name: a.name.toUpperCase() }),
    ).rejects.toMatchObject({ code: 'TAG_NAME_CONFLICT' });
    const b = await tag();
    await expect(
      tagService.update(b.id, { name: a.name.toUpperCase() }),
    ).rejects.toMatchObject({ code: 'TAG_NAME_CONFLICT' });
    const restored = await tagService.restore(a.id);
    expect(await tagService.restore(a.id)).toEqual(restored);
    expect(restored.isArchived).toBe(false);
  });
  it.each([
    { name: ' ' },
    { name: ' x' },
    { name: 'x'.repeat(121) },
    { name: 'Valid', color: '#aabbcc' },
    { name: 'Valid', color: 'red' },
  ])('enforces direct database normalization checks %o', async (input) => {
    await expect(database.db.insert(tags).values(input)).rejects.toMatchObject({
      cause: { code: '23514' },
    });
  });
  it('orders by normalized name and searches literal wildcard characters', async () => {
    const prefix = randomUUID();
    for (const name of ['Zulu', 'alpha', 'Beta', '100%_'])
      await tag(`${prefix} ${name}`);
    const result = await tagRepository.list({
      includeArchived: false,
      search: prefix,
    });
    expect(result.map((r) => r.name.slice(prefix.length + 1))).toEqual([
      '100%_',
      'alpha',
      'Beta',
      'Zulu',
    ]);
    expect(
      await tagRepository.list({
        includeArchived: false,
        search: `${prefix} 100%_`,
      }),
    ).toHaveLength(1);
    expect(
      await tagRepository.list({
        includeArchived: false,
        search: "' OR 1=1 --",
      }),
    ).toEqual([]);
  });
  it('enforces join uniqueness, foreign keys and restrictive tag deletion', async () => {
    const t = await tag();
    const a = await create({ tagIds: [t.id] });
    await expect(
      database.db
        .insert(activityTags)
        .values({ activityId: a.id, tagId: t.id }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    await expect(
      database.db
        .insert(activityTags)
        .values({ activityId: a.id, tagId: randomUUID() }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await expect(
      database.db
        .insert(activityTags)
        .values({ activityId: randomUUID(), tagId: t.id }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await expect(
      database.db.delete(tags).where(eq(tags.id, t.id)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await service.delete(a.id);
    expect(
      await database.db
        .select()
        .from(activityTags)
        .where(eq(activityTags.activityId, a.id)),
    ).toEqual([]);
    expect(await tagRepository.find(t.id)).toBeDefined();
  });
  it('preserves archived joins and permits explicit historical preservation', async () => {
    const t = await tag();
    const a = await create({ tagIds: [t.id] });
    const before = await database.db
      .select()
      .from(activityTags)
      .where(eq(activityTags.activityId, a.id));
    await tagService.archive(t.id);
    expect((await service.get(a.id)).tags[0]?.isArchived).toBe(true);
    await service.update(a.id, { tagIds: [t.id], notes: 'Corrected' });
    expect(
      await database.db
        .select()
        .from(activityTags)
        .where(eq(activityTags.activityId, a.id)),
    ).toEqual(before);
    await expect(create({ tagIds: [t.id] })).rejects.toMatchObject({
      code: 'TAG_ARCHIVED',
    });
    await tagService.restore(t.id);
    expect((await service.get(a.id)).tags[0]?.isArchived).toBe(false);
    expect(
      await database.db
        .select()
        .from(activityTags)
        .where(eq(activityTags.activityId, a.id)),
    ).toEqual(before);
  });
  it('persists nothing on invalid create and rolls back a late tag persistence failure', async () => {
    const t = await tag();
    const d = await createMeasurementRepository(database.db).create(
      kindId,
      validMeasurement,
    );
    const m = {
      measurementDefinitionId: d.id,
      valueType: 'decimal',
      value: '1',
    };
    await expect(
      create({ tagIds: [t.id, randomUUID()], measurements: [m] }),
    ).rejects.toMatchObject({ code: 'TAG_NOT_FOUND' });
    expect(
      await database.db
        .select()
        .from(activities)
        .where(eq(activities.activityKindId, kindId)),
    ).toEqual([]);
    const a = await create({ tagIds: [t.id], measurements: [m] });
    // Inject a persistence failure after both common fields and values have been written.
    await expect(
      repository.write(a.id, undefined, ({ existing }) => ({
        fields: { ...existing!.activity, name: 'Should roll back' },
        measurements: [
          {
            measurementDefinitionId: d.id,
            numericValue: '2',
            integerValue: null,
            booleanValue: null,
            textValue: null,
          },
        ],
        tagIds: [randomUUID()],
      })),
    ).rejects.toBeDefined();
    expect(await service.get(a.id)).toEqual(a);
    expect(
      (
        await database.db
          .select()
          .from(activityMeasurements)
          .where(eq(activityMeasurements.activityId, a.id))
      )[0]?.numericValue,
    ).toBe('1');
  });
  it('serializes concurrent independent tag and measurement patches', async () => {
    const t = await tag();
    const d = await createMeasurementRepository(database.db).create(
      kindId,
      validMeasurement,
    );
    const a = await create({
      measurements: [
        { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' },
      ],
    });
    await Promise.all([
      service.update(a.id, { tagIds: [t.id] }),
      service.update(a.id, {
        measurements: [
          { measurementDefinitionId: d.id, valueType: 'decimal', value: '2' },
        ],
      }),
    ]);
    const result = await service.get(a.id);
    expect(result.tags.map((r) => r.id)).toEqual([t.id]);
    expect(result.measurements[0]?.canonicalValue).toBe('2');
  });
  it('coordinates archive with assignments through tag row locks', async () => {
    const t = await tag();
    const outcomes = await Promise.allSettled([
      create({ tagIds: [t.id] }),
      tagService.archive(t.id),
    ]);
    expect(outcomes[1]?.status).toBe('fulfilled');
    if (outcomes[0]?.status === 'fulfilled')
      expect(
        (await service.get(outcomes[0].value.id)).tags[0]?.isArchived,
      ).toBe(true);
    else
      expect(outcomes[0]).toMatchObject({ reason: { code: 'TAG_ARCHIVED' } });
    await expect(create({ tagIds: [t.id] })).rejects.toMatchObject({
      code: 'TAG_ARCHIVED',
    });
  });
  it('filters any/all on distinct activities with archived tags and existing filters', async () => {
    const a = await tag();
    const b = await tag();
    const c = await tag();
    const both = await create({
      tagIds: [a.id, b.id],
      name: 'Trail',
      isPartial: true,
      activityDate: '2024-03-03',
    });
    const one = await create({ tagIds: [a.id], activityDate: '2024-03-02' });
    await create({ tagIds: [c.id] });
    const q = { tagIds: `${a.id},${b.id}` };
    expect((await list(q)).items.map((a) => a.id)).toEqual([both.id, one.id]);
    expect(
      (await list({ ...q, tagMatch: 'all' })).items.map((a) => a.id),
    ).toEqual([both.id]);
    const first = await list({ ...q, limit: '1' });
    expect(first.items.map((a) => a.id)).toEqual([both.id]);
    expect(first.pagination).toMatchObject({ hasMore: true, nextOffset: 1 });
    const second = await list({ ...q, limit: '1', offset: '1' });
    expect(second.items.map((a) => a.id)).toEqual([one.id]);
    expect(second.pagination.hasMore).toBe(false);
    await tagService.archive(b.id);
    expect(
      (
        await list({
          ...q,
          tagMatch: 'all',
          search: 'TRAIL',
          dateFrom: '2024-03-03',
          dateTo: '2024-03-03',
          isPartial: 'true',
        })
      ).items.map((a) => a.id),
    ).toEqual([both.id]);
    await expect(list({ tagIds: randomUUID() })).rejects.toMatchObject({
      code: 'TAG_NOT_FOUND',
    });
  });
  it('batch-loads tags with a fixed SELECT count independent of page size', async () => {
    const t = await tag();
    for (let i = 0; i < 5; i++) await create({ tagIds: [t.id] });
    const spy = vi.spyOn(pg.Client.prototype, 'query');
    function selects() {
      return (spy.mock.calls as unknown as [unknown][])
        .map(([arg]) =>
          typeof arg === 'string'
            ? arg
            : arg && typeof arg === 'object' && 'text' in arg
              ? String(arg.text)
              : '',
        )
        .filter((q) => /^select\b/i.test(q.trimStart()));
    }
    await list({ limit: '1' });
    expect(selects()).toHaveLength(3);
    spy.mockClear();
    await list({ limit: '100' });
    expect(selects()).toHaveLength(3);
    spy.mockClear();
    await list({ tagIds: t.id, tagMatch: 'all' });
    const queries = selects();
    expect(queries).toHaveLength(4);
    expect(queries.some((q) => q.includes('count(*)'))).toBe(true);
  });
  it('runs activity/tag replacement and failed writes through the real Hono app', async () => {
    const t = await tag();
    const app = createApp(env, pino({ level: 'silent' }), {
      activities: repository,
      tags: tagRepository,
    });
    const request = (path: string, method: string, body: unknown) =>
      app.request(`/api/v1${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const response = await request('/activities', 'POST', {
      ...validActivity,
      activityKindId: kindId,
      tagIds: [t.id],
    });
    expect(response.status).toBe(201);
    const a = ActivitySchema.parse(await response.json());
    expect(
      (
        await request(`/activities/${a.id}`, 'PATCH', {
          name: 'Invalid',
          tagIds: [randomUUID()],
        })
      ).status,
    ).toBe(404);
    expect(await service.get(a.id)).toEqual(a);
    const updated = await request(`/activities/${a.id}`, 'PATCH', {
      tagIds: [],
    });
    expect(updated.status).toBe(200);
    expect(ActivitySchema.parse(await updated.json()).tags).toEqual([]);
  });
});
