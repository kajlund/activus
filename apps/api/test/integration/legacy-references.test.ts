import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { pino } from 'pino';
import { loadRootEnv } from '../../src/config/load-env.js';
import { parseEnv } from '../../src/config/env.js';
import { createDatabase, type Database } from '../../src/db/client.js';
import { testDatabaseConfig } from '../support/test-database-config.js';
import { activityKinds, legacyReferenceMappings } from '../../src/db/schema.js';
import {
  dryRun,
  type DryRunReport,
} from '../../src/modules/legacy-import/dry-run.js';
import {
  previewReferences,
  applyReferences,
  readReferenceState,
} from '../../src/modules/legacy-import/reference-stage.js';
import { referenceReadiness } from '../../src/modules/legacy-import/reference-plan.js';
import {
  loadActivitySource,
  previewActivities,
  applyActivities,
} from '../../src/modules/legacy-import/activity-stage.js';
import { activities, activityMeasurements } from '../../src/db/schema.js';

loadRootEnv();
const config = parseEnv(process.env);
const safe = config.TEST_DATABASE_URL ? testDatabaseConfig(config) : undefined;
describe.skipIf(!safe)('Legacy reference stage PostgreSQL', () => {
  let database: ReturnType<typeof createDatabase>;
  let input: string;
  let source: DryRunReport;
  beforeAll(async () => {
    database = createDatabase(safe!, pino({ level: 'silent' }));
    await database.open();
    const identity = await database.db.execute(
      sql`SELECT current_database() AS database, current_user AS username, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user`,
    );
    const row = identity.rows[0];
    if (
      !row ||
      row.database !==
        decodeURIComponent(new URL(safe!.DATABASE_URL).pathname.slice(1)) ||
      row.username !== 'activus_test' ||
      row.rolsuper ||
      row.rolcreatedb ||
      row.rolcreaterole
    )
      throw Error('Unsafe test connection');
    await migrate(database.db, {
      migrationsFolder: fileURLToPath(
        new URL('../../../../drizzle', import.meta.url),
      ),
    });
    input = await mkdtemp(join(tmpdir(), 'activus-reference-test-'));
    const kindId = '6a859b002489ecc2e1afefa9';
    const date = {
      $date: { $numberLong: String(Date.parse('2026-01-02T00:00:00Z')) },
    };
    const kinds =
      JSON.stringify({
        _id: { $oid: kindId },
        kindId: 'old',
        name: 'Walking',
        iconName: 'ico-walk',
        description: '',
        createdAt: '2026-01-01 00:00:00.000+00',
        updatedAt: date,
      }) + '\n';
    const activities =
      JSON.stringify({
        _id: { $oid: '000000000000000000000001' },
        kindId: { $oid: kindId },
        when: date,
        title: 'Sanitized',
        description: '',
        duration: { $numberInt: '600' },
        distance: { $numberInt: '1250' },
        calories: { $numberInt: '0' },
        createdAt: date,
        updatedAt: date,
        __v: { $numberInt: '0' },
      }) + '\n';
    const mapping = JSON.stringify({
      version: 1,
      calendarTimezone: 'Europe/Helsinki',
      midnightDateOnly: true,
      zeroPolicy: Object.fromEntries(
        [
          'duration',
          'distance',
          'ascent',
          'calories',
          'steps',
          'avgHR',
          'cadenceAvg',
        ].map((k) => [k, 'omit']),
      ),
      unsupportedUnits: 'named-unitless',
      kinds: [
        {
          sourceId: kindId,
          targetKind: 'Walking',
          targetVariant: 'Outdoor',
          presentationApproved: true,
          descriptionLossApproved: true,
        },
      ],
      precisionExceptions: [],
    });
    const hash = (s: string) => createHash('sha256').update(s).digest('hex');
    const manifest = {
      formatVersion: 'activus-legacy-ejson-v1',
      sourceSystem: 'legacy-activus-mongodb',
      datasetId: `test-${randomUUID()}`,
      sourceDatabase: null,
      exportedAt: null,
      exportTool: null,
      provenanceUnknown: true,
      consistency: 'unknown',
      ownerScope: 'all-records-confirmed',
      files: [
        {
          filename: 'kinds.ndjson',
          collection: 'kinds',
          records: 1,
          sha256: hash(kinds),
        },
        {
          filename: 'activities.ndjson',
          collection: 'activities',
          records: 1,
          sha256: hash(activities),
        },
      ],
      mappingFile: 'mapping-decisions.json',
      mappingSha256: hash(mapping),
    };
    for (const [name, body] of Object.entries({
      'kinds.ndjson': kinds,
      'activities.ndjson': activities,
      'mapping-decisions.json': mapping,
      'manifest.json': JSON.stringify(manifest),
    }))
      await writeFile(join(input, name), body);
    source = await dryRun(input);
    expect(source.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
  afterAll(async () => {
    if (database) await database.close();
    if (input) {
      if (
        !resolve(input).startsWith(resolve(tmpdir()) + sep) ||
        !basename(input).startsWith('activus-reference-test-')
      )
        throw Error('Unsafe cleanup');
      await rm(input, { recursive: true, force: true });
    }
  });
  async function isolated(test: (db: Database) => Promise<void>) {
    const rollback = new Error('fixture rollback');
    try {
      await database.db.transaction(async (tx) => {
        await test(tx as unknown as Database);
        throw rollback;
      });
    } catch (e) {
      if (e !== rollback) throw e;
    }
  }
  it('preview plans three references without writing', () =>
    isolated(async (db) => {
      const before = await readReferenceState(
        db,
        source.identity.sourceNamespace!,
      );
      const report = await previewReferences(db, source);
      expect(report.plan.counts).toEqual({
        create: 3,
        reuse: 0,
        alreadyImported: 0,
        skip: 0,
        block: 0,
      });
      expect(
        await readReferenceState(db, source.identity.sourceNamespace!),
      ).toEqual(before);
    }));
  it('activity and measurements commit together; a value failure leaves neither', () =>
    isolated(async (db) => {
      await applyReferences(
        db,
        input,
        source,
        await previewReferences(db, source),
      );
      const packageSource = await loadActivitySource(input);
      const preview = await previewActivities(db, packageSource);
      expect(preview.safeToApply).toBe(true);
      expect(await db.select().from(activities)).toHaveLength(0);
      await db.execute(
        sql`CREATE FUNCTION pg_temp.reject_legacy_value() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected value failure'; END $$`,
      );
      await db.execute(
        sql`CREATE TRIGGER test_reject_legacy_value BEFORE INSERT ON activity_measurements FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_legacy_value()`,
      );
      const failed = await applyActivities(db, input, preview);
      expect(failed.transaction).toBe('rolled-back');
      expect(await db.select().from(activities)).toHaveLength(0);
      expect(await db.select().from(activityMeasurements)).toHaveLength(0);
      await db.execute(
        sql`DROP TRIGGER test_reject_legacy_value ON activity_measurements`,
      );
      const result = await applyActivities(
        db,
        input,
        await previewActivities(db, packageSource),
      );
      expect(result.transaction).toBe('committed');
      expect(result.counts.created).toBe(1);
      expect(result.counts.createdMeasurements).toBe(1);
      expect(result.complete).toBe(true);
    }));
  it('activity reruns create nothing and changed canonical content conflicts', () =>
    isolated(async (db) => {
      await applyReferences(
        db,
        input,
        source,
        await previewReferences(db, source),
      );
      const packageSource = await loadActivitySource(input);
      await applyActivities(
        db,
        input,
        await previewActivities(db, packageSource),
      );
      const repeated = await applyActivities(
        db,
        input,
        await previewActivities(db, packageSource),
      );
      expect(repeated.transaction).toBe('committed');
      expect(repeated.counts.created).toBe(0);
      expect(repeated.counts.createdMeasurements).toBe(0);
      expect(repeated.counts.alreadyImported).toBe(1);
      await db
        .update(activities)
        .set({ name: 'Changed fixture' })
        .where(sql`${activities.source}=${source.identity.sourceNamespace}`);
      const changed = await previewActivities(db, packageSource);
      expect(changed.counts.conflicts).toBe(1);
      expect(changed.safeToApply).toBe(false);
      expect((await applyActivities(db, input, changed)).transaction).toBe(
        'not-started',
      );
    }));
  it('apply creates references and their stable mappings together', () =>
    isolated(async (db) => {
      const report = await applyReferences(
        db,
        input,
        source,
        await previewReferences(db, source),
      );
      expect(report.transaction).toBe('committed');
      const state = await readReferenceState(
        db,
        source.identity.sourceNamespace!,
      );
      expect(state.mappings).toHaveLength(3);
      expect(state.mappings.every((m) => m.disposition === 'created')).toBe(
        true,
      );
      expect(report.readiness.readyForActivityImport).toBe(true);
    }));
  it('repeat apply creates no duplicate records or mappings', () =>
    isolated(async (db) => {
      await applyReferences(
        db,
        input,
        source,
        await previewReferences(db, source),
      );
      const before = await readReferenceState(
        db,
        source.identity.sourceNamespace!,
      );
      const report = await applyReferences(
        db,
        input,
        source,
        await previewReferences(db, source),
      );
      expect(report.transaction).toBe('committed');
      expect(report.plan.counts.alreadyImported).toBe(3);
      expect(report.plan.counts.create).toBe(0);
      expect(
        await readReferenceState(db, source.identity.sourceNamespace!),
      ).toEqual(before);
    }));
  it('a ledger failure rolls back reference records created earlier in the transaction', () =>
    isolated(async (db) => {
      const before = await readReferenceState(
        db,
        source.identity.sourceNamespace!,
      );
      await db.execute(
        sql`CREATE FUNCTION pg_temp.reject_legacy_mapping() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected ledger failure'; END $$`,
      );
      await db.execute(
        sql`CREATE TRIGGER test_reject_legacy_mapping BEFORE INSERT ON legacy_reference_mappings FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_legacy_mapping()`,
      );
      const result = await applyReferences(
        db,
        input,
        source,
        await previewReferences(db, source),
      );
      expect(result.transaction).toBe('rolled-back');
      expect(
        await readReferenceState(db, source.identity.sourceNamespace!),
      ).toEqual(before);
    }));
  it('conflicting configuration and changed source block with no changes', () =>
    isolated(async (db) => {
      await db.insert(activityKinds).values({
        name: 'Walking',
        iconName: 'bike',
        color: '#64748B',
        sortOrder: 0,
      });
      const before = await readReferenceState(
        db,
        source.identity.sourceNamespace!,
      );
      const preview = await previewReferences(db, source);
      expect(preview.plan.counts.block).toBeGreaterThan(0);
      expect(
        (await applyReferences(db, input, source, preview)).transaction,
      ).toBe('not-started');
      expect(
        await readReferenceState(db, source.identity.sourceNamespace!),
      ).toEqual(before);
    }));
  it('readiness detects missing mappings and changed fingerprints', () =>
    isolated(async (db) => {
      expect(
        referenceReadiness(
          source,
          await readReferenceState(db, source.identity.sourceNamespace!),
        ).fullyResolvable,
      ).toBe(0);
      await applyReferences(
        db,
        input,
        source,
        await previewReferences(db, source),
      );
      const state = await readReferenceState(
        db,
        source.identity.sourceNamespace!,
      );
      expect(referenceReadiness(source, state).fullyResolvable).toBe(1);
      await db
        .update(legacyReferenceMappings)
        .set({ fingerprint: 'changed' })
        .where(
          sql`${legacyReferenceMappings.source}=${source.identity.sourceNamespace}`,
        );
      expect(
        (await previewReferences(db, source)).plan.counts.block,
      ).toBeGreaterThan(0);
    }));
});
