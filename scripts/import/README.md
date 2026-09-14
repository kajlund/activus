# Legacy import

**Maintenance tool: Phase 5 migration completed 2026-09-14.** This command is
retained for audit/reconciliation and is not part of normal application startup.
Prefer read-only `--stage activities` for future checks. Do not normally rerun
apply after manual edits; a content conflict protects those edits. Keep the private
exports, manifest, decisions and reports in their existing ignored locations.
See [migration closure](../../.doc/phase-5b-import-framework-report.md) and the
private `.artifacts/legacy-import/phase-5e-treadmill-review.json` for optional review.

## Phase 5D activities

```powershell
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/activity-preview.json --stage activities
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/activity-apply.json --stage activities --apply
```

Preview validates the full batch against persisted Phase 5C mappings without
writes. Explicit apply commits activities and measurements in one transaction;
source identity makes reruns idempotent. Changed existing content blocks rather
than being overwritten. Repeat preview to reconcile committed data. Reports
contain no titles or notes. See [the migration report](../../.doc/phase-5b-import-framework-report.md)
for exact verification commands, counts and manual-review warnings.

Phase 5B provides source inspection; Phase 5C adds explicit reference-only preview/apply (below). Phase 5A specifications and confirmed activity decisions are in [legacy-import-mapping.md](../../.doc/legacy-import-mapping.md), with [export formats](../../.doc/legacy-export-format.md) and [analysis](../../.doc/legacy-import-analysis.md).

```powershell
npm run import:legacy -- --input data --report .artifacts/legacy-import/dry-run.json
npm run test:import
```

Run from the repository root. For direct execution without the npm script, `node scripts/import/cli.mjs` accepts the same arguments and uses the already-installed API TypeScript runner. Exit 1 means the report contains blocking issues; unresolved mappings are intentionally reported rather than guessed. For source-only inspection, no database connection is made and `--apply` without an explicit database stage is rejected, and reports must be outside the source directory. See the [Phase 5B report](../../.doc/phase-5b-import-framework-report.md) for input/config schemas, safety guarantees, real-run counts and next-stage requirements.

Run the current raw-export inventory with Node 24 (verified on 24.17.0):

```powershell
node scripts/import/analyze-legacy-ndjson.mjs data '../../Node/MongoDB/activus/data'
```

The optional final argument compares the old array snapshot. Omit it for raw-only analysis. This scanner reads `activities.ndjson` and `kinds.ndjson`, preserves observed BSON numeric strings for precision reporting, handles the observed canonical dates and explicit-UTC kind timestamp strings, and inventories IDs, references, missingness and anomalies. It never prints notes/titles or owner IDs. It is a read-only analyzer, not an importer or normalizer.

The original JSON-array scanner remains available for historical comparison:

```powershell
node scripts/import/analyze-legacy.mjs '../../Node/MongoDB/activus/data'
```

The original scanner reads only `activityKinds.json` and `activities.json`. Both Phase 5A scanners cap each input file at 32 MiB, emit aggregate JSON without activity titles/notes, and verify unchanged source hashes. Neither performs file writes, normalization, database access or network calls. They are intentionally scoped to the observed small export formats, not general-purpose importers. Do not commit private exports or full activity records. The Phase 5B command above adds typed candidates and deterministic issue reports; Phase 5C reference apply is described below; activity apply is described above.

## Phase 5C reference data

The existing command now supports a PostgreSQL reference stage. Source inspection
without `--stage` still loads no database client. Reference preview uses the
configured `DATABASE_URL` and requires an explicit report path:

```sh
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/reference-preview.json --stage reference-data
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/reference-apply.json --stage reference-data --apply
```

Apply first writes a preview report, then transactionally creates/reuses only
activity kinds, required variants, measurement definitions and their persistent
ID mappings. Apply migration `0007_legacy_reference_mappings` using the normal
database migration command first. Repeat the same apply command to verify
idempotency; run preview again for reconciliation. No activities or goals are
written by this stage. See the Phase 5C section of
[the migration report](../../.doc/phase-5b-import-framework-report.md).
