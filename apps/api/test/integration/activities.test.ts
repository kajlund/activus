import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../src/db/schema.js';
import { fileURLToPath } from 'node:url';
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
} from 'vitest';
import { ActivityListQuerySchema, ActivitySchema } from '@activus/contracts';
import { loadRootEnv } from '../../src/config/load-env.js';
import { parseEnv } from '../../src/config/env.js';
import { createDatabase } from '../../src/db/client.js';
import {
  activities,
  activityMeasurements,
  activityKinds,
  activityVariants,
  measurementDefinitions,
} from '../../src/db/schema.js';
import { createActivityKindRepository } from '../../src/modules/activity-kinds/repository.js';
import { createVariantRepository } from '../../src/modules/activity-variants/repository.js';
import { createMeasurementRepository } from '../../src/modules/measurement-definitions/repository.js';
import { createActivityRepository } from '../../src/modules/activities/repository.js';
import { ActivityService } from '../../src/modules/activities/service.js';
import { createApp } from '../../src/app.js';
import { fieldsOf } from '../../src/modules/measurement-definitions/mapper.js';
import { testDatabaseConfig } from '../support/test-database-config.js';
import { validKind } from '../support/activity-kind-repository.js';
import { validMeasurement, validVariant } from '../support/configuration.js';
import { validActivity } from '../support/activities.js';
import { goals, goalTags, tags, activityTags } from '../../src/db/schema.js';
import { createGoalRepository } from '../../src/modules/goals/repository.js';
import { createGoalProgressRepository } from '../../src/modules/goals/progress-repository.js';
import { GoalService } from '../../src/modules/goals/service.js';
import { GoalProgressService } from '../../src/modules/goals/progress-service.js';
import {
  GoalOverviewResponseSchema,
  GoalContributionsResponseSchema,
  GoalDetailSchema,
  GoalPeriodsResponseSchema,
} from '@activus/contracts';
loadRootEnv();
const env = parseEnv(process.env);
const safe = env.TEST_DATABASE_URL ? testDatabaseConfig(env) : undefined;
describe.skipIf(!safe)('PostgreSQL activities and typed measurements', () => {
  let database: ReturnType<typeof createDatabase>;
  let kinds: ReturnType<typeof createActivityKindRepository>;
  let variants: ReturnType<typeof createVariantRepository>;
  let definitions: ReturnType<typeof createMeasurementRepository>;
  let repository: ReturnType<typeof createActivityRepository>;
  let service: ActivityService;
  let kindId: string;
  const ownedKinds: string[] = [];
  async function newKind() {
    const k = await kinds.create({ ...validKind, name: randomUUID() });
    ownedKinds.push(k.id);
    return k.id;
  }
  const create = (patch: Record<string, unknown> = {}) =>
    service.create({ ...validActivity, activityKindId: kindId, ...patch });
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
    kinds = createActivityKindRepository(database.db);
    variants = createVariantRepository(database.db);
    definitions = createMeasurementRepository(database.db);
    repository = createActivityRepository(database.db);
    service = new ActivityService(repository);
  });
  beforeEach(async () => {
    kindId = await newKind();
  });
  afterEach(async () => {
    if (!database || !ownedKinds.length) return;
    await database.db
      .delete(goals)
      .where(inArray(goals.activityKindId, ownedKinds));
    // Only records owned by this suite's generated kind IDs. Never truncate/drop.
    await database.db
      .delete(activities)
      .where(inArray(activities.activityKindId, ownedKinds));
    await database.db
      .update(activityKinds)
      .set({ primaryMeasurementDefinitionId: null })
      .where(inArray(activityKinds.id, ownedKinds));
    await database.db
      .delete(measurementDefinitions)
      .where(inArray(measurementDefinitions.activityKindId, ownedKinds));
    await database.db
      .delete(activityVariants)
      .where(inArray(activityVariants.activityKindId, ownedKinds));
    await database.db
      .delete(activityKinds)
      .where(inArray(activityKinds.id, ownedKinds));
    ownedKinds.length = 0;
  });
  afterAll(async () => {
    if (database) await database.close();
  });
  it('paginates qualifying goal activities using the same scope as exact progress, retaining missing and archived values', async () => {
    const variant = await variants.create(kindId, validVariant);
    const measurement = await definitions.create(kindId, {
      ...validMeasurement,
      precision: 6,
    });
    const tagRows = await database.db
      .insert(tags)
      .values([
        { name: randomUUID(), color: '#67318F' },
        { name: randomUUID(), color: '#67318F' },
      ])
      .returning();
    const tagIds = tagRows.map((t) => t.id);
    const goalRepository = createGoalRepository(database.db);
    const goalService = new GoalService(goalRepository);
    const goalProgress = createGoalProgressRepository(database.db);
    const app = createApp(env, pino({ level: 'silent' }), {
      goals: goalRepository,
      goalProgress,
    });
    try {
      const common = {
        activityVariantId: variant.id,
        tagIds,
        activityDate: '2000-01-04',
        durationSeconds: 60,
      };
      const exact = await create({
        ...common,
        measurements: [
          {
            measurementDefinitionId: measurement.id,
            valueType: 'decimal',
            value: '2.500125',
            unitId: 'kilometre',
          },
        ],
      });
      const zero = await create({
        ...common,
        measurements: [
          {
            measurementDefinitionId: measurement.id,
            valueType: 'decimal',
            value: '0',
            unitId: 'kilometre',
          },
        ],
      });
      const missing = await create({ ...common });
      // Exclude the wrong variant, missing required tag, date, and kind.
      await create({ ...common, activityVariantId: null });
      await create({ ...common, tagIds: tagIds.slice(0, 1) });
      await create({ ...common, activityDate: '1999-12-31' });
      await create({
        ...common,
        activityKindId: await newKind(),
        activityVariantId: null,
      });
      const definition = {
        name: 'Qualifying distance',
        activityKindId: kindId,
        activityVariantId: variant.id,
        tagIds,
        targetType: 'measurement_total',
        targetValue: '5000',
        measurementDefinitionId: measurement.id,
        scheduleMode: 'fixed',
        startDate: '2000-01-01',
        endDate: '2000-01-31',
      };
      const fixed = await goalService.create(definition);
      const get = (path: string) =>
        app.request(`/api/v1/goals/${fixed.id}${path}`);
      const firstResponse = await get('/contributions?limit=2');
      expect(firstResponse.status).toBe(200);
      const first = GoalContributionsResponseSchema.parse(
        await firstResponse.json(),
      );
      const second = GoalContributionsResponseSchema.parse(
        await (await get('/contributions?limit=2&offset=2')).json(),
      );
      const all = [...first.items, ...second.items];
      expect(all.map((i) => i.activity.id)).toEqual([
        missing.id,
        zero.id,
        exact.id,
      ]);
      expect(new Set(all.map((i) => i.activity.id)).size).toBe(3);
      expect(all.map((i) => i.canonicalContribution)).toEqual([
        null,
        '0',
        '2500.125',
      ]);
      expect(all[2]?.displayContribution).toBe('2.500125');
      expect(first.pagination.nextOffset).toBe(2);
      expect(second.pagination.hasMore).toBe(false);
      const detail = GoalDetailSchema.parse(
        await (await get('/detail')).json(),
      );
      expect(detail.progress).toMatchObject({
        currentValue: '2500.125',
        remainingValue: '2499.875',
      });
      const count = await goalService.create({
        ...definition,
        name: 'Count',
        targetType: 'activity_count',
        targetValue: 3,
        measurementDefinitionId: null,
      });
      const countProgress = await new GoalProgressService(
        goalRepository,
        goalProgress,
      ).get(count.id, {});
      expect(countProgress).toMatchObject({
        currentValue: '3',
        achieved: true,
      });
      const recurring = await goalService.create({
        ...definition,
        scheduleMode: 'recurring',
        recurrencePeriod: 'week',
      });
      const periodResponse = await app.request(
        `/api/v1/goals/${recurring.id}/periods?limit=2`,
      );
      expect(periodResponse.status).toBe(200);
      const periods = GoalPeriodsResponseSchema.parse(
        await periodResponse.json(),
      );
      expect(periods.items).toHaveLength(2);
      expect(periods.nextBefore).toBe('2000-01-23');
      const clipped = GoalContributionsResponseSchema.parse(
        await (
          await app.request(
            `/api/v1/goals/${recurring.id}/contributions?period=2000-01-01`,
          )
        ).json(),
      );
      expect(clipped.endDate).toBe('2000-01-02');
      expect(clipped.items).toHaveLength(0);
      expect(
        (
          await app.request(
            `/api/v1/goals/${recurring.id}/contributions?period=2000-01-04`,
          )
        ).status,
      ).toBe(400);
      expect((await get('/contributions?limit=101')).status).toBe(400);
      await goalService.archive(fixed.id);
      await database.db
        .update(measurementDefinitions)
        .set({ archivedAt: new Date() })
        .where(eq(measurementDefinitions.id, measurement.id));
      await database.db
        .update(activityVariants)
        .set({ archivedAt: new Date() })
        .where(eq(activityVariants.id, variant.id));
      await database.db
        .update(tags)
        .set({ archivedAt: new Date() })
        .where(inArray(tags.id, tagIds));
      const archived = GoalDetailSchema.parse(
        await (await get('/detail')).json(),
      );
      expect(archived.goal.isArchived).toBe(true);
      expect(archived.archivedReferences).toContain('Distance');
      const historical = GoalContributionsResponseSchema.parse(
        await (await get('/contributions')).json(),
      );
      expect(historical.items[0]?.activity.variant?.isArchived).toBe(true);
      expect(historical.items[2]?.displayContribution).toBe('2.500125');
    } finally {
      await database.db.delete(goalTags).where(inArray(goalTags.tagId, tagIds));
      await database.db
        .delete(activityTags)
        .where(inArray(activityTags.tagId, tagIds));
      await database.db.delete(tags).where(inArray(tags.id, tagIds));
    }
  });
  it('loads compact goal overview progress without multiplying activities by required tags', async () => {
    const goalRepository = createGoalRepository(database.db);
    const goalService = new GoalService(goalRepository);
    const progressRepository = createGoalProgressRepository(database.db);
    const progress = new GoalProgressService(
      goalRepository,
      progressRepository,
    );
    const createdTags = await database.db
      .insert(tags)
      .values([
        { name: randomUUID(), color: '#67318F' },
        { name: randomUUID(), color: '#67318F' },
      ])
      .returning();
    try {
      const activity = await create({
        activityDate: '2000-01-04',
        durationSeconds: 3600,
      });
      await database.db
        .insert(activityTags)
        .values(
          createdTags.map((t) => ({ activityId: activity.id, tagId: t.id })),
        );
      const definition = {
        name: 'Overview',
        activityKindId: kindId,
        targetType: 'activity_count',
        targetValue: 1,
        startDate: '2000-01-01',
        endDate: '2000-01-31',
        scheduleMode: 'fixed',
        tagIds: createdTags.map((t) => t.id),
      };
      const fixed = await goalService.create(definition);
      const recurring = await goalService.create({
        ...definition,
        name: 'Weekly overview',
        scheduleMode: 'recurring',
        recurrencePeriod: 'week',
      });
      const app = createApp(env, pino({ level: 'silent' }), {
        goals: goalRepository,
        goalProgress: progressRepository,
      });
      const response = await app.request(
        '/api/v1/goals/overview?lifecycle=ended',
      );
      expect(response.status).toBe(200);
      const body = GoalOverviewResponseSchema.parse(await response.json());
      const own = body.items.filter((i) => i.goal.activityKindId === kindId);
      expect(own).toHaveLength(2);
      expect(own.find((i) => i.goal.id === fixed.id)?.progress).toMatchObject({
        currentValue: '1',
        achieved: true,
      });
      expect(
        own.find((i) => i.goal.id === recurring.id)?.progress,
      ).toMatchObject({
        currentPeriod: null,
        completedPeriods: 6,
        completedPeriodsAchieved: 1,
      });
      expect(own[0]?.tagNames).toHaveLength(2);
      expect(
        (await progress.overview({ lifecycle: 'upcoming' })).items.some(
          (i) => i.goal.activityKindId === kindId,
        ),
      ).toBe(false);
      await goalService.update(fixed.id, { name: 'Updated overview' });
      await goalService.archive(fixed.id);
      expect(
        (await progress.overview({ lifecycle: 'archived' })).items.some(
          (i) => i.goal.id === fixed.id,
        ),
      ).toBe(true);
      expect((await goalService.restore(fixed.id)).lifecycle).toBe('ended');
    } finally {
      await database.db.delete(goalTags).where(
        inArray(
          goalTags.tagId,
          createdTags.map((t) => t.id),
        ),
      );
      await database.db.delete(activityTags).where(
        inArray(
          activityTags.tagId,
          createdTags.map((t) => t.id),
        ),
      );
      await database.db.delete(tags).where(
        inArray(
          tags.id,
          createdTags.map((t) => t.id),
        ),
      );
    }
  });
  it('keeps journal reads bounded and records query plans for a ten-thousand-activity history', async () => {
    const variant = await variants.create(kindId, {
      ...validVariant,
      name: 'Treadmill',
    });
    await database.db
      .execute(sql`INSERT INTO activities (id, activity_kind_id, activity_variant_id, activity_date)
      SELECT gen_random_uuid(), ${kindId}::uuid, ${variant.id}::uuid, DATE '2010-01-01' + (n % 6000)
      FROM generate_series(1, 10000) AS n`);
    const queries: { query: string; params: unknown[] }[] = [];
    const observed = drizzle(database.db.$client, {
      schema,
      logger: {
        logQuery(query, params) {
          if (query.startsWith('select ')) queries.push({ query, params });
        },
      },
    });
    const measured = createActivityRepository(observed);
    const plans = [];
    for (const filter of [
      { activityKindId: kindId },
      {
        activityKindId: kindId,
        activityVariantId: variant.id,
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
      },
    ]) {
      queries.length = 0;
      const start = performance.now();
      const rows = await measured.list(
        ActivityListQuerySchema.parse({ ...filter, limit: '25', offset: '0' }),
      );
      const elapsedMs = performance.now() - start;
      expect(rows).toHaveLength(26); // One lookahead row, never the full archive.
      expect(queries).toHaveLength(3);
      const first = queries[0]!;
      const plan = await database.db.$client.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${first.query}`,
        first.params,
      );
      plans.push({
        filter: filter.dateFrom ? 'full-year-kind-variant' : 'kind-journal',
        rows: rows.length,
        selectCount: queries.length,
        elapsedMs,
        plan: plan.rows[0],
      });
    }
    queries.length = 0;
    const item = await measured.list(
      ActivityListQuerySchema.parse({ activityKindId: kindId, limit: '1' }),
    );
    queries.length = 0;
    await measured.find(item[0]!.activity.id);
    expect(queries).toHaveLength(3);
    const folder = new URL('../../../../.artifacts/phase-3f/', import.meta.url);
    await mkdir(folder, { recursive: true });
    await writeFile(
      new URL('journal-query-plans.json', folder),
      JSON.stringify(
        { fixtureActivities: 10000, detailSelectCount: queries.length, plans },
        null,
        2,
      ),
    );
  });
  it('persists exact decimals, date-only values and independent UTC instants', async () => {
    const d = await definitions.create(kindId, {
      ...validMeasurement,
      precision: 6,
    });
    const a = await create({
      startedAt: '2024-03-01T00:30:00+02:00',
      durationSeconds: 3600,
      measurements: [
        {
          measurementDefinitionId: d.id,
          valueType: 'decimal',
          value: '9007199254740990.123456',
        },
      ],
    });
    expect((await service.get(a.id)).measurements[0]?.canonicalValue).toBe(
      '9007199254740990.123456',
    );
    const row = (
      await database.db
        .select()
        .from(activityMeasurements)
        .where(eq(activityMeasurements.activityId, a.id))
    )[0];
    expect(row?.numericValue).toBe('9007199254740990.123456');
    const record = (
      await database.db.select().from(activities).where(eq(activities.id, a.id))
    )[0];
    expect(record?.activityDate).toBe('2024-02-29');
    expect(record?.startedAt?.toISOString()).toBe('2024-02-29T22:30:00.000Z');
    expect(record?.durationSeconds).toBe(3600);
  });
  it.each([
    { numericValue: '1', integerValue: 1 },
    {},
    { booleanValue: false, textValue: 'x' },
  ])('rejects invalid typed-column population %o', async (values) => {
    const d = await definitions.create(kindId, validMeasurement);
    const a = await create();
    await expect(
      database.db
        .insert(activityMeasurements)
        .values({ activityId: a.id, measurementDefinitionId: d.id, ...values }),
    ).rejects.toMatchObject({
      cause: { constraint: 'activity_measurements_one_value' },
    });
  });
  it.each(['NaN', 'Infinity', '-Infinity', '0.0000001', '9007199254740992'])(
    'rejects unsafe direct numeric value %s without rounding',
    async (numericValue) => {
      const d = await definitions.create(kindId, validMeasurement);
      const a = await create();
      await expect(
        database.db.insert(activityMeasurements).values({
          activityId: a.id,
          measurementDefinitionId: d.id,
          numericValue,
        }),
      ).rejects.toMatchObject({
        cause: { constraint: 'activity_measurements_numeric_valid' },
      });
    },
  );
  it('enforces unique activity/definition pairing and measurement foreign keys', async () => {
    const d = await definitions.create(kindId, validMeasurement);
    const a = await create({
      measurements: [
        { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' },
      ],
    });
    await expect(
      database.db.insert(activityMeasurements).values({
        activityId: a.id,
        measurementDefinitionId: d.id,
        numericValue: '2',
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    await expect(
      database.db.insert(activityMeasurements).values({
        activityId: a.id,
        measurementDefinitionId: randomUUID(),
        numericValue: '2',
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await expect(
      database.db.insert(activityMeasurements).values({
        activityId: randomUUID(),
        measurementDefinitionId: d.id,
        numericValue: '2',
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });
  it('enforces source pair all-or-none and concurrent uniqueness', async () => {
    const base = { activityKindId: kindId, activityDate: '2024-01-01' };
    for (const extra of [
      { source: 'legacy' },
      { sourceExternalId: '123' },
      { source: '', sourceExternalId: '123' },
    ])
      await expect(
        database.db.insert(activities).values({ ...base, ...extra }),
      ).rejects.toMatchObject({
        cause: { constraint: 'activities_source_pair_valid' },
      });
    const source = randomUUID();
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        database.db
          .insert(activities)
          .values({ ...base, source, sourceExternalId: '123' }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await database.db.insert(activities).values([base, base]);
  });
  it('enforces kind/variant ownership and prevents configuration cascades', async () => {
    const v = await variants.create(kindId, validVariant);
    const other = await newKind();
    await expect(
      database.db.insert(activities).values({
        activityKindId: other,
        activityVariantId: v.id,
        activityDate: '2024-01-01',
      }),
    ).rejects.toMatchObject({
      cause: { constraint: 'activities_variant_kind_fk' },
    });
    await expect(
      database.db
        .insert(activities)
        .values({ activityKindId: randomUUID(), activityDate: '2024-01-01' }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    const d = await definitions.create(kindId, validMeasurement);
    const a = await create({
      activityVariantId: v.id,
      measurements: [
        { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' },
      ],
    });
    await expect(
      database.db.delete(activityKinds).where(eq(activityKinds.id, kindId)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await expect(
      database.db.delete(activityVariants).where(eq(activityVariants.id, v.id)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await expect(
      database.db
        .delete(measurementDefinitions)
        .where(eq(measurementDefinitions.id, d.id)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await service.delete(a.id);
    expect(
      await database.db
        .select()
        .from(activityMeasurements)
        .where(eq(activityMeasurements.activityId, a.id)),
    ).toEqual([]);
    expect(await definitions.find(d.id)).toBeDefined();
  });
  it('rolls back activity and values when a later persistence statement fails', async () => {
    const d = await definitions.create(kindId, validMeasurement);
    const a = await create({
      name: 'Before',
      measurements: [
        { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' },
      ],
    });
    // Fault injection at the repository boundary, after service tests cover domain rejection.
    await expect(
      repository.write(a.id, undefined, ({ existing }) => ({
        fields: { ...existing!.activity, name: 'After' },
        measurements: [
          {
            measurementDefinitionId: d.id,
            numericValue: '2',
            integerValue: null,
            booleanValue: null,
            textValue: null,
          },
          {
            measurementDefinitionId: randomUUID(),
            numericValue: '3',
            integerValue: null,
            booleanValue: null,
            textValue: null,
          },
        ],
      })),
    ).rejects.toBeDefined();
    expect(await service.get(a.id)).toEqual(a);
  });
  it('serializes concurrent common-field changes without losing omitted values', async () => {
    const d = await definitions.create(kindId, validMeasurement);
    const a = await create({
      measurements: [
        { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' },
      ],
    });
    await Promise.all([
      service.update(a.id, { name: 'Renamed' }),
      service.update(a.id, { notes: 'Corrected' }),
    ]);
    expect(await service.get(a.id)).toMatchObject({
      name: 'Renamed',
      notes: 'Corrected',
      measurements: a.measurements,
    });
  });
  it('locks historical definition semantics but allows display changes and archival', async () => {
    const d = await definitions.create(kindId, validMeasurement);
    await create({
      measurements: [
        { measurementDefinitionId: d.id, valueType: 'decimal', value: '1' },
      ],
    });
    for (const patch of [
      { precision: 3 },
      { minimumValue: -1 },
      { canonicalUnit: 'kilogram', displayUnit: 'kilogram' },
    ])
      await expect(
        definitions.update(
          d.id,
          (r) => ({ ...fieldsOf(r), ...patch }) as ReturnType<typeof fieldsOf>,
        ),
      ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_HAS_HISTORY' });
    expect(
      await definitions.update(d.id, (r) => ({
        ...fieldsOf(r),
        displayUnit: 'mile',
      })),
    ).toMatchObject({ displayUnit: 'mile' });
    expect(await definitions.setArchived(d.id, true)).toMatchObject({
      archivedAt: expect.any(Date),
    });
  });
  it('serializes definition changes against recording history', async () => {
    const d = await definitions.create(kindId, validMeasurement);
    const results = await Promise.allSettled([
      create({
        measurements: [
          {
            measurementDefinitionId: d.id,
            valueType: 'decimal',
            value: '1.25',
          },
        ],
      }),
      definitions.update(d.id, (r) => ({ ...fieldsOf(r), precision: 0 })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('filters inclusively, searches literal text, paginates and orders deterministically', async () => {
    const v = await variants.create(kindId, validVariant);
    const a = await create({ activityDate: '2024-01-01', name: 'First' });
    const b = await create({
      activityDate: '2024-01-02',
      notes: 'Literal 100%_ trail',
      activityVariantId: v.id,
      isPartial: true,
    });
    const c = await create({
      activityDate: '2024-01-02',
      startedAt: '2024-01-02T12:00:00Z',
      name: 'Timed',
    });
    const e = await create({
      activityDate: '2024-01-02',
      startedAt: '2024-01-02T13:00:00Z',
      name: 'Latest time',
    });
    expect((await list()).items.map((r) => r.id)).toEqual([
      e.id,
      c.id,
      b.id,
      a.id,
    ]);
    expect(
      (await list({ dateFrom: '2024-01-02', dateTo: '2024-01-02' })).items,
    ).toHaveLength(3);
    for (const q of [
      { search: '100%_' },
      { search: 'TRAIL' },
      { isPartial: 'true' },
      { activityVariantId: v.id },
    ])
      expect((await list(q)).items.map((r) => r.id)).toEqual([b.id]);
    expect((await list({ search: "' OR 1=1 --" })).items).toEqual([]);
    const page = await list({ offset: '1', limit: '2' });
    expect(page.items.map((r) => r.id)).toEqual([c.id, b.id]);
    expect(page.pagination).toEqual({
      offset: 1,
      limit: 2,
      hasMore: true,
      nextOffset: 3,
    });
    expect((await list({ offset: '3', limit: '2' })).pagination.hasMore).toBe(
      false,
    );
  });
  it('uses created_at and UUID as deterministic final ordering keys', async () => {
    const a = await create();
    const b = await create();
    const timestamp = new Date('2020-01-01T00:00:00Z');
    await database.db
      .update(activities)
      .set({ createdAt: timestamp })
      .where(inArray(activities.id, [a.id, b.id]));
    expect((await list()).items.map((r) => r.id)).toEqual(
      [a.id, b.id].sort().reverse(),
    );
  });
  it('runs API creation, failed PATCH, archived corrections and deletion against real transactions', async () => {
    const app = createApp(env, pino({ level: 'silent' }), {
      activities: repository,
    });
    const request = (path: string, method: string, body?: unknown) =>
      app.request(`/api/v1/activities${path}`, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }),
      });
    const d = await definitions.create(kindId, validMeasurement);
    const m = {
      measurementDefinitionId: d.id,
      valueType: 'decimal',
      value: '1',
    };
    const response = await request('', 'POST', {
      ...validActivity,
      activityKindId: kindId,
      measurements: [m],
    });
    expect(response.status).toBe(201);
    const a = ActivitySchema.parse(await response.json());
    expect(
      (
        await request(`/${a.id}`, 'PATCH', {
          name: 'Invalid change',
          measurements: [{ ...m, value: '-1' }],
        })
      ).status,
    ).toBe(400);
    expect(await service.get(a.id)).toEqual(a);
    await definitions.setArchived(d.id, true);
    await kinds.setArchived(kindId, true);
    const changed = await request(`/${a.id}`, 'PATCH', {
      name: 'Historical correction',
      measurements: [{ ...m, value: '2' }],
    });
    expect(changed.status).toBe(200);
    expect(
      ActivitySchema.parse(await changed.json()).measurements[0],
    ).toMatchObject({ canonicalValue: '2', isArchived: true });
    expect((await request(`/${a.id}`, 'DELETE')).status).toBe(204);
  });
});
