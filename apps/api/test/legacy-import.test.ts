import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { dryRun } from '../src/modules/legacy-import/dry-run.js';
import { runCli } from '../src/modules/legacy-import/cli.js';
import { instant, numeric } from '../src/modules/legacy-import/decode.js';
import type { Mapping } from '../src/modules/legacy-import/package.js';

vi.mock('node:fs/promises', { spy: true });

// A regression that imports a DB driver/client fails immediately, even without a server.
vi.mock('pg', () => {
  throw new Error('Dry run must not load PostgreSQL');
});
vi.mock('../src/db/client.js', () => {
  throw new Error('Dry run must not load a database client');
});

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    const absolute = resolve(root);
    if (
      !absolute.startsWith(resolve(tmpdir()) + sep) ||
      !basename(absolute).startsWith('activus-import-test-')
    )
      throw new Error('Unsafe test cleanup path');
    await fs.rm(absolute, { recursive: true, force: true });
  }
});
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const kindId = '6a859b002489ecc2e1afefa9';
const oid = (id: string) => ({ $oid: id });
const int = (n: number) => ({ $numberInt: String(n) });
const date = (iso: string) => ({
  $date: { $numberLong: String(Date.parse(iso)) },
});
const activity = (suffix: number) => ({
  _id: oid(suffix.toString(16).padStart(24, '0')),
  kindId: oid(kindId),
  when: date('2026-01-02T00:00:00.000Z'),
  title: 'PRIVATE TITLE NOT FOR REPORT',
  description: 'PRIVATE NOTE NOT FOR REPORT',
  distance: int(1250),
  duration: int(600),
  calories: int(20),
  elevation: int(10),
  createdAt: date('2026-01-03T10:00:00.000Z'),
  updatedAt: date('2026-01-03T10:00:00.000Z'),
  __v: int(0),
});
const decision = (): Mapping => ({
  version: 1,
  calendarTimezone: 'Europe/Helsinki',
  midnightDateOnly: true,
  zeroPolicy: {
    distance: 'preserve',
    duration: 'omit',
    ascent: 'preserve',
    calories: 'omit',
    steps: 'omit',
    avgHR: 'omit',
    cadenceAvg: 'omit',
  },
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
async function fixture(items: unknown[], mapping = decision()) {
  const root = await fs.mkdtemp(join(tmpdir(), 'activus-import-test-'));
  roots.push(root);
  const input = join(root, 'export');
  await fs.mkdir(input);
  const kinds =
    JSON.stringify({
      _id: oid(kindId),
      kindId: 'old-discriminator',
      name: 'Walking',
      iconName: 'ico-walk',
      description: 'PRIVATE KIND DESCRIPTION',
      createdAt: '2025-12-03 13:00:43.697+00',
      updatedAt: date('2026-01-03T10:00:00.000Z'),
    }) + '\n';
  const activities =
    items
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
      .join('\n') + '\n';
  const decisions = JSON.stringify(mapping);
  const manifest = {
    formatVersion: 'activus-legacy-ejson-v1',
    sourceSystem: 'legacy-activus-mongodb',
    datasetId: 'sanitized-test',
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
        records: items.length,
        sha256: hash(activities),
      },
    ],
    mappingFile: 'mapping-decisions.json',
    mappingSha256: hash(decisions),
  };
  await fs.writeFile(join(input, 'kinds.ndjson'), kinds);
  await fs.writeFile(join(input, 'activities.ndjson'), activities);
  await fs.writeFile(join(input, 'mapping-decisions.json'), decisions);
  await fs.writeFile(join(input, 'manifest.json'), JSON.stringify(manifest));
  return { root, input };
}

it('decodes the actual BSON/date-string formats, preserves exact precision and exercises approved mappings', async () => {
  expect(instant('2025-12-03 13:00:43.697+00', true)).toBe(
    '2025-12-03T13:00:43.697Z',
  );
  expect(() => instant('2025-02-30 13:00:43.697+00', true)).toThrow();
  expect(numeric({ $numberDouble: '4030.0000000000005' })).toBe(
    '4030.0000000000005',
  );
  const a = {
    ...activity(1),
    distance: { $numberDouble: '4030.0000000000005' },
  };
  const { input } = await fixture([
    a,
    { ...activity(2), when: date('2026-03-29T01:30:00.000Z') },
  ]);
  const report = await dryRun(input);
  expect(report.summary).toMatchObject({
    recordsRead: 3,
    decoded: 3,
    blocked: 1,
    normalizable: 2,
  });
  const first = report.records.find(
    (r) => r.sourceId === a._id.$oid,
  )?.candidate;
  expect(first).toMatchObject({
    activityDate: '2026-01-02',
    startedAt: null,
    startResolved: true,
    target: { kind: 'Walking', variant: 'Outdoor', resolved: true },
  });
  expect(first && 'measurements' in first && first.measurements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field: 'distance',
        value: '4030.0000000000005',
        resolved: false,
      }),
      expect.objectContaining({
        field: 'ascent',
        sourceField: 'elevation',
        value: '10',
      }),
    ]),
  );
  expect(
    first &&
      'measurements' in first &&
      first.measurements.some((m) => m.field === 'steps'),
  ).toBe(false);
  expect(
    report.issues.some((i) => i.code === 'NUMERIC_PRECISION_PENDING'),
  ).toBe(true);
  expect(report.safety.safeToContinueToApplyStages).toBe(false);
});

it('reports malformed items and missing IDs without losing valid neighbors', async () => {
  const missing = { ...activity(3), _id: null };
  const { input } = await fixture([
    activity(1),
    '{"PRIVATE BROKEN NOTE":',
    missing,
    activity(2),
  ]);
  const report = await dryRun(input);
  expect(report.summary).toMatchObject({
    recordsRead: 5,
    decoded: 3,
    skipped: 2,
    normalizable: 3,
  });
  expect(
    report.issues
      .filter((i) => i.severity === 'error')
      .map((i) => i.code)
      .sort(),
  ).toEqual(['RECORD_MALFORMED', 'SOURCE_ID_INVALID']);
  expect(JSON.stringify(report)).not.toContain('PRIVATE');
});

it('blocks every member of a duplicate identity group instead of collapsing documents', async () => {
  const { input } = await fixture([
    activity(1),
    { ...activity(1), distance: int(2000) },
    activity(2),
  ]);
  const report = await dryRun(input);
  expect(report.summary).toMatchObject({
    recordsRead: 4,
    duplicateIdentities: 1,
    blocked: 2,
    normalizable: 2,
  });
  expect(
    report.records
      .filter((r) => r.sourceId === activity(1)._id.$oid)
      .every((r) => r.status === 'blocked'),
  ).toBe(true);
  expect(
    report.issues.filter((i) => i.code === 'SOURCE_ID_DUPLICATE'),
  ).toHaveLength(2);
});

it('reports pending mappings and broken references, and rejects mismatched package checksums', async () => {
  const mapping = decision();
  mapping.kinds = [];
  const { input } = await fixture(
    [activity(1), { ...activity(2), kindId: oid('f'.repeat(24)) }],
    mapping,
  );
  const report = await dryRun(input);
  expect(report.summary.brokenReferences).toBe(1);
  expect(report.issues.map((i) => i.code)).toEqual(
    expect.arrayContaining([
      'KIND_MAPPING_PENDING',
      'ACTIVITY_KIND_MAPPING_PENDING',
      'REFERENCE_BROKEN',
    ]),
  );
  await fs.appendFile(join(input, 'activities.ndjson'), '\n');
  const changed = await dryRun(input);
  expect(
    changed.issues.some((i) => i.code === 'SOURCE_CHECKSUM_MISMATCH'),
  ).toBe(true);
  expect(changed.safety.safeToContinueToApplyStages).toBe(false);
});

it('runs deterministically without filesystem mutations or database access; only explicit reports are written and apply is rejected', async () => {
  const { input, root } = await fixture([activity(2), activity(1)]);
  const before = await fs.readFile(join(input, 'activities.ndjson'));
  const mutations = [
    'writeFile',
    'appendFile',
    'open',
    'mkdir',
    'rename',
    'rm',
  ] as const;
  const spies = mutations.map((name) =>
    vi
      .spyOn(fs, name)
      .mockClear()
      .mockImplementation(() => {
        throw new Error('Mutation during dry run');
      }),
  );
  const first = await dryRun(input);
  const second = await dryRun(input);
  expect(first).toEqual(second);
  expect(first.safety).toMatchObject({
    databaseConnections: 0,
    databaseWrites: 0,
    sourceUnchanged: true,
    safeToContinueToApplyStages: true,
  });
  for (const spy of spies) {
    expect(spy).not.toHaveBeenCalled();
    spy.mockReset();
  }
  const output = join(root, 'report.json');
  const print = vi.fn();
  expect(
    await runCli(['--apply', '--input', input, '--report', output], print),
  ).toBe(2);
  await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await runCli(['--input', input, '--report', output], print)).toBe(0);
  expect(await runCli(['--input', input, '--report', output], print)).toBe(0);
  expect(JSON.parse(await fs.readFile(output, 'utf8'))).toEqual(first);
  expect(
    await runCli(
      ['--input', input, '--report', join(input, 'activities.ndjson')],
      print,
    ),
  ).toBe(2);
  expect(await fs.readFile(join(input, 'activities.ndjson'))).toEqual(before);
  expect(JSON.stringify(first)).not.toMatch(/PRIVATE|userId":\s*"/);
});
