import { basename, join, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodeActivity, decodeKind, object, sourceId } from './decode.js';
import { normalizeActivity, normalizeKind } from './mapping.js';
import { readPackage } from './package.js';
import { fingerprint, InputError, readCollection } from './reader.js';
import { collections } from './types.js';
import type {
  Collection,
  FileSummary,
  Issue,
  KindCandidate,
  RecordResult,
  SourceIdentity,
  ActivityCandidate,
} from './types.js';

const approvedHashes: Record<Collection, string> = {
  kinds: 'f93741b04c4d9f9f3f7551369e4dad78e10b49eee8f13cb6f28ba8e0e04751b1',
  activities:
    '005d719d7b1fa03363fc7d63772928fb440b51515ea3704531a2da973819f137',
};
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const grouped = (values: string[]) =>
  Object.fromEntries(
    [...new Set(values)]
      .sort(cmp)
      .map((key) => [key, values.filter((v) => v === key).length]),
  );
const unresolvedCodes = new Set([
  'PACKAGE_CONFIG_UNAVAILABLE',
  'DATASET_ID_PENDING',
  'KIND_MAPPING_PENDING',
  'KIND_MAPPING_MISSING',
  'KIND_MAPPING_UNSUPPORTED',
  'KIND_PRESENTATION_PENDING',
  'KIND_DESCRIPTION_PENDING',
  'ACTIVITY_KIND_MAPPING_PENDING',
  'OWNER_SCOPE_PENDING',
  'MIDNIGHT_POLICY_PENDING',
  'CALENDAR_POLICY_PENDING',
  'ZERO_POLICY_PENDING',
  'NUMERIC_PRECISION_PENDING',
  'UNIT_MAPPING_PENDING',
  'ASCENT_CONFLICT',
  'MAPPING_AMBIGUOUS',
]);

export async function dryRun(
  input: string,
  collect?: (candidate: ActivityCandidate) => void,
) {
  const directory = resolve(input);
  const issues: Issue[] = [];
  const records: RecordResult[] = [];
  const files: FileSummary[] = [];
  let omittedAbsentMeasurements = 0;
  const addPackage = (
    code: string,
    field: string,
    message: string,
    severity: Issue['severity'] = 'error',
  ) =>
    issues.push({
      severity,
      code,
      collection: 'package',
      line: 0,
      sourceId: null,
      field,
      message,
    });
  const before: Partial<Record<Collection, string>> = {};
  try {
    if (!(await stat(directory)).isDirectory()) throw new Error();
  } catch {
    addPackage(
      'INPUT_DIRECTORY_UNREADABLE',
      'input',
      'Supply a readable export directory containing kinds.ndjson and activities.ndjson.',
    );
  }
  const config = await readPackage(directory, issues);
  for (const collection of collections) {
    try {
      before[collection] = await fingerprint(
        join(directory, `${collection}.ndjson`),
      );
    } catch {
      addPackage(
        'SOURCE_UNREADABLE',
        `${collection}.ndjson`,
        'Source file cannot be read; verify input path and file permissions.',
      );
    }
  }
  const approvedSnapshot = collections.every(
    (c) => before[c] === approvedHashes[c],
  );
  if (!config.manifest)
    addPackage(
      'DATASET_ID_PENDING',
      'datasetId',
      'Provide a stable source database-lineage ID in the manifest; source IDs are retained but namespace is unresolved.',
    );
  if (config.manifest) {
    for (const file of config.manifest.files)
      if (before[file.collection] !== file.sha256) {
        addPackage(
          'SOURCE_CHECKSUM_MISMATCH',
          file.filename,
          'Source bytes do not match the manifest; mapping decisions are not trusted.',
        );
        config.mapping = null;
      }
  }
  const confirmed = {
    owner:
      approvedSnapshot ||
      config.manifest?.ownerScope === 'all-records-confirmed',
    midnight: approvedSnapshot || config.mapping?.midnightDateOnly === true,
  };
  if (
    approvedSnapshot &&
    (config.manifest?.ownerScope === 'pending' ||
      config.mapping?.midnightDateOnly === false)
  )
    addPackage(
      'CONFIRMED_DECISION_CONFLICT',
      'mapping-decisions.json',
      'Configuration conflicts with the user-confirmed owner/date-only decisions for this exact snapshot.',
    );
  addPackage(
    'DESTINATION_CHECK_REQUIRED',
    'destination',
    'No database connection is made. Later stages must resolve target UUIDs, archived/name conflicts and effective definitions through domain validation.',
    'warning',
  );
  const kinds = new Map<string, KindCandidate>();
  const kindNames = new Map<string, string[]>();
  const identities = new Map<string, RecordResult[]>();
  for (const collection of collections) {
    if (!before[collection]) continue;
    try {
      files.push(
        await readCollection(
          join(directory, `${collection}.ndjson`),
          collection,
          ({ raw, line, parseError }) => {
            const id = object(raw) ? sourceId(raw._id) : null;
            const result: RecordResult = {
              collection,
              line,
              sourceId: id,
              decoded: false,
              status: 'skipped',
              candidate: null,
            };
            records.push(result);
            const add = (
              severity: Issue['severity'],
              code: string,
              field: string,
              message: string,
            ) =>
              issues.push({
                severity,
                code,
                collection,
                line,
                sourceId: id,
                field,
                message,
              });
            if (id) {
              const key = `${collection}:${id}`;
              const group = identities.get(key) ?? [];
              group.push(result);
              identities.set(key, group);
            }
            if (parseError || !object(raw)) {
              add(
                'error',
                'RECORD_MALFORMED',
                '$',
                'Expected one JSON document per line; contents omitted.',
              );
              return;
            }
            const source: SourceIdentity = {
              system: 'legacy-activus-mongodb',
              datasetId: config.manifest?.datasetId ?? null,
              collection,
              id,
            };
            if (collection === 'kinds') {
              const decoded = decodeKind(raw, add);
              if (!decoded) return;
              result.decoded = true;
              const candidate = normalizeKind(
                decoded,
                source,
                config.mapping,
                add,
              );
              result.candidate = candidate;
              kinds.set(decoded.id, candidate);
              const name = decoded.name.toLowerCase();
              kindNames.set(name, [...(kindNames.get(name) ?? []), decoded.id]);
            } else {
              const decoded = decodeActivity(raw, add);
              if (!decoded) return;
              result.decoded = true;
              const candidate = normalizeActivity(
                decoded,
                source,
                kinds.get(decoded.kindId),
                config.mapping,
                confirmed,
                add,
              );
              omittedAbsentMeasurements += [
                'distance',
                'calories',
                'steps',
                'avgHR',
                'cadenceAvg',
              ].filter(
                (f) =>
                  decoded.numbers[f as keyof typeof decoded.numbers] ===
                  undefined,
              ).length;
              if (
                decoded.numbers.ascent === undefined &&
                decoded.numbers.elevation === undefined
              )
                omittedAbsentMeasurements++;
              collect?.(candidate);
              // Free text stays in the normalized in-memory candidate only. The report is not import input.
              const { name, notes, ...safe } = candidate;
              result.candidate = {
                ...safe,
                hasName: name !== null,
                hasNotes: notes !== null,
              };
            }
          },
        ),
      );
    } catch (error) {
      addPackage(
        error instanceof InputError ? error.code : 'SOURCE_READ_FAILED',
        `${collection}.ndjson`,
        error instanceof InputError
          ? error.message
          : 'Source could not be read; no data was written.',
      );
    }
    if (collection === 'kinds') {
      for (const group of identities.values())
        if (group.length > 1 && group[0]?.sourceId)
          kinds.delete(group[0].sourceId);
      for (const ids of kindNames.values())
        if (ids.length > 1)
          for (const id of ids) {
            kinds.delete(id);
            const record = records.find(
              (r) => r.collection === 'kinds' && r.sourceId === id,
            );
            issues.push({
              severity: 'error',
              code: 'KIND_NAME_AMBIGUOUS',
              collection: 'kinds',
              line: record?.line ?? 0,
              sourceId: id,
              field: 'name',
              message:
                'Multiple source kinds have the same normalized name; mapping is ambiguous.',
            });
          }
    }
  }
  for (const group of identities.values())
    if (group.length > 1)
      for (const record of group)
        issues.push({
          severity: 'error',
          code: 'SOURCE_ID_DUPLICATE',
          collection: record.collection,
          line: record.line,
          sourceId: record.sourceId,
          field: '_id',
          message:
            'Source identity appears more than once; no member of this group is safe to import.',
        });
  for (const m of config.mapping?.kinds ?? [])
    if (!identities.has(`kinds:${m.sourceId}`))
      addPackage(
        'MAPPING_SOURCE_MISSING',
        'kinds',
        'A configured source kind is absent from this export.',
      );
  for (const m of config.mapping?.precisionExceptions ?? [])
    if (!identities.has(`activities:${m.sourceId}`))
      addPackage(
        'MAPPING_SOURCE_MISSING',
        'precisionExceptions',
        'A configured numeric exception refers to an absent activity.',
      );
  for (const expected of config.manifest?.files ?? [])
    if (
      files.find((f) => f.collection === expected.collection)?.recordsRead !==
      expected.records
    )
      addPackage(
        'SOURCE_COUNT_MISMATCH',
        expected.filename,
        'Observed document count does not match the manifest.',
      );
  let sourceUnchanged = collections.every((c) => Boolean(before[c]));
  for (const collection of collections)
    if (before[collection]) {
      try {
        if (
          (await fingerprint(join(directory, `${collection}.ndjson`))) !==
            before[collection] ||
          files.find((f) => f.collection === collection)?.sha256 !==
            before[collection]
        )
          sourceUnchanged = false;
      } catch {
        sourceUnchanged = false;
      }
    }
  for (const [filename, hash] of Object.entries(config.hashes)) {
    try {
      if ((await fingerprint(join(directory, filename))) !== hash)
        sourceUnchanged = false;
    } catch {
      sourceUnchanged = false;
    }
  }
  if (!sourceUnchanged)
    addPackage(
      'SOURCE_UNCHANGED_NOT_VERIFIED',
      'input',
      'Source integrity could not be verified before, during and after scanning.',
    );
  for (const record of records) {
    const blocked = issues.some(
      (i) =>
        i.severity === 'error' &&
        i.collection === record.collection &&
        i.line === record.line,
    );
    record.status = !record.decoded
      ? 'skipped'
      : blocked
        ? 'blocked'
        : 'normalizable';
  }
  issues.sort(
    (a, b) =>
      cmp(
        `${a.collection}\0${a.sourceId ?? ''}`,
        `${b.collection}\0${b.sourceId ?? ''}`,
      ) ||
      a.line - b.line ||
      cmp(
        `${a.field}\0${a.code}\0${a.severity}`,
        `${b.field}\0${b.code}\0${b.severity}`,
      ),
  );
  records.sort(
    (a, b) =>
      cmp(
        `${a.collection}\0${a.sourceId ?? ''}`,
        `${b.collection}\0${b.sourceId ?? ''}`,
      ) || a.line - b.line,
  );
  const errors = issues.filter((i) => i.severity === 'error');
  const measurements = records.flatMap((r) =>
    r.candidate && 'measurements' in r.candidate
      ? r.candidate.measurements
      : [],
  );
  return {
    reportVersion: 'activus-legacy-dry-run-v1' as const,
    mode: 'dry-run' as const,
    referencePolicyFingerprint: createHash('sha256')
      .update(
        JSON.stringify({
          version: config.mapping?.version,
          kinds: config.mapping?.kinds,
          zeroPolicy: config.mapping?.zeroPolicy,
          unsupportedUnits: config.mapping?.unsupportedUnits,
        }),
      )
      .digest('hex'),
    inputName: basename(directory),
    identity: {
      system: 'legacy-activus-mongodb',
      datasetId: config.manifest?.datasetId ?? null,
      sourceNamespace: config.manifest
        ? `legacy-activus-mongodb:${config.manifest.datasetId}`
        : null,
      externalIdFormat: '<collection>:<original MongoDB _id>',
    },
    confirmations: {
      exactPhase5ASnapshot: approvedSnapshot,
      allOwnersIncluded: confirmed.owner,
      midnightDateOnly: confirmed.midnight,
    },
    safety: {
      databaseConnections: 0,
      databaseWrites: 0,
      sourceUnchanged,
      destinationLookups: 'not-performed',
      safeToContinueToApplyStages: errors.length === 0,
      applyAvailable: false,
    },
    files: files.sort((a, b) => cmp(a.collection, b.collection)),
    summary: {
      recordsRead: records.length,
      omittedAbsentMeasurements,
      decoded: records.filter((r) => r.decoded).length,
      normalizable: records.filter((r) => r.status === 'normalizable').length,
      blocked: records.filter((r) => r.status === 'blocked').length,
      skipped: records.filter((r) => r.status === 'skipped').length,
      warnings: issues.length - errors.length,
      errors: errors.length,
      duplicateIdentities: [...identities.values()].filter((g) => g.length > 1)
        .length,
      brokenReferences: errors.filter((i) => i.code === 'REFERENCE_BROKEN')
        .length,
      unresolvedMappings: errors.filter((i) => unresolvedCodes.has(i.code))
        .length,
      byCollection: Object.fromEntries(
        collections.map((c) => [
          c,
          {
            read: records.filter((r) => r.collection === c).length,
            decoded: records.filter((r) => r.collection === c && r.decoded)
              .length,
            normalizable: records.filter(
              (r) => r.collection === c && r.status === 'normalizable',
            ).length,
            blocked: records.filter(
              (r) => r.collection === c && r.status === 'blocked',
            ).length,
            skipped: records.filter(
              (r) => r.collection === c && r.status === 'skipped',
            ).length,
          },
        ]),
      ),
      proposedDestinationRows: {
        activityKinds: records.filter(
          (r) => r.collection === 'kinds' && r.candidate,
        ).length,
        activities: records.filter(
          (r) => r.collection === 'activities' && r.candidate,
        ).length,
        measurementValues: measurements.length,
        resolvedMeasurementValues: measurements.filter((m) => m.resolved)
          .length,
        tags: 0,
        goals: 0,
      },
      byProposedKind: grouped(
        records
          .filter((r) => r.collection === 'activities' && r.candidate)
          .map((r) => r.candidate?.target.kind ?? '[unresolved]'),
      ),
      issuesByCode: grouped(issues.map((i) => i.code)),
    },
    records,
    issues,
  };
}
export type DryRunReport = Awaited<ReturnType<typeof dryRun>>;
