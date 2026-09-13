import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DryRunReport } from './dry-run.js';
import type { ReferenceReport } from './reference-stage.js';
import type { ActivityImportReport } from './activity-stage.js';

function inside(path: string, directory: string) {
  const rel = relative(directory, path);
  return (
    rel === '' ||
    (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
  );
}
async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) throw new Error('Output path cannot be resolved.');
    return resolve(await canonical(parent), relative(parent, path));
  }
}
// Sole write boundary. Never write within the source directory, through symlinks,
// or to an existing hardlink. Atomic replacement supports deterministic reruns.
export async function writeReport(
  path: string,
  input: string,
  report: DryRunReport | ReferenceReport | ActivityImportReport,
) {
  const destination = resolve(path);
  const source = await canonical(resolve(input));
  if (inside(await canonical(destination), source))
    throw new Error('Report output must be outside the export directory.');
  try {
    const existing = await lstat(destination);
    if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink > 1)
      throw new Error('Report output must be a regular file without aliases.');
    const previous: unknown = JSON.parse(await readFile(destination, 'utf8'));
    if (
      !previous ||
      typeof previous !== 'object' ||
      !('reportVersion' in previous) ||
      ![
        'activus-legacy-dry-run-v1',
        'activus-legacy-reference-v1',
        'activus-legacy-activities-v1',
      ].includes(String(previous.reportVersion))
    )
      throw new Error(
        'Refusing to overwrite a file that is not an Activus dry-run report.',
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = resolve(
    dirname(destination),
    `.legacy-report-${randomUUID()}.tmp`,
  );
  let created = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    created = true;
    try {
      await file.writeFile(JSON.stringify(report, null, 2) + '\n', 'utf8');
    } finally {
      await file.close();
    }
    await rename(temporary, destination);
  } finally {
    if (created) await rm(temporary, { force: true });
  }
}
export function terminalSummary(r: DryRunReport): string {
  return [
    'Activus legacy import — DRY RUN ONLY (apply unavailable)',
    `Read ${r.summary.recordsRead}: ${r.summary.byCollection.kinds?.read ?? 0} kinds, ${r.summary.byCollection.activities?.read ?? 0} activities.`,
    `Decoded ${r.summary.decoded}; normalizable ${r.summary.normalizable}; blocked ${r.summary.blocked}; skipped ${r.summary.skipped}.`,
    `Warnings ${r.summary.warnings}; errors ${r.summary.errors}; duplicate identities ${r.summary.duplicateIdentities}; broken references ${r.summary.brokenReferences}.`,
    'Database connections: 0. Database writes: 0. No database client is loaded.',
    `Source unchanged: ${r.safety.sourceUnchanged ? 'verified' : 'NOT VERIFIED'}. Safe to continue to apply stages: ${r.safety.safeToContinueToApplyStages ? 'source checks passed; target validation still required' : 'NO — resolve report errors'}.`,
  ].join('\n');
}
