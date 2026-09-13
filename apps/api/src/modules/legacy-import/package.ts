import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { TextDecoder } from 'node:util';
import { z } from 'zod';
import type { Issue } from './types.js';

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const oid = z.string().regex(/^[a-f0-9]{24}$/);
export const zeroFields = [
  'distance',
  'duration',
  'ascent',
  'calories',
  'steps',
  'avgHR',
  'cadenceAvg',
] as const;
const zeroPolicy = z.enum(['preserve', 'omit']).nullable();
export const MappingSchema = z.strictObject({
  version: z.literal(1),
  calendarTimezone: z.enum(['UTC', 'Europe/Helsinki']).nullable(),
  midnightDateOnly: z.boolean().nullable(),
  zeroPolicy: z.strictObject({
    distance: zeroPolicy,
    duration: zeroPolicy,
    ascent: zeroPolicy,
    calories: zeroPolicy,
    steps: zeroPolicy,
    avgHR: zeroPolicy,
    cadenceAvg: zeroPolicy,
  }),
  unsupportedUnits: z.literal('named-unitless').nullable(),
  kinds: z
    .array(
      z.strictObject({
        sourceId: oid,
        targetKind: z.string().min(1).max(120).nullable(),
        targetVariant: z.enum(['Outdoor', 'Treadmill']).nullable(),
        presentationApproved: z.boolean(),
        descriptionLossApproved: z.boolean(),
      }),
    )
    .max(100),
  precisionExceptions: z
    .array(
      z.strictObject({
        sourceId: oid,
        field: z.literal('distance'),
        from: z.literal('4030.0000000000005'),
        to: z.literal('4030'),
      }),
    )
    .max(100),
});
export type Mapping = z.infer<typeof MappingSchema>;
export const ManifestSchema = z
  .strictObject({
    formatVersion: z.literal('activus-legacy-ejson-v1'),
    sourceSystem: z.literal('legacy-activus-mongodb'),
    datasetId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    sourceDatabase: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,64}$/)
      .nullable(),
    exportedAt: z.iso.datetime().nullable(),
    exportTool: z
      .strictObject({
        name: z.string().min(1).max(80),
        version: z.string().min(1).max(80),
      })
      .nullable(),
    provenanceUnknown: z.boolean(),
    consistency: z.enum(['writes-paused', 'restored-backup', 'unknown']),
    ownerScope: z.enum(['all-records-confirmed', 'pending']),
    files: z
      .array(
        z.strictObject({
          filename: z.enum(['kinds.ndjson', 'activities.ndjson']),
          collection: z.enum(['kinds', 'activities']),
          records: z.number().int().nonnegative().safe(),
          sha256: sha,
        }),
      )
      .length(2),
    mappingFile: z.literal('mapping-decisions.json'),
    mappingSha256: sha,
  })
  .refine(
    (m) =>
      new Set(m.files.map((f) => f.collection)).size === 2 &&
      m.files.every((f) => f.filename === `${f.collection}.ndjson`),
    'Each source collection must appear exactly once',
  )
  .refine(
    (m) =>
      m.provenanceUnknown ||
      (m.sourceDatabase !== null &&
        m.exportedAt !== null &&
        m.exportTool !== null &&
        m.consistency !== 'unknown'),
    'Unknown provenance must be acknowledged',
  );
export type Manifest = z.infer<typeof ManifestSchema>;
export interface PackageConfig {
  manifest: Manifest | null;
  mapping: Mapping | null;
  hashes: Record<string, string>;
}
export async function readPackage(
  directory: string,
  issues: Issue[],
): Promise<PackageConfig> {
  const add = (code: string, field: string, message: string) =>
    issues.push({
      severity: 'error',
      code,
      collection: 'package',
      line: 0,
      sourceId: null,
      field,
      message,
    });
  const hashes: Record<string, string> = {};
  async function read(name: string): Promise<unknown> {
    try {
      const path = join(directory, name);
      const info = await stat(path);
      if (!info.isFile() || info.size > 1024 * 1024)
        throw new Error('Invalid config file');
      const bytes = await readFile(path);
      hashes[name] = createHash('sha256').update(bytes).digest('hex');
      const text = new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
      return JSON.parse(text) as unknown;
    } catch {
      add(
        'PACKAGE_CONFIG_UNAVAILABLE',
        name,
        'Missing, unreadable, oversized or invalid configuration; dry-run inspection continues, apply readiness is blocked.',
      );
      return null;
    }
  }
  const rawManifest = await read('manifest.json');
  const rawMapping = await read('mapping-decisions.json');
  const m = ManifestSchema.safeParse(rawManifest);
  const d = MappingSchema.safeParse(rawMapping);
  if (rawManifest !== null && !m.success)
    add(
      'MANIFEST_INVALID',
      'manifest.json',
      'Manifest does not match the documented v1 contract.',
    );
  if (rawMapping !== null && !d.success)
    add(
      'MAPPING_INVALID',
      'mapping-decisions.json',
      'Mapping does not match the documented v1 contract.',
    );
  let mapping = d.success ? d.data : null;
  if (
    mapping &&
    (new Set(mapping.kinds.map((k) => k.sourceId)).size !==
      mapping.kinds.length ||
      new Set(mapping.precisionExceptions.map((e) => e.sourceId)).size !==
        mapping.precisionExceptions.length)
  ) {
    add(
      'MAPPING_AMBIGUOUS',
      'mapping-decisions.json',
      'Duplicate source-kind mappings or numeric exceptions.',
    );
    mapping = null;
  }
  if (m.success && hashes['mapping-decisions.json'] !== m.data.mappingSha256) {
    add(
      'MAPPING_CHECKSUM_MISMATCH',
      'mapping-decisions.json',
      'Mapping bytes do not match the manifest checksum.',
    );
    mapping = null;
  }
  if (!m.success) mapping = null; // Unbound decisions must never masquerade as approved mappings.
  return { manifest: m.success ? m.data : null, mapping, hashes };
}
