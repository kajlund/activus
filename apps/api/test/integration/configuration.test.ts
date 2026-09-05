import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { and, eq, inArray, sql } from 'drizzle-orm';
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
import { loadRootEnv } from '../../src/config/load-env.js';
import { parseEnv } from '../../src/config/env.js';
import { createDatabase } from '../../src/db/client.js';
import {
  activityKinds,
  activityVariants,
  measurementDefinitions,
} from '../../src/db/schema.js';
import { createActivityKindRepository } from '../../src/modules/activity-kinds/repository.js';
import { createVariantRepository } from '../../src/modules/activity-variants/repository.js';
import { createMeasurementRepository } from '../../src/modules/measurement-definitions/repository.js';
import { fieldsOf } from '../../src/modules/measurement-definitions/mapper.js';
import { validateMeasurement } from '../../src/modules/measurement-definitions/validator.js';
import { testDatabaseConfig } from '../support/test-database-config.js';
import { validKind } from '../support/activity-kind-repository.js';
import { validMeasurement, validVariant } from '../support/configuration.js';

loadRootEnv();
const env = parseEnv(process.env);
const safe = env.TEST_DATABASE_URL ? testDatabaseConfig(env) : undefined;
describe.skipIf(!safe)('PostgreSQL phase 2B configuration invariants', () => {
  let database: ReturnType<typeof createDatabase>;
  let kinds: ReturnType<typeof createActivityKindRepository>;
  let variants: ReturnType<typeof createVariantRepository>;
  let measurements: ReturnType<typeof createMeasurementRepository>;
  const ownedKinds: string[] = [];
  let kindId: string;
  async function newKind() {
    const kind = await kinds.create({ ...validKind, name: randomUUID() });
    ownedKinds.push(kind.id);
    return kind.id;
  }
  beforeAll(async () => {
    if (!safe) throw new Error('Missing test database configuration');
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
    measurements = createMeasurementRepository(database.db);
  });
  beforeEach(async () => {
    kindId = await newKind();
  });
  afterEach(async () => {
    if (!database || !ownedKinds.length) return;
    // Only this test's random kind IDs and their children; never truncate/drop.
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

  it('reserves case-insensitive variant names including archives, scoped to kind', async () => {
    const v = await variants.create(kindId, validVariant);
    await expect(
      variants.create(kindId, { ...validVariant, name: 'OUTDOOR' }),
    ).rejects.toMatchObject({ code: 'ACTIVITY_VARIANT_NAME_CONFLICT' });
    await variants.setArchived(v.id, true);
    await expect(variants.create(kindId, validVariant)).rejects.toMatchObject({
      code: 'ACTIVITY_VARIANT_NAME_CONFLICT',
    });
    await expect(
      variants.create(await newKind(), validVariant),
    ).resolves.toMatchObject({ name: 'Outdoor' });
    expect(await variants.list(kindId, false)).toHaveLength(0);
    expect(await variants.list(kindId, true)).toHaveLength(1);
  });
  it('enforces one default under concurrent direct inserts', async () => {
    const results = await Promise.allSettled(
      ['One', 'Two'].map((name) =>
        database.db.insert(activityVariants).values({
          ...validVariant,
          name,
          isDefault: true,
          activityKindId: kindId,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await variants.list(kindId, false)).filter((v) => v.isDefault),
    ).toHaveLength(1);
  });
  it('atomically replaces defaults even under concurrent repository requests', async () => {
    const one = await variants.create(kindId, {
      ...validVariant,
      name: 'One',
      isDefault: true,
    });
    const two = await variants.create(kindId, { ...validVariant, name: 'Two' });
    await variants.update(two.id, { isDefault: true });
    expect((await variants.find(one.id))?.isDefault).toBe(false);
    const result = await Promise.allSettled([
      variants.update(one.id, { isDefault: true }),
      variants.update(two.id, { isDefault: true }),
    ]);
    expect(result.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(
      (await variants.list(kindId, false)).filter((v) => v.isDefault),
    ).toHaveLength(1);
  });
  it('rolls back clearing the prior default when a new default write fails', async () => {
    const one = await variants.create(kindId, {
      ...validVariant,
      isDefault: true,
    });
    await expect(
      variants.create(kindId, { ...validVariant, isDefault: true }),
    ).rejects.toMatchObject({ code: 'ACTIVITY_VARIANT_NAME_CONFLICT' });
    expect((await variants.find(one.id))?.isDefault).toBe(true);
  });
  it('clears archived variant defaults and restores without resurrecting defaults', async () => {
    const row = await variants.create(kindId, {
      ...validVariant,
      isDefault: true,
    });
    const archived = await variants.setArchived(row.id, true);
    expect(archived).toMatchObject({
      isDefault: false,
      archivedAt: expect.any(Date),
    });
    expect(await variants.setArchived(row.id, true)).toEqual(archived);
    expect(await variants.setArchived(row.id, false)).toMatchObject({
      isDefault: false,
      archivedAt: null,
    });
  });
  it('clears defaults when a kind is archived and rejects new children/defaults', async () => {
    const variant = await variants.create(kindId, {
      ...validVariant,
      isDefault: true,
    });
    await kinds.setArchived(kindId, true);
    expect((await variants.find(variant.id))?.isDefault).toBe(false);
    await expect(
      variants.update(variant.id, { isDefault: true }),
    ).rejects.toMatchObject({ code: 'ACTIVITY_KIND_ARCHIVED' });
    await expect(
      variants.create(kindId, { ...validVariant, name: 'New' }),
    ).rejects.toMatchObject({ code: 'ACTIVITY_KIND_ARCHIVED' });
    await expect(
      measurements.create(kindId, validMeasurement),
    ).rejects.toMatchObject({ code: 'ACTIVITY_KIND_ARCHIVED' });
  });
  it('reserves parent measurement names with null variant IDs', async () => {
    const m = await measurements.create(kindId, validMeasurement);
    await expect(
      measurements.create(kindId, { ...validMeasurement, name: 'DISTANCE' }),
    ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_NAME_CONFLICT' });
    await measurements.setArchived(m.id, true);
    await expect(
      measurements.create(kindId, validMeasurement),
    ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_NAME_CONFLICT' });
  });
  it('reserves variant measurement names per variant, allowing different variants', async () => {
    const first = await variants.create(kindId, validVariant);
    const second = await variants.create(kindId, {
      ...validVariant,
      name: 'Indoor',
    });
    await measurements.create(kindId, {
      ...validMeasurement,
      activityVariantId: first.id,
    });
    await expect(
      measurements.create(kindId, {
        ...validMeasurement,
        name: 'DISTANCE',
        activityVariantId: first.id,
      }),
    ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_NAME_CONFLICT' });
    await expect(
      measurements.create(kindId, {
        ...validMeasurement,
        activityVariantId: second.id,
      }),
    ).resolves.toBeDefined();
  });
  it('protects inherited names in both directions, including archived names', async () => {
    const variant = await variants.create(kindId, validVariant);
    const parent = await measurements.create(kindId, validMeasurement);
    await expect(
      measurements.create(kindId, {
        ...validMeasurement,
        activityVariantId: variant.id,
      }),
    ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_NAME_CONFLICT' });
    await measurements.setArchived(parent.id, true);
    await expect(
      measurements.create(kindId, {
        ...validMeasurement,
        activityVariantId: variant.id,
      }),
    ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_NAME_CONFLICT' });
    await measurements.create(kindId, {
      ...validMeasurement,
      activityVariantId: variant.id,
      name: 'Elevation',
    });
    await expect(
      measurements.create(kindId, { ...validMeasurement, name: 'elevation' }),
    ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_NAME_CONFLICT' });
  });
  it('protects inherited-name conflicts against concurrent direct inserts', async () => {
    const variant = await variants.create(kindId, validVariant);
    const results = await Promise.allSettled(
      [null, variant.id].map((activityVariantId) =>
        database.db.insert(measurementDefinitions).values({
          ...validMeasurement,
          activityKindId: kindId,
          activityVariantId,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('protects inherited names when transactions already have repeatable-read snapshots', async () => {
    const variant = await variants.create(kindId, validVariant);
    let ready = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const results = await Promise.allSettled(
      [null, variant.id].map((activityVariantId) =>
        database.db.transaction(
          async (tx) => {
            await tx
              .select()
              .from(activityKinds)
              .where(eq(activityKinds.id, kindId));
            if (++ready === 2) release();
            await gate;
            await tx.insert(measurementDefinitions).values({
              ...validMeasurement,
              activityKindId: kindId,
              activityVariantId,
            });
          },
          { isolationLevel: 'repeatable read' },
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('enforces ownership and restrictive foreign keys for historical records', async () => {
    const otherKind = await newKind();
    const variant = await variants.create(otherKind, validVariant);
    await expect(
      measurements.create(kindId, {
        ...validMeasurement,
        activityVariantId: variant.id,
      }),
    ).rejects.toMatchObject({
      code: 'MEASUREMENT_DEFINITION_VARIANT_MISMATCH',
    });
    await expect(
      database.db
        .update(activityVariants)
        .set({ activityKindId: kindId })
        .where(eq(activityVariants.id, variant.id)),
    ).rejects.toMatchObject({
      cause: { constraint: 'configuration_variant_ownership' },
    });
    const m = await measurements.create(otherKind, {
      ...validMeasurement,
      activityVariantId: variant.id,
    });
    await expect(
      database.db
        .update(measurementDefinitions)
        .set({ activityVariantId: null })
        .where(eq(measurementDefinitions.id, m.id)),
    ).rejects.toMatchObject({
      cause: { constraint: 'configuration_measurement_ownership' },
    });
    await expect(
      database.db
        .delete(activityVariants)
        .where(eq(activityVariants.id, variant.id)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await expect(
      database.db.delete(activityKinds).where(eq(activityKinds.id, otherKind)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });
  it('preserves archive rows and blocks restores under archived kind/variant', async () => {
    const variant = await variants.create(kindId, validVariant);
    const measurement = await measurements.create(kindId, {
      ...validMeasurement,
      activityVariantId: variant.id,
    });
    const archived = await measurements.setArchived(measurement.id, true);
    expect(await measurements.find(measurement.id)).toEqual(archived);
    expect(await measurements.setArchived(measurement.id, true)).toEqual(
      archived,
    );
    await variants.setArchived(variant.id, true);
    await expect(
      measurements.setArchived(measurement.id, false),
    ).rejects.toMatchObject({ code: 'ACTIVITY_VARIANT_ARCHIVED' });
    await expect(
      measurements.create(kindId, {
        ...validMeasurement,
        name: 'Other',
        activityVariantId: variant.id,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVITY_VARIANT_ARCHIVED' });
    await kinds.setArchived(kindId, true);
    await expect(variants.setArchived(variant.id, false)).rejects.toMatchObject(
      { code: 'ACTIVITY_KIND_ARCHIVED' },
    );
  });
  it('enforces primary selection ownership, scope and type', async () => {
    const variant = await variants.create(kindId, validVariant);
    const scoped = await measurements.create(kindId, {
      ...validMeasurement,
      activityVariantId: variant.id,
    });
    const foreign = await measurements.create(
      await newKind(),
      validMeasurement,
    );
    const text = await measurements.create(kindId, {
      ...validMeasurement,
      name: 'Text',
      valueType: 'text',
      canonicalUnit: null,
      displayUnit: null,
      precision: null,
      minimumValue: null,
      maximumValue: null,
      aggregation: 'none',
      personalBestDirection: 'none',
    });
    for (const id of [scoped.id, foreign.id, text.id, randomUUID()])
      await expect(
        kinds.update(kindId, { primaryMeasurementDefinitionId: id }),
      ).rejects.toMatchObject({ code: 'PRIMARY_MEASUREMENT_INVALID' });
    const eligible = await measurements.create(kindId, {
      ...validMeasurement,
      name: 'Length',
    });
    expect(
      await kinds.update(kindId, {
        primaryMeasurementDefinitionId: eligible.id,
      }),
    ).toMatchObject({ primaryMeasurementDefinitionId: eligible.id });
    await expect(
      database.db
        .delete(measurementDefinitions)
        .where(eq(measurementDefinitions.id, eligible.id)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });
  it('rejects archiving or making a primary measurement nonnumeric until explicitly cleared', async () => {
    const m = await measurements.create(kindId, validMeasurement);
    await kinds.update(kindId, { primaryMeasurementDefinitionId: m.id });
    await expect(measurements.setArchived(m.id, true)).rejects.toMatchObject({
      code: 'MEASUREMENT_DEFINITION_IS_PRIMARY',
    });
    await expect(
      measurements.update(m.id, (r) =>
        validateMeasurement({
          ...fieldsOf(r),
          valueType: 'boolean',
          canonicalUnit: null,
          displayUnit: null,
          precision: null,
          minimumValue: null,
          maximumValue: null,
          aggregation: 'none',
          personalBestDirection: 'none',
        }),
      ),
    ).rejects.toMatchObject({ code: 'MEASUREMENT_DEFINITION_IS_PRIMARY' });
    await kinds.update(kindId, { primaryMeasurementDefinitionId: null });
    await measurements.setArchived(m.id, true);
    await expect(
      kinds.update(kindId, { primaryMeasurementDefinitionId: m.id }),
    ).rejects.toMatchObject({ code: 'PRIMARY_MEASUREMENT_INVALID' });
  });
  it('serializes primary selection against concurrent archive', async () => {
    const m = await measurements.create(kindId, validMeasurement);
    const outcomes = await Promise.allSettled([
      kinds.update(kindId, { primaryMeasurementDefinitionId: m.id }),
      measurements.setArchived(m.id, true),
    ]);
    expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const kind = await kinds.find(kindId);
    const row = await measurements.find(m.id);
    expect(
      kind?.primaryMeasurementDefinitionId === null || row?.archivedAt === null,
    ).toBe(true);
  });
  it('lists deterministic effective measurements and preserves omitted PATCH fields concurrently', async () => {
    const variant = await variants.create(kindId, validVariant);
    const a = await measurements.create(kindId, {
      ...validMeasurement,
      name: 'Alpha',
    });
    const b = await measurements.create(kindId, {
      ...validMeasurement,
      name: 'Beta',
      activityVariantId: variant.id,
    });
    await measurements.create(kindId, {
      ...validMeasurement,
      name: 'Zulu',
      sortOrder: 1,
    });
    expect(
      (
        await measurements.list(kindId, {
          includeArchived: false,
          effective: true,
          activityVariantId: variant.id,
        })
      ).map((m) => m.name),
    ).toEqual(['Alpha', 'Beta', 'Zulu']);
    expect(
      (
        await measurements.list(kindId, {
          includeArchived: false,
          effective: false,
          activityVariantId: variant.id,
        })
      ).map((m) => m.id),
    ).toEqual([b.id]);
    await Promise.all([
      measurements.update(a.id, (r) => ({ ...fieldsOf(r), name: 'Renamed' })),
      measurements.update(a.id, (r) => ({ ...fieldsOf(r), isRequired: true })),
    ]);
    expect(await measurements.find(a.id)).toMatchObject({
      name: 'Renamed',
      isRequired: true,
    });
  });
  it.each([
    { precision: null },
    { precision: 7 },
    { minimumValue: 10, maximumValue: 1 },
    { valueType: 'nonsense' },
    { canonicalUnit: 'kilogram' },
    { valueType: 'boolean' },
    { valueType: 'rating' },
    { valueType: 'integer', minimumValue: 0.5 },
  ])(
    'protects type combinations against direct invalid writes: %o',
    async (patch) => {
      await expect(
        database.db
          .insert(measurementDefinitions)
          .values({ ...validMeasurement, ...patch, activityKindId: kindId }),
      ).rejects.toMatchObject({ cause: { code: '23514' } });
    },
  );
  it('has explicit composite ownership and primary foreign keys with no cascading deletes', async () => {
    const result = await database.db.execute(
      sql`SELECT conname, confdeltype FROM pg_constraint WHERE contype = 'f' AND conrelid IN ('public.activity_variants'::regclass, 'public.measurement_definitions'::regclass, 'public.activity_kinds'::regclass)`,
    );
    expect(
      result.rows.some(
        (r) => r.conname === 'measurement_definitions_variant_kind_fk',
      ),
    ).toBe(true);
    expect(result.rows.every((r) => r.confdeltype !== 'c')).toBe(true);
    expect(
      await database.db
        .select()
        .from(activityKinds)
        .where(
          and(
            eq(activityKinds.id, kindId),
            sql`${activityKinds.primaryMeasurementDefinitionId} IS NULL`,
          ),
        ),
    ).toHaveLength(1);
  });
});
