import process from 'node:process';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dryRun } from './dry-run.js';
import { terminalSummary, writeReport } from './report.js';

const help = `Usage: pnpm import:legacy --input <export-directory> [--report <report.json>] [--dry-run]

Reads kinds.ndjson and activities.ndjson (canonical Extended JSON).
Validates manifest.json and mapping-decisions.json when supplied; missing
configuration is reported as blocking while record inspection continues.
Default report: .artifacts/legacy-import/dry-run.json (relative to working directory).
Reports must be outside the export directory. Only existing Activus reports may be replaced.
Without --stage, source inspection uses no database connection.
--stage reference-data --report <path> previews the configured PostgreSQL target.
Add --apply to transactionally write only reference records and their ID ledger.
--stage activities --report <path> previews activities using the persisted mappings.
Add --apply to atomically import activities and measurements; references are unchanged.
Exit codes: 0 = source checks passed; 1 = blocking report issues; 2 = CLI/output failure.`;

export async function runCli(
  args: string[],
  print: (text: string) => void = (text) => process.stdout.write(text + '\n'),
): Promise<number> {
  let options;
  try {
    options = parseArgs({
      args,
      allowPositionals: false,
      options: {
        input: { type: 'string' },
        report: { type: 'string' },
        'dry-run': { type: 'boolean' },
        apply: { type: 'boolean' },
        stage: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }).values;
  } catch {
    print('Invalid arguments. Use --help for accepted options.');
    return 2;
  }
  if (
    (options.apply && !options.stage) ||
    (options.stage &&
      !['reference-data', 'activities'].includes(options.stage)) ||
    (options.apply && options['dry-run'])
  ) {
    print(
      'Apply mode is unavailable in Phase 5B. No export files read and no data imported.',
    );
    return 2;
  }
  if (options.help) {
    print(help);
    return 0;
  }
  if (!options.input?.trim() || options.report === '') {
    print(
      'An explicit --input export directory is required; report path must not be empty. Use --help.',
    );
    return 2;
  }
  try {
    const report = await dryRun(options.input);
    if (options.stage) {
      if (!options.report?.trim()) {
        print('Reference stage requires an explicit --report path.');
        return 2;
      }
      const { loadRootEnv } = await import('../../config/load-env.js');
      const { parseEnv, requireDatabase } = await import('../../config/env.js');
      const { createDatabase } = await import('../../db/client.js');
      const { pino } = await import('pino');
      const { previewReferences, applyReferences } =
        await import('./reference-stage.js');
      loadRootEnv();
      const database = createDatabase(
        requireDatabase(parseEnv(process.env)),
        pino({ level: 'silent' }),
      );
      try {
        await database.open();
        if (options.stage === 'activities') {
          const { loadActivitySource, previewActivities, applyActivities } =
            await import('./activity-stage.js');
          const source = await loadActivitySource(options.input);
          const preview = await previewActivities(database.db, source);
          await writeReport(options.report, options.input, preview);
          print(
            `Activity preview: ${JSON.stringify(preview.counts)}. Safe to apply: ${preview.safeToApply}.`,
          );
          const result = options.apply
            ? await applyActivities(database.db, options.input, preview)
            : preview;
          await writeReport(options.report, options.input, result);
          print(
            `Transaction: ${result.transaction}. Created ${result.counts.created} activities and ${result.counts.createdMeasurements} measurements. Complete: ${result.complete}.`,
          );
          print(`Report: ${resolve(options.report)}`);
          return result.safeToApply && result.transaction !== 'rolled-back'
            ? 0
            : 1;
        }
        const preview = await previewReferences(database.db, report);
        // Validate and persist the concrete preview before any import writes.
        await writeReport(options.report, options.input, preview);
        print(
          `Reference preview: ${JSON.stringify(preview.plan.counts)}. Writes: reference records and stable ID mappings only.`,
        );
        const result = options.apply
          ? await applyReferences(database.db, options.input, report, preview)
          : preview;
        await writeReport(options.report, options.input, result);
        print(
          `Transaction: ${result.transaction}. Phase 5D ready: ${result.readiness.readyForActivityImport}. Activity writes: 0.`,
        );
        print(`Report: ${resolve(options.report)}`);
        return result.plan.counts.block || result.transaction === 'rolled-back'
          ? 1
          : 0;
      } finally {
        await database.close();
      }
    }
    await writeReport(
      options.report ?? '.artifacts/legacy-import/dry-run.json',
      options.input,
      report,
    );
    print(terminalSummary(report));
    print(
      `Report: ${resolve(options.report ?? '.artifacts/legacy-import/dry-run.json')}`,
    );
    return report.summary.errors ? 1 : 0;
  } catch {
    print(
      'Import command failed. Check database access, migrations and report path. If apply was requested, inspect the ledger with a new preview before retrying; report output can fail after commit.',
    );
    return 2;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = await runCli(process.argv.slice(2));
