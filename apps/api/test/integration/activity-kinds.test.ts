import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sql, inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';
import { loadRootEnv } from '../../src/config/load-env.js';
import { createDatabase } from '../../src/db/client.js';
import { activityKinds } from '../../src/db/schema.js';
import {
  ActivityKindNameConflict,
  type ActivityKindRepository,
  type ActivityKindRecord,
} from '../../src/modules/activity-kinds/model.js';
import { createActivityKindRepository } from '../../src/modules/activity-kinds/repository.js';
import { testDatabaseConfig } from '../support/test-database-config.js';
import { validKind } from '../support/activity-kind-repository.js';

loadRootEnv();
const config = parseEnv(process.env);
// An absent URL is an explicit skip, never a fallback to DATABASE_URL.
const safeConfig = config.TEST_DATABASE_URL
  ? testDatabaseConfig(config)
  : undefined;

describe.skipIf(!safeConfig)(
  'PostgreSQL activity-kind repository and constraints (requires TEST_DATABASE_URL)',
  () => {
    let database: ReturnType<typeof createDatabase>;
    let repository: ActivityKindRepository;
    const insertedIds = new Set<string>();
    const prefix = randomUUID();
    const keep = (row: ActivityKindRecord) => {
      insertedIds.add(row.id);
      return row;
    };

    beforeAll(async () => {
      if (!safeConfig) throw new Error('Missing safe database configuration');
      database = createDatabase(safeConfig, pino({ level: 'silent' }));
      await database.open();
      // Verify the actual connection target and role, not only the URL spelling.
      const result = await database.db.execute(
        sql`SELECT current_database() AS database, current_user AS username, r.rolsuper, r.rolcreatedb, r.rolcreaterole FROM pg_roles r WHERE r.rolname = current_user`,
      );
      const identity = result.rows[0];
      const expectedName = decodeURIComponent(
        new URL(safeConfig.DATABASE_URL).pathname.slice(1),
      );
      if (
        !identity ||
        identity.database !== expectedName ||
        identity.username !== 'activus_test' ||
        identity.rolsuper ||
        identity.rolcreatedb ||
        identity.rolcreaterole
      ) {
        throw new Error(
          'Refusing to migrate: test database identity/role guard failed',
        );
      }
      await migrate(database.db, {
        migrationsFolder: fileURLToPath(
          new URL('../../../../drizzle', import.meta.url),
        ),
      });
      repository = createActivityKindRepository(database.db);
    });

    afterEach(async () => {
      // Only rows created by this suite are removed. Never truncate or drop a schema/database.
      if (database && insertedIds.size)
        await database.db
          .delete(activityKinds)
          .where(inArray(activityKinds.id, [...insertedIds]));
      insertedIds.clear();
    });
    afterAll(async () => {
      if (database) await database.close();
    });

    it('inserts and retrieves database-generated UUIDs and timezone-aware instants', async () => {
      const row = keep(
        await repository.create({ ...validKind, name: `${prefix} Insert` }),
      );
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.updatedAt).toBeInstanceOf(Date);
      expect(await repository.find(row.id)).toEqual(row);
    });

    it('protects case-insensitive names against direct SQL inserts', async () => {
      keep(
        await repository.create({ ...validKind, name: `${prefix} Walking` }),
      );
      await expect(
        database.db
          .insert(activityKinds)
          .values({ ...validKind, name: `${prefix} WALKING` }),
      ).rejects.toMatchObject({
        cause: { code: '23505', constraint: 'activity_kinds_name_unique' },
      });
    });

    it('allows exactly one winner for concurrent duplicate inserts', async () => {
      const results = await Promise.allSettled([
        repository
          .create({ ...validKind, name: `${prefix} Concurrent` })
          .then(keep),
        repository
          .create({ ...validKind, name: `${prefix} CONCURRENT` })
          .then(keep),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const failure = results.find((result) => result.status === 'rejected');
      expect(
        failure?.status === 'rejected' &&
          failure.reason instanceof ActivityKindNameConflict,
      ).toBe(true);
    });

    it('preserves archived rows and names and restores idempotently', async () => {
      const row = keep(
        await repository.create({ ...validKind, name: `${prefix} Archive` }),
      );
      const archived = await repository.setArchived(row.id, true);
      expect(archived?.archivedAt).toBeInstanceOf(Date);
      expect(await repository.find(row.id)).toEqual(archived);
      expect(await repository.setArchived(row.id, true)).toEqual(archived);
      expect(
        (await repository.list(false)).some((kind) => kind.id === row.id),
      ).toBe(false);
      expect(
        (await repository.list(true)).some((kind) => kind.id === row.id),
      ).toBe(true);
      await expect(
        repository.create({ ...validKind, name: row.name.toUpperCase() }),
      ).rejects.toBeInstanceOf(ActivityKindNameConflict);
      const restored = await repository.setArchived(row.id, false);
      expect(restored?.archivedAt).toBeNull();
      expect(await repository.setArchived(row.id, false)).toEqual(restored);
    });

    it('protects a restore combined with a conflicting name, leaving the archived row intact', async () => {
      const archived = keep(
        await repository.create({ ...validKind, name: `${prefix} Old` }),
      );
      const active = keep(
        await repository.create({ ...validKind, name: `${prefix} Current` }),
      );
      await repository.setArchived(archived.id, true);
      // With globally reserved names, conflicting archived rows cannot exist normally.
      // A direct attempt to rename while restoring must still fail atomically.
      await expect(
        database.db.execute(
          sql`UPDATE activity_kinds SET name = ${active.name.toUpperCase()}, archived_at = NULL WHERE id = ${archived.id}`,
        ),
      ).rejects.toMatchObject({
        cause: { code: '23505', constraint: 'activity_kinds_name_unique' },
      });
      expect(await repository.find(archived.id)).toMatchObject({
        name: archived.name,
        archivedAt: expect.any(Date),
      });
    });

    it('orders by sort order, then C-collated name, with ID as the final tie breaker', async () => {
      const z = keep(
        await repository.create({
          ...validKind,
          name: `${prefix} Zulu`,
          sortOrder: 1,
        }),
      );
      const b = keep(
        await repository.create({
          ...validKind,
          name: `${prefix} Beta`,
          sortOrder: 0,
        }),
      );
      const a = keep(
        await repository.create({
          ...validKind,
          name: `${prefix} Alpha`,
          sortOrder: 0,
        }),
      );
      expect(
        (await repository.list(false))
          .filter((row) => insertedIds.has(row.id))
          .map((row) => row.id),
      ).toEqual([a.id, b.id, z.id]);
    });

    it.each([
      { name: '' },
      { name: '  ' },
      { name: '\tTabbed' },
      { name: '\u00A0' },
      { name: '\uFEFFWalking' },
      { name: ' Trailing ' },
      { name: 'x'.repeat(121) },
      { color: '#abcdef' },
      { color: '#123' },
      { sortOrder: -1 },
      { iconName: '<svg />' },
    ])(
      'enforces constraints against direct invalid writes: %o',
      async (invalid) => {
        await expect(
          database.db
            .insert(activityKinds)
            .values({ ...validKind, name: `${prefix} Invalid`, ...invalid }),
        ).rejects.toMatchObject({ cause: { code: '23514' } });
      },
    );

    it('updates only supplied fields and preserves creation time', async () => {
      const row = keep(
        await repository.create({ ...validKind, name: `${prefix} Update` }),
      );
      const updated = await repository.update(row.id, { color: '#AABBCC' });
      expect(updated).toMatchObject({
        id: row.id,
        name: row.name,
        color: '#AABBCC',
        sortOrder: row.sortOrder,
        createdAt: row.createdAt,
      });
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        row.updatedAt.getTime(),
      );
    });
  },
);
