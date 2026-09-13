// Read-only analysis of the supplied canonical Extended JSON exports.
// No application imports, environment files, database access, or output files.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { log } from 'node:console';

const directory = process.argv[2];
if (!directory)
  throw new Error(
    'Usage: node scripts/import/analyze-legacy-ndjson.mjs <data-directory> [old-array-directory]',
  );
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const snapshots = [];
const read = (path) => {
  if (statSync(path).size > 32 * 1024 * 1024)
    throw new Error('Input exceeds 32 MiB; use a streaming scanner');
  const bytes = readFileSync(path);
  snapshots.push({ path, hash: hash(bytes) });
  return bytes;
};
const counts = (values) =>
  Object.fromEntries(
    [...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())].sort(
      ([a], [b]) => a.localeCompare(b),
    ),
  );
const type = (v) =>
  v === null
    ? 'null'
    : Array.isArray(v)
      ? 'array'
      : typeof v !== 'object'
        ? typeof v
        : Object.keys(v).sort().join('+');
const oid = (v) =>
  v && Object.keys(v).length === 1 && /^[0-9a-f]{24}$/.test(v.$oid)
    ? v.$oid
    : null;
const numText = (v) => {
  if (!v || typeof v !== 'object' || Object.keys(v).length !== 1) return null;
  const key = Object.keys(v)[0];
  return [
    '$numberInt',
    '$numberLong',
    '$numberDouble',
    '$numberDecimal',
  ].includes(key) && typeof v[key] === 'string'
    ? v[key]
    : null;
};
const date = (v) => {
  // Observed kind metadata are BSON strings, not malformed canonical EJSON.
  if (typeof v === 'string') {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\+00$/.test(v))
      return null;
    const iso = v.replace(' ', 'T').replace(/\+00$/, 'Z');
    const millis = Date.parse(iso);
    return Number.isFinite(millis) && new Date(millis).toISOString() === iso
      ? iso
      : null;
  }
  if (
    !v ||
    Object.keys(v).length !== 1 ||
    !v.$date ||
    Object.keys(v.$date).length !== 1
  )
    return null;
  const millis = v.$date.$numberLong;
  if (typeof millis !== 'string' || !/^-?\d+$/.test(millis)) return null;
  const n = Number(millis);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 8640000000000000) return null;
  return new Date(n).toISOString();
};
const numericFields = [
  'distance',
  'duration',
  'elevation',
  'ascent',
  'calories',
  'steps',
  'avgHR',
  'cadenceAvg',
];
const load = (name) => {
  const bytes = read(resolve(directory, name));
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const lines = text.split('\n');
  const rows = [];
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      throw new Error(
        `${name}: invalid JSON at line ${index + 1}; contents suppressed`,
      );
    }
    if (!row || typeof row !== 'object' || Array.isArray(row))
      throw new Error(`${name}: expected document at line ${index + 1}`);
    rows.push(row);
  }
  const fields = [...new Set(rows.flatMap(Object.keys))].sort();
  return {
    rows,
    report: {
      bytes: bytes.length,
      sha256: hash(bytes),
      records: rows.length,
      bom: bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
      encoding: 'UTF-8',
      format: 'NDJSON',
      crlf: (text.match(/\r\n/g) ?? []).length,
      bareLf: (text.match(/(?<!\r)\n/g) ?? []).length,
      blankLines: lines.filter(
        (l, i) => !l.trim() && !(i === lines.length - 1 && l === ''),
      ).length,
      shapes: counts(rows.map((r) => Object.keys(r).sort().join(','))),
      fields: Object.fromEntries(
        fields.map((field) => {
          const present = rows
            .filter((r) => Object.hasOwn(r, field))
            .map((r) => r[field]);
          const strings = present.filter((v) => typeof v === 'string');
          return [
            field,
            {
              types: counts(present.map(type)),
              missing: rows.length - present.length,
              null: present.filter((v) => v === null).length,
              empty: strings.filter((v) => v === '').length,
              whitespaceOnly: strings.filter((v) => v !== '' && !v.trim())
                .length,
              needsTrim: strings.filter((v) => v !== v.trim()).length,
              maxLength: strings.length
                ? Math.max(...strings.map((v) => [...v].length))
                : null,
            },
          ];
        }),
      ),
      invalidOrMissingIds: rows.filter((r) => !oid(r._id)).length,
      duplicateIds:
        rows.filter((r) => oid(r._id)).length -
        new Set(rows.map((r) => oid(r._id)).filter(Boolean)).size,
    },
  };
};
const kinds = load('kinds.ndjson');
const activities = load('activities.ndjson');
const rows = activities.rows;
const kindName = (r) =>
  kinds.rows.find((k) => oid(k._id) === oid(r.kindId))?.name ?? '<unknown>';
const scale = (text) => {
  const [mantissa, exponent = '0'] = text.toLowerCase().split('e');
  return Math.max(
    0,
    (mantissa.split('.')[1]?.replace(/0+$/, '').length ?? 0) - Number(exponent),
  );
};
const numeric = (subset, field) => {
  const present = subset.filter((r) => Object.hasOwn(r, field));
  const texts = present.map((r) => numText(r[field]));
  const valid = texts.filter(
    (v) =>
      v !== null &&
      /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v) &&
      Number.isFinite(Number(v)),
  );
  const values = valid.map(Number);
  return {
    present: present.length,
    missing: subset.length - present.length,
    types: counts(present.map((r) => type(r[field]))),
    invalid: present.length - valid.length,
    zero: values.filter((v) => v === 0).length,
    nonzero: values.filter((v) => v !== 0).length,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    negative: values.filter((v) => v < 0).length,
    fractional: values.filter((v) => !Number.isInteger(v)).length,
    maxScale: valid.length ? Math.max(...valid.map(scale)) : null,
    overSixPlaces: valid.filter((v) => scale(v) > 6).length,
    overPrecision: present
      .filter((r) => {
        const t = numText(r[field]);
        return t !== null && scale(t) > 6;
      })
      .map((r) => ({ sourceId: oid(r._id), lexeme: numText(r[field]) })),
    outsideSafeMagnitude: values.filter(
      (v) => Math.abs(v) > Number.MAX_SAFE_INTEGER,
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
const parts = (s) =>
  Object.fromEntries(
    helsinki.formatToParts(new Date(s)).map((p) => [p.type, p.value]),
  );
const dates = (subset, field) => {
  const values = subset
    .map((r) => date(r[field]))
    .filter(Boolean)
    .sort();
  return {
    valid: values.length,
    missingOrInvalid: subset.length - values.length,
    range: values.length ? [values[0], values.at(-1)] : null,
    utcMidnight: values.filter((s) => s.endsWith('T00:00:00.000Z')).length,
    helsinkiMidnight: values.filter((s) => {
      const p = parts(s);
      return (
        `${p.hour}:${p.minute}:${p.second}` === '00:00:00' &&
        s.endsWith('.000Z')
      );
    }).length,
    differentCalendarDate: values.filter((s) => {
      const p = parts(s);
      return `${p.year}-${p.month}-${p.day}` !== s.slice(0, 10);
    }).length,
    helsinkiOffsets: counts(values.map((s) => parts(s).timeZoneName)),
    springTransitionDay: values.filter((s) => s.startsWith('2026-03-29'))
      .length,
  };
};
const effectiveAscent = (r) =>
  Object.hasOwn(r, 'ascent') ? r.ascent : r.elevation;
const normalized = (v) => (numText(v) === null ? null : Number(numText(v)));
const project = (r) => ({
  title: r.title || '',
  kindName: kindName(r),
  when: date(r.when),
  description: r.description || '',
  distance: normalized(r.distance) || 0,
  duration: normalized(r.duration) || 0,
  ascent: normalized(effectiveAscent(r)) || 0,
  calories: normalized(r.calories) || 0,
  steps: normalized(r.steps) || 0,
  avgHR: normalized(r.avgHR) || 0,
  cadenceAvg: normalized(r.cadenceAvg) || 0,
  createdAt: date(r.createdAt),
  updatedAt: date(r.updatedAt),
});
const grouped = (items, key) => {
  const map = new Map();
  for (const item of items) {
    const k = key(item);
    const group = map.get(k) ?? [];
    group.push(item);
    map.set(k, group);
  }
  return map;
};
const duplicateGroups = [
  ...grouped(rows, (r) => {
    const p = project(r);
    return JSON.stringify([
      p.kindName,
      p.when,
      ...[
        'distance',
        'duration',
        'ascent',
        'calories',
        'steps',
        'avgHR',
        'cadenceAvg',
      ].map((f) => p[f]),
    ]);
  }).values(),
].filter((g) => g.length > 1);
const report = {
  files: {
    'kinds.ndjson': kinds.report,
    'activities.ndjson': activities.report,
  },
  kinds: kinds.rows.map((k) => ({
    sourceId: oid(k._id),
    legacyKindId: k.kindId,
    name: k.name,
    iconName: k.iconName,
    activities: rows.filter((r) => oid(r.kindId) === oid(k._id)).length,
  })),
  unknownKindReferences: rows.filter(
    (r) =>
      !oid(r.kindId) || !kinds.rows.some((k) => oid(k._id) === oid(r.kindId)),
  ).length,
  duplicateKindNames:
    kinds.rows.length -
    new Set(kinds.rows.map((k) => k.name.toLowerCase())).size,
  ownerScope: {
    present: rows.filter((r) => Object.hasOwn(r, 'userId')).length,
    missing: rows.filter((r) => !Object.hasOwn(r, 'userId')).length,
    distinctNonempty: new Set(
      rows
        .filter((r) => typeof r.userId === 'string' && r.userId.trim())
        .map((r) => r.userId),
    ).size,
    // Counts only: never emit owner identifiers.
    distribution: [
      ...grouped(
        rows.filter((r) => Object.hasOwn(r, 'userId')),
        (r) => JSON.stringify(r.userId),
      ).values(),
    ]
      .map((g) => g.length)
      .sort((a, b) => a - b),
  },
  numbers: Object.fromEntries(numericFields.map((f) => [f, numeric(rows, f)])),
  numbersByKind: Object.fromEntries(
    kinds.rows.map((k) => [
      k.name,
      Object.fromEntries(
        numericFields.map((f) => [
          f,
          numeric(
            rows.filter((r) => oid(r.kindId) === oid(k._id)),
            f,
          ),
        ]),
      ),
    ]),
  ),
  dates: Object.fromEntries(
    ['when', 'createdAt', 'updatedAt'].map((f) => [f, dates(rows, f)]),
  ),
  kindDates: Object.fromEntries(
    ['createdAt', 'updatedAt'].map((f) => [f, dates(kinds.rows, f)]),
  ),
  ascent: {
    elevationOnly: rows.filter(
      (r) => Object.hasOwn(r, 'elevation') && !Object.hasOwn(r, 'ascent'),
    ).length,
    ascentOnly: rows.filter(
      (r) => Object.hasOwn(r, 'ascent') && !Object.hasOwn(r, 'elevation'),
    ).length,
    neither: rows.filter(
      (r) => !Object.hasOwn(r, 'ascent') && !Object.hasOwn(r, 'elevation'),
    ).length,
    both: rows
      .filter(
        (r) => Object.hasOwn(r, 'ascent') && Object.hasOwn(r, 'elevation'),
      )
      .map((r) => ({
        sourceId: oid(r._id),
        equal: normalized(r.ascent) === normalized(r.elevation),
        ascent: numText(r.ascent),
        elevation: numText(r.elevation),
      })),
    effective: numeric(
      rows.map((r) => ({ ...r, effectiveAscent: effectiveAscent(r) })),
      'effectiveAscent',
    ),
  },
  zeroRecords: rows.filter((r) =>
    numericFields.some(
      (f) => numText(r[f]) !== null && Number(numText(r[f])) === 0,
    ),
  ).length,
  unsupportedNonzeroRecords: rows.filter((r) =>
    ['calories', 'avgHR', 'cadenceAvg'].some(
      (f) => numText(r[f]) !== null && Number(numText(r[f])) !== 0,
    ),
  ).length,
  duplicateLooking: {
    groups: duplicateGroups.length,
    records: duplicateGroups.reduce((s, g) => s + g.length, 0),
    sourceIds: duplicateGroups.map((g) => g.map((r) => oid(r._id))),
  },
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
  updatedBeforeCreated: rows.filter(
    (r) =>
      date(r.updatedAt) &&
      date(r.createdAt) &&
      date(r.updatedAt) < date(r.createdAt),
  ).length,
};
if (process.argv[3]) {
  const old = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(
      read(resolve(process.argv[3], 'activities.json')),
    ),
  );
  const fields = [
    'title',
    'kindName',
    'when',
    'description',
    'distance',
    'duration',
    'ascent',
    'calories',
    'steps',
    'avgHR',
    'cadenceAvg',
    'createdAt',
    'updatedAt',
  ];
  const key = (r) => JSON.stringify(fields.map((f) => r[f]));
  const rawByProjection = grouped(rows, (r) => key(project(r)));
  const matchedIds = new Set();
  let unmatched = 0,
    ambiguous = 0;
  const unmatchedOldRows = [];
  for (const r of old) {
    const matches = rawByProjection.get(key(r)) ?? [];
    if (matches.length === 1 && !matchedIds.has(oid(matches[0]._id)))
      matchedIds.add(oid(matches[0]._id));
    else if (matches.length === 0) {
      unmatched++;
      unmatchedOldRows.push(r);
    } else ambiguous++;
  }
  const extra = rows.filter((r) => !matchedIds.has(oid(r._id)));
  const candidates = unmatchedOldRows.map((oldRow) => {
    const matches = extra.filter((r) => {
      const p = project(r);
      return p.when === oldRow.when && p.kindName === oldRow.kindName;
    });
    return {
      candidateCount: matches.length,
      candidates: matches.map((r) => {
        const p = project(r);
        const differences = fields.filter((f) => p[f] !== oldRow[f]);
        return {
          sourceId: oid(r._id),
          kind: p.kindName,
          fields: differences,
          numericChanges: Object.fromEntries(
            differences
              .filter((f) => numericFields.includes(f))
              .map((f) => [f, { old: oldRow[f], rawProjected: p[f] }]),
          ),
        };
      }),
    };
  });
  const metadataOnlyIds = new Set(
    candidates
      .filter(
        (g) =>
          g.candidateCount === 1 &&
          g.candidates[0].fields.length === 1 &&
          g.candidates[0].fields[0] === 'updatedAt',
      )
      .map((g) => g.candidates[0].sourceId),
  );
  const additional = extra.filter((r) => !metadataOnlyIds.has(oid(r._id)));
  report.comparison = {
    oldRecords: old.length,
    uniqueExactProjectionMatches: matchedIds.size,
    unmatchedOld: unmatched,
    ambiguousOld: ambiguous,
    rawOutsideExactMatches: extra.length,
    outsideMatchKinds: counts(extra.map(kindName)),
    outsideMatchDates: dates(extra, 'when'),
    sameKindAndInstantCandidates: candidates,
    uniqueUpdatedAtOnlyCandidates: metadataOnlyIds.size,
    additionalProjectionRows: additional.length,
    additionalKinds: counts(additional.map(kindName)),
    additionalDates: dates(additional, 'when'),
    note: 'Comparison only; projection includes notes in memory but never emits them. Not an identity or deduplication rule.',
  };
}
report.sourceHashesUnchanged = snapshots.every(
  ({ path, hash: before }) => hash(readFileSync(path)) === before,
);
if (!report.sourceHashesUnchanged)
  throw new Error('Source changed during scan');
log(JSON.stringify(report, null, 2));
