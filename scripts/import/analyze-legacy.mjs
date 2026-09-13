// Read-only inventory of the legacy app's small JSON-array exports.
// Never loads legacy application code, environment files, or database drivers.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { log } from 'node:console';

const directory = process.argv[2];
if (!directory)
  throw new Error(
    'Usage: node scripts/import/analyze-legacy.mjs <legacy-data-directory>',
  );
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const count = (values) =>
  Object.fromEntries(
    [...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())].sort(
      ([a], [b]) => a.localeCompare(b),
    ),
  );
const numericFields = [
  'distance',
  'duration',
  'ascent',
  'calories',
  'steps',
  'avgHR',
  'cadenceAvg',
];
const expected = {
  'activityKinds.json': ['name', 'iconName', 'description'],
  'activities.json': [
    'title',
    'kindName',
    'when',
    'description',
    ...numericFields,
    'createdAt',
    'updatedAt',
  ],
};
const snapshots = [];
const load = (name) => {
  const path = resolve(directory, name);
  if (statSync(path).size > 32 * 1024 * 1024)
    throw new Error('Input exceeds 32 MiB: use a streaming scanner');
  const bytes = readFileSync(path);
  snapshots.push({ path, hash: digest(bytes) });
  const bom = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let rows;
  const numericLexemes = {};
  try {
    rows = JSON.parse(raw, (key, value, context) => {
      if (numericFields.includes(key) && typeof value === 'number') {
        if (!context?.source)
          throw new Error(
            'Numeric source lexemes require a current Node runtime',
          );
        (numericLexemes[key] ??= []).push(context.source);
      }
      return value;
    });
  } catch {
    throw new Error(
      `${name}: invalid JSON or unsupported runtime (contents suppressed)`,
    );
  }
  if (
    !Array.isArray(rows) ||
    rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))
  )
    throw new Error(`${name}: expected array of objects`);
  const fields = [...new Set(rows.flatMap(Object.keys))].sort();
  const inventory = Object.fromEntries(
    fields.map((field) => {
      const present = rows
        .filter((r) => Object.hasOwn(r, field))
        .map((r) => r[field]);
      const strings = present.filter((v) => typeof v === 'string');
      return [
        field,
        {
          types: count(
            present.map((v) =>
              v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v,
            ),
          ),
          absent: rows.length - present.length,
          null: present.filter((v) => v === null).length,
          empty: strings.filter((v) => v === '').length,
          whitespaceOnly: strings.filter((v) => v !== '' && !v.trim()).length,
          needsTrim: strings.filter((v) => v !== v.trim()).length,
          maxLength: strings.length
            ? Math.max(...strings.map((v) => v.length))
            : null,
          zero: present.filter((v) => v === 0).length,
        },
      ];
    }),
  );
  return {
    rows,
    report: {
      bytes: bytes.length,
      sha256: digest(bytes),
      encoding: 'UTF-8',
      bom,
      format: 'JSON array',
      crlf: (raw.match(/\r\n/g) ?? []).length,
      bareLf: (raw.match(/(?<!\r)\n/g) ?? []).length,
      records: rows.length,
      shapes: count(rows.map((r) => Object.keys(r).sort().join(','))),
      fields: inventory,
      unexpectedFields: fields.filter((f) => !expected[name].includes(f)),
      extendedJsonWrappers: (
        raw.match(
          /"\$(?:oid|date|numberLong|numberDecimal|numberInt|numberDouble)"\s*:/g,
        ) ?? []
      ).length,
      missingIds: rows.filter((r) => !r._id).length,
      duplicateIdExcess:
        rows.filter((r) => r._id).length -
        new Set(rows.filter((r) => r._id).map((r) => JSON.stringify(r._id)))
          .size,
      numericLexemes: Object.fromEntries(
        Object.entries(numericLexemes).map(([field, values]) => [
          field,
          {
            nonPlainInteger: values.filter((v) => !/^-?\d+$/.test(v)),
            differsFromNumberString: values.filter(
              (v) => String(Number(v)) !== v,
            ).length,
          },
        ]),
      ),
    },
  };
};
const kinds = load('activityKinds.json');
const activities = load('activities.json');
const rows = activities.rows;
const numbers = (subset, field) => {
  const values = subset
    .map((r) => r[field])
    .filter((v) => typeof v === 'number');
  const scale = (v) => {
    const [m, e = '0'] = String(v).split('e');
    return Math.max(0, (m.split('.')[1]?.length ?? 0) - Number(e));
  };
  return {
    count: values.length,
    nonzero: values.filter((v) => v !== 0).length,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    maxScale: values.length ? Math.max(...values.map(scale)) : null,
    negative: values.filter((v) => v < 0).length,
    fractional: values.filter((v) => !Number.isInteger(v)).length,
    overSixPlaces: values.filter((v) => scale(v) > 6).length,
    outsideSafeMagnitude: values.filter(
      (v) => !Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER,
    ).length,
    numericStrings: subset.filter(
      (r) =>
        typeof r[field] === 'string' && /^-?\d+(?:[.,]\d+)?$/.test(r[field]),
    ).length,
  };
};
const helsinki = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Helsinki',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'shortOffset',
});
const localParts = (date) =>
  Object.fromEntries(
    helsinki.formatToParts(date).map((p) => [p.type, p.value]),
  );
const temporal = (field) => {
  const valid = rows
    .map((r) => r[field])
    .filter((v) => typeof v === 'string' && Number.isFinite(Date.parse(v)));
  const dates = valid.map((v) => new Date(v));
  return {
    present: rows.filter((r) => Object.hasOwn(r, field)).length,
    valid: valid.length,
    missingOrInvalid: rows.length - valid.length,
    range: dates.length
      ? [
          new Date(Math.min(...dates)).toISOString(),
          new Date(Math.max(...dates)).toISOString(),
        ]
      : null,
    formats: count(
      valid.map((v) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
          ? 'ISO milliseconds Z'
          : /^\d{4}-\d{2}-\d{2}$/.test(v)
            ? 'date-only'
            : 'other',
      ),
    ),
    offsets: count(
      valid.map((v) => v.match(/(?:Z|[+-]\d{2}:\d{2})$/)?.[0] ?? 'absent'),
    ),
    utcMidnight: dates.filter(
      (d) => d.toISOString().slice(11) === '00:00:00.000Z',
    ).length,
    helsinkiMidnight: dates.filter((d) => {
      const p = localParts(d);
      return (
        `${p.hour}:${p.minute}:${p.second}` === '00:00:00' &&
        d.getUTCMilliseconds() === 0
      );
    }).length,
    helsinkiDateDiffersFromUtc: dates.filter((d) => {
      const p = localParts(d);
      return `${p.year}-${p.month}-${p.day}` !== d.toISOString().slice(0, 10);
    }).length,
    helsinkiOffsets: count(dates.map((d) => localParts(d).timeZoneName)),
  };
};
const duplicateSummary = (keys) => {
  const groups = new Map();
  rows.forEach((r, index) => {
    const key = JSON.stringify(keys.map((k) => r[k]));
    const group = groups.get(key) ?? [];
    group.push(index + 1);
    groups.set(key, group);
  });
  const duplicates = [...groups.values()].filter((g) => g.length > 1);
  return {
    groups: duplicates.length,
    records: duplicates.reduce((s, g) => s + g.length, 0),
    excess: duplicates.reduce((s, g) => s + g.length - 1, 0),
    oneBasedIndices: duplicates,
  };
};
const report = {
  files: {
    'activityKinds.json': kinds.report,
    'activities.json': activities.report,
  },
  kinds: kinds.rows.map((k) => ({
    name: k.name,
    iconName: k.iconName,
    activities: rows.filter((r) => r.kindName === k.name).length,
  })),
  duplicateKindNames:
    kinds.rows.length -
    new Set(kinds.rows.map((r) => r.name.toLowerCase())).size,
  unknownKindReferences: rows.filter(
    (r) => !kinds.rows.some((k) => k.name === r.kindName),
  ).length,
  numbers: Object.fromEntries(numericFields.map((f) => [f, numbers(rows, f)])),
  numbersByKind: Object.fromEntries(
    kinds.rows.map((k) => [
      k.name,
      Object.fromEntries(
        numericFields.map((f) => [
          f,
          numbers(
            rows.filter((r) => r.kindName === k.name),
            f,
          ),
        ]),
      ),
    ]),
  ),
  dates: Object.fromEntries(
    ['when', 'createdAt', 'updatedAt'].map((f) => [f, temporal(f)]),
  ),
  duplicateLooking: duplicateSummary(['kindName', 'when', ...numericFields]),
  identicalExportDocuments: duplicateSummary(Object.keys(rows[0] ?? {}).sort()),
  textLimits: {
    titleOver200: rows.filter(
      (r) => typeof r.title === 'string' && [...r.title.trim()].length > 200,
    ).length,
    notesOver10000: rows.filter(
      (r) =>
        typeof r.description === 'string' &&
        [...r.description.trim()].length > 10000,
    ).length,
  },
  recordsWithZero: rows.filter((r) => numericFields.some((f) => r[f] === 0))
    .length,
  recordsWithUnsupportedNonzeroUnits: rows.filter((r) =>
    ['calories', 'avgHR', 'cadenceAvg'].some((f) => r[f] !== 0),
  ).length,
  recordsWithWhenEqualCreated: rows.filter(
    (r) => r.when && r.when === r.createdAt,
  ).length,
  whenOnHelsinkiSpringTransitionDate: rows.filter((r) =>
    r.when?.startsWith('2026-03-29'),
  ).length,
  updatedBeforeCreated: rows.filter(
    (r) => Date.parse(r.updatedAt) < Date.parse(r.createdAt),
  ).length,
};
report.sourceHashesUnchanged = snapshots.every(
  ({ path, hash }) => digest(readFileSync(path)) === hash,
);
if (!report.sourceHashesUnchanged)
  throw new Error('Source changed during scan');
log(JSON.stringify(report, null, 2));
