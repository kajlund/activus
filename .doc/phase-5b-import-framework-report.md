# Phases 5B–5E — Legacy import framework and closure

## Phase 5 migration complete — 2026-09-14

Final read-only reconciliation for lineage `activus-personal` passed: **218 source
activities, 218 destination activities, 472 measurements**, zero skipped, blocked,
conflicting, unmatched or unexpected identities. Reference-ledger targets,
canonical values, original metadata and export checksums match. Tags and goals
remain zero. Phase 5D created 218/472 on its first apply and 0/0 on its second;
Phase 5E performed **no apply, database writes or automatic data corrections**.

Future maintenance reconciliation (never part of normal application startup):

```powershell
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/maintenance-reconciliation.json --stage activities
```

The closure run used the same command with report path
`.artifacts/legacy-import/phase-5e-reconciliation.json`. Do not normally rerun
apply after manual edits: changed canonical content should produce a conflict,
and the importer must not revert the user's edits.

### Application checks and optional review

Using the normal Hono activity endpoints, service, repository and response
schemas inside a read-only PostgreSQL transaction, all **218 detail responses**
and **218 paginated list entries** succeeded. Six deliberate samples verified:

- date-only calendar date with null start;
- Helsinki calendar date with the original timed UTC start;
- source `6a85a86fd22d3159d3bd2537`: exactly 4030 metres, displayed as 4.03 km;
- omitted measurements with no invented zero rows;
- elevation fallback producing exactly one Ascent value;
- Walking/Treadmill with the original title and notes available through the API.

Sample source/destination IDs and sanitized check results are retained in
`.artifacts/legacy-import/phase-5e-application-checks.json`. All definition totals
match: Distance 120, Ascent 100, Steps 39, Calories 126, heart rate 49 and cadence
38. No new browser suite was added; these are application API checks.

The private list `.artifacts/legacy-import/phase-5e-treadmill-review.json` contains
the five destination IDs, source external IDs, dates, current titles, Walking /
Treadmill assignments, notes-presence flags and `/activities/<id>` routes. It
contains **no note contents**. The sole optional human task is to review those
five records and decide Walking versus Running individually. No gait was inferred
and no Running/Treadmill variant was pre-created. The expected audit warnings
remain informational (including five treadmill reviews and one exact correction).

Ordinary editing was checked on isolated in-memory copies using the normal
activity service: identity stayed attached, no duplicate appeared, and subsequent
import preview reported one changed-content conflict and refused apply. The
real imported records were not edited. Existing Phase 5D PostgreSQL conflict
coverage remains in `test/integration/legacy-references.test.ts`.

### Small defect corrected and checks run

The existing activity test double incorrectly cleared `source` and
`sourceExternalId` during an update, unlike the real repository, which updates
only editable fields. The helper now preserves those fields. One focused service
regression verifies an ordinary imported-activity edit preserves identity and
row count. No production importer or application behavior changed.

Ran only the new focused service case, final reconciliation and the read-only
application checks. API typecheck/build and scoped lint/format/whitespace checks
passed because the test helper changed. The broader Phase 5D suite and apply
were not repeated for closure.

### Retention

Keep `data/activities.ndjson` and `data/kinds.ndjson` as the original private
snapshot; keep `data/manifest.json` and `data/mapping-decisions.json` as its
checksum-bound provenance and approved transformation rules. Keep the original
5B–5D machine reports and the new 5E reports under `.artifacts/legacy-import/`
as audit evidence. All these locations remain git-ignored; ignore coverage was
verified, and no relocation, deletion or ignore-rule change was needed.

Retain the importer, package maintenance command, schema migrations and database
ledger as the reproducible maintenance tool and stable identity record. No raw
export, manifest, decision file, earlier report or ledger row was rewritten in
5E. Do not move private review titles or source payloads into public documentation.
No later application phase was started.

## Phase 5D activity import

The activity stage extends the same CLI with `--stage activities`. Preview is
read-only; apply additionally requires `--apply`. Both require explicit input
and report paths. The source-only and reference stages remain available.
Final date/correction approvals are recorded in [the mapping](legacy-import-mapping.md).

```powershell
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/phase-5d-reference-check.json --stage reference-data
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/phase-5d-preview.json --stage activities
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/phase-5d-apply-first.json --stage activities --apply
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/phase-5d-apply-second.json --stage activities --apply
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/phase-5d-reconciliation.json --stage activities
```

The stage uses persisted ledger IDs for kind, variant and measurement references;
it creates no reference data. Source candidates retain names/notes privately in
memory, while reports include only identities, counts, disposition and warning
codes. The normal create contract and extracted `validateActivityWrite` enforce
the same domain rules as normal API writes. Decimal inputs remain exact strings;
integers use safe integer validation. Missing required values produce an explicit
partial activity and warning, without changing definition requirements.

Preview validates the complete batch and checks stable source identities. An
existing identity is unchanged only when canonical fields, references, source
timestamps and the complete typed measurement set match (measurement row UUIDs
are irrelevant). Measurement timestamps must match the approved source metadata;
unexpected tag joins also conflict. Changed rows are blocked, never overwritten.
Unexpected identities within this lineage block the batch. Distinct source IDs
remain distinct activities.

Apply persists the preview report first, then uses one PostgreSQL transaction
for the whole batch. It locks configuration and destination tables, reloads the
source, revalidates the plan and rejects preview drift. Activities, measurements
and source identity commit together. Failures roll back the whole batch and are
reported as failures, with no partial activity or measurement rows. The unique
source-identity constraint remains the final duplicate safeguard.

Before commit, reconciliation verifies every expected canonical record and
measurement. Protected-state digests verify that reference data, ledger, tags,
goals and non-imported activities/measurements are unchanged; raw source inputs
are reread and compared. Digests and private payloads are not printed. Reports
use `activus-legacy-activities-v1`. Repeating preview is the reconciliation
command; repeating apply performs no inserts for equivalent source identities.
An output failure after commit requires a fresh preview before retrying.

The real preflight confirmed 23 reconciled references/27 ledger rows and zero
existing activities or measurements. Preview accepted 218 activities and 472
measurements, with zero skipped, blocked or conflicting records. Dates comprise
72 date-only records and 146 timed records. Omission counts are 332 zero
measurements, five zero durations and 504 absent measurements. Warnings include
five `TREADMILL_MANUAL_REVIEW` and one exact `PRECISION_EXCEPTION_APPLIED`.

Validation: four new mapping tests and two PostgreSQL activity cases cover time
rollover, midnight handling, zero/absent/alias omission, the exact correction,
atomic failure rollback, reruns and changed-content conflicts. Existing importer,
reference-stage and related domain tests also pass: 58 tests in total. API
typecheck/build, scoped ESLint, formatting and whitespace checks pass. No schema
migration or dependency was added for Phase 5D.

Changed implementation: `activity-stage.ts`, existing importer CLI/report/reader
orchestration, the shared activity service validator, focused mapping/integration
tests, and these migration documents. The private mapping/manifest now bind the
final approvals; raw NDJSON exports are unchanged.

### Phase 5D real apply and rerun results

| Run | Created activities | Created measurements | Already imported activities | Skipped / blocked / conflicts | Transaction |
| --- | ---: | ---: | ---: | --- | --- |
| First apply | 218 | 472 | 0 | 0 / 0 / 0 | Committed |
| Second apply | 0 | 0 | 218 | 0 / 0 / 0 | Committed |
| Final reconciliation | 0 | 0 | 218 | 0 / 0 / 0 | Not started (read-only) |

All 218 source identities and 472 owned measurements reconciled, with no unmatched
source or unexpected destination identities. Total destination counts changed
from 0/0 to 218/472. The second apply left those counts unchanged. No references,
ledger rows, non-imported activities, goals, tags or raw exports were modified.

Measurements total Distance 120, Ascent 100, Steps 39, Calories (kcal) 126,
Average heart rate (bpm) 49 and Average cadence (spm) 38. Per-definition UUID
counts are in the machine-readable reports. The 652 audit warnings comprise:
337 zero omissions (including five null durations), 168 elevation fallbacks,
72 date-only starts omitted, 48 approved absent owners, 18 kind timestamp
normalizations, five Treadmill reviews, two duplicate ascent aliases ignored,
one exact distance correction and one unusual-value review. Warning totals count
occurrences, not distinct activities; accepted records are not skipped for these.

The five Treadmill source IDs are listed with `TREADMILL_MANUAL_REVIEW` in the
private reports. Review their preserved titles/notes and change Walking versus
Running manually if needed. Rerunning the importer after a manual material edit
will correctly report a conflict instead of reverting that edit. No further
mapping approval is pending and no later phase was started.

## Phase 5C implementation and historical results

Phase 5C extends the existing CLI with `--stage reference-data`. Preview is the
default; `--apply` additionally enables reference writes. Both require explicit
`--input` and `--report`. Source-only Phase 5B behavior remains available without
the stage selector. Activity and goal writes remain unavailable.

The approved mappings are in [the authoritative mapping](legacy-import-mapping.md).
The private package now contains a checksum-bound manifest and decisions, using
stable namespace `legacy-activus-mongodb:activus-personal`; unknown provenance is
explicitly recorded. All stored zeros are omitted, including ascent. Five
Treadmill activities provisionally use Walking/Treadmill with a source-ID review
warning; their titles/notes remain available for Phase 5D to preserve.

### Plan, matching and identity

The plan covers nine destination kinds, two required variants and twelve
parent-scoped measurement definitions. It does not create tags or goals.
Unused source kinds are retained except the environmental Treadmill kind, which
maps to Walking. Running/Treadmill can be added when actually needed for manual
reclassification; no current provisional activity requires that variant.

Names are found using case and surrounding-whitespace normalization. Reuse then
requires matching name spelling, active status and semantic configuration:
kind icon, variant parent/default flag, and definition parent/type/units/
precision/required flag/bounds/aggregation/personal-best behavior. Existing
colors, sort order and timestamps are retained. Archived or incompatible
matches block; there is no fuzzy match, update, restore, delete or merge.

Migration `0007_legacy_reference_mappings` adds a ledger with composite key
`(source, collection, source_id, role)`. Collection is `kinds`; roles are `kind`,
`variant`, or `measurement:<source field>`. Each row has exactly one restricted
foreign key to a kind, variant or definition, plus created/reused disposition,
format version, applied timestamp and fingerprint. Multiple source kinds may
legitimately resolve the same destination. Domain unique indexes prevent
duplicate destination names. Source notes/payloads are never stored in the ledger.

The fingerprint binds both export file hashes, reference-policy choices and the
deterministic reference specifications. Prior source/rule changes, missing or
reassigned destinations and unexpected mappings block rather than remap. Timezone
and the activity-only precision exception are deliberately excluded from reference
policy identity: settling them later does not change a reference definition.

### Transactions and reports

Preview uses a read-only repeatable-read transaction and writes only its report.
Apply first persists the preview, locks reference tables against concurrent
changes, rereads source inputs and recomputes the plan. It rejects changes since
preview, creates only planned records, inserts missing ledger rows, and verifies
all expected mappings within one transaction. Any inconsistency rolls back the
entire stage. The activity table is locked against concurrent writes during apply;
its count and content digest are compared before and after. No activity payload
or digest is printed. Committed state is reconciled before the result is returned.

Reports use `activus-legacy-reference-v1` and contain action counts, source IDs,
destination IDs, conflicts, transaction status, activity-only errors and review
warnings. Reference-stage exit 0 means no reference blockers, not necessarily
Phase 5D readiness. Exit 1 means a blocked/rolled-back reference stage; exit 2
means command/configuration/report failure. If output fails after commit, rerun
preview to inspect the ledger before retrying.

Every activity is checked for persisted parent, optional variant and measurement
definition mappings. `readyForActivityImport` also requires no remaining source
errors. Thus complete reference coverage does not approve unsettled activity
dates or numeric corrections.

### Verification commands

Commands used from the repository root (same arguments work with `npm run import:legacy --`):

```powershell
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/phase-5c-preview.json --stage reference-data
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/phase-5c-apply-first.json --stage reference-data --apply
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/phase-5c-apply-second.json --stage reference-data --apply
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/phase-5c-reconciliation.json --stage reference-data
```

Before apply, only migration 0007 was applied to the configured development
database, after verifying there were no other pending migrations. Normal future
setup uses `npm run db:migrate`. PostgreSQL connections required sandbox escalation;
no substitute database or live MongoDB access was used.

Six focused PostgreSQL tests cover zero-write preview, transactional creation,
repeat apply, injected ledger failure rollback, configuration conflicts and
readiness/fingerprint checks. They use the existing guarded `TEST_DATABASE_URL`
and rollback their fixtures; they never fall back to the development database.
Run from `apps/api` with `node ../../node_modules/vitest/vitest.mjs run --config
vitest.db.config.ts test/integration/legacy-references.test.ts`. The existing five
Phase 5B tests, API typecheck/build and scoped ESLint checks also pass.

### Real results (2026-09-13)

| Run | Created | Reused | Already imported | Skipped | Blocked | Transaction |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Preview | 20 planned | 3 planned | 0 | 0 | 0 | Not started |
| First apply | 20 | 3 | 0 | 0 | 0 | Committed |
| Second apply | 0 | 0 | 23 | 0 | 0 | Committed |
| Final reconciliation | 0 | 0 | 23 | 0 | 0 | Not started |

All 218 activities resolve their required reference mappings; none are excluded.
No activity rows were inserted or modified (the destination had zero activities).
Phase 5D readiness remains **false**: calendar timezone for 146 timed activities
and the exact distance correction `4030.0000000000005` to `4030` for source ID
`6a85a86fd22d3159d3bd2537` have not been approved. Both are activity-only decisions;
neither blocks the committed reference stage. Five Treadmill records retain a
manual-review warning. Phase 5D has not begun.

## Historical Phase 5B implementation

Implemented a TypeScript dry-run CLI for the raw Phase 5A exports. It decodes and validates records, exercises confirmed mappings, reports pending decisions, and writes a redacted JSON report. **Apply mode does not exist. No reference data or activities have been imported.** The [Phase 5A mapping](legacy-import-mapping.md) remains authoritative; this phase does not approve its proposed choices.

## Commands

From the repository root, using the npm workspace commands:

```powershell
npm run import:legacy -- --input data --report .artifacts/legacy-import/phase-5b-first.json
npm run import:legacy -- --input data --report .artifacts/legacy-import/phase-5b-second.json
npm run import:legacy -- --help
npm run test:import
```

The command requires an explicit export directory. `--dry-run` is optional because it is the only mode. `--apply` is rejected before export reads. Unknown/positional arguments are rejected. Default output is `.artifacts/legacy-import/dry-run.json`, relative to the calling working directory. Explicit report paths must be outside the export directory. Existing files are replaced only if they are regular, unaliased Activus v1 dry-run reports. Writes use an atomic temporary-file/rename boundary and never touch source files.

The root launcher reuses the API package's existing `tsx` dependency without adding dependencies or changing working directory. Equivalent direct invocation, also used for real verification:

```powershell
node scripts/import/cli.mjs --input data --report .artifacts/legacy-import/phase-5b-first.json
```

Exit codes: **0** means source checks pass (destination validation is still required later); **1** means a JSON report was produced with blocking errors; **2** means invalid CLI arguments, unavailable apply mode, or an orchestration/output failure. The real Phase 5A snapshot currently returns **1 intentionally**, since decisions remain pending. This is a successful dry-run inspection, not a failed import attempt.

## Input and configuration

The reader accepts exactly the observed uncompressed, no-BOM, UTF-8 canonical Extended JSON NDJSON in `kinds.ndjson` and `activities.ndjson`. LF and CRLF work. It processes source lines incrementally, caps an individual line at 1 MiB, and does not load whole exports as JSON arrays. Identifiers/typed candidates/issues are retained for cross-reference checks and reporting, so total report memory still grows with record count. Blank lines are counted and ignored. Unsupported encoding, BOM and oversized lines produce blocking file errors. A malformed JSON item or invalid document is reported with collection/line and, when readable, source ObjectId; valid neighbors continue.

No speculative array, CSV, BSON binary, Decimal128 or arbitrary legacy shape support was added. The old Phase 5A scanners remain historical analysis tools.

The decoder explicitly supports the observed `$oid`, `$date/$numberLong`, `$numberInt` and `$numberDouble` wrappers and explicit-UTC kind timestamp strings. It validates ObjectId syntax, int32 representation, calendar ranges, required fields and field coverage. Exact numbers reuse the API's base-ten decimal helpers. No numeric strings are converted through binary floats for persistence; no precision correction is applied unless an exact configured exception matches.

`manifest.json` and `mapping-decisions.json` follow the [Phase 5A package specification](legacy-export-format.md). Missing files do **not** stop record inspection: each is a blocking package issue, so the real raw-only export remains useful in 5B and is not declared ready for apply. Invalid configurations are not trusted. Checksums/counts are validated whenever a manifest is present. Config files are UTF-8 JSON objects capped at 1 MiB.

Concrete v1 manifest shape (all fields required; placeholders are not ready-to-use values):

```json
{
  "formatVersion": "activus-legacy-ejson-v1",
  "sourceSystem": "legacy-activus-mongodb",
  "datasetId": "stable-source-lineage-label",
  "sourceDatabase": null,
  "exportedAt": null,
  "exportTool": null,
  "provenanceUnknown": true,
  "consistency": "unknown",
  "ownerScope": "all-records-confirmed",
  "files": [
    { "filename": "kinds.ndjson", "collection": "kinds", "records": 10, "sha256": "<actual lowercase SHA-256>" },
    { "filename": "activities.ndjson", "collection": "activities", "records": 218, "sha256": "<actual lowercase SHA-256>" }
  ],
  "mappingFile": "mapping-decisions.json",
  "mappingSha256": "<actual lowercase SHA-256>"
}
```

`datasetId` allows lowercase letters, digits, hyphen and underscore, begins with a letter/digit, and is at most 64 characters. `sourceDatabase` is a non-secret database label using letters/digits/hyphen/underscore, or null. `exportedAt` is UTC ISO or null; `exportTool` is `{ "name": "...", "version": "..." }` or null. Unknown provenance must be acknowledged. `consistency` is `writes-paused`, `restored-backup` or `unknown`; `ownerScope` is `all-records-confirmed` or `pending`. File names and collection pairs are fixed; no path traversal is accepted. The manifest binds the exact mapping checksum to the source package.

Mapping schema is defined in `apps/api/src/modules/legacy-import/package.ts`:

| Required field | Accepted value |
| --- | --- |
| `version` | 1 |
| `calendarTimezone` | `UTC`, `Europe/Helsinki`, or null (pending) |
| `midnightDateOnly` | true, false or null; only true resolves the date-only rule; false does not invent an alternative |
| `zeroPolicy` | Object with distance, duration, ascent, calories, steps, avgHR, cadenceAvg; each `preserve`, `omit` or null (pending) |
| `unsupportedUnits` | `named-unitless` or null (pending); proper unit-registry extension is not implemented |
| `kinds` | Entries with sourceId, targetKind (string/null), targetVariant (Outdoor/Treadmill/null), presentationApproved and descriptionLossApproved booleans |
| `precisionExceptions` | Exact `{sourceId, field:"distance", from:"4030.0000000000005", to:"4030"}` entries; no general rounding rule |

Duplicate kind mapping IDs or exception IDs are errors, not last-entry-wins behavior. Unsupported or changed kind semantics remain blocked. The kind-wide Treadmill fallback can be configured only after approval; per-record gait assignments, if chosen instead, require extending this narrow mapping resolver before later apply work. No gait heuristics were added.

No manifest/decision file was generated for the user's real data, because doing so would require inventing the remaining approvals/source label. The two already-confirmed decisions are carried in code **bound to both exact Phase 5A file hashes**: include all 218 owners (including 48 without userId) and omit the start time on 72 date-only midnight records. A changed export cannot inherit these snapshot confirmations silently; it needs explicit valid package decisions. Conflicting configuration is reported.

## Boundaries and safety

- `reader.ts`: streaming read/fingerprints; JSON item errors do not discard neighbors.
- `decode.ts`: raw documents → typed legacy documents; no raw text in error messages.
- `package.ts`: manifest/mapping schemas and checksum binding.
- `mapping.ts`: legacy documents → partial typed candidates, with pending fields clearly marked. Elevation fallback and date-only handling are exercised, true missing measurements stay absent, source IDs stay separate from future UUIDs.
- `dry-run.ts`: references, duplicate groups (all duplicate members blocked), classification, stable sorting and counts. The report strips activity name/notes and never emits owner identifiers.
- `report.ts`: sole filesystem write boundary, outside the export directory. Reports are not importer input and contain no final target UUIDs.
- `cli.ts` plus `scripts/import/cli.mjs`: argument handling and terminal summary.

The import module loads no database client, environment loader, ORM, migrations, repository or server. Only existing pure decimal helpers are reused. Database absence is therefore not a reason to skip the dry run. Safety counters are architectural invariants, not a claim that a live database was queried to compare row counts. Tests make loading `pg` or the database client fail and make filesystem mutation APIs throw during the analysis call. Only explicit report creation uses the separate writer.

Source identity remains `legacy-activus-mongodb:<datasetId>` plus external ID `<collection>:<original MongoDB _id>`. Until datasetId is supplied, the report preserves system/collection/ID with a null namespace and a blocking issue. Distinct source documents never collapse by values; source IDs never replace application UUIDs. Existing schema already provides activity source uniqueness; no ledger or migration was added.

Candidates with unresolved rules are **not import-ready rows**. Proposed environment/icons/units are marked as unresolved rather than silently approved. Future 5C must resolve destination IDs, existing/archived-name conflicts and reference/definition configuration. Future 5D must reuse domain validation, determine partial status against effective requirements, preserve metadata and atomically claim identity with activity/measurement writes. A source-ready dry run alone is not authorization to apply.

## Report schema and real run

`reportVersion` is `activus-legacy-dry-run-v1`. The report includes input name, source namespace status, checksum-bound confirmations, safety flags, file counts/hashes, grouped summary, per-record redacted candidates and sorted issues. Issues contain severity/code/collection/line/sourceId/field and a fixed message. Counts group by source collection, proposed destination candidates, proposed kind and issue code. Proposed row counts include incomplete candidates and are **not promised insertion counts**, especially when configuration may later merge. `normalizable` means the record has no local blocking issue; package errors and destination validation must still be considered.

Material report ordering uses deterministic collection/source-ID/line/field/code ordering; there is no timestamp or random value in report contents. Temporary report filenames are random but not emitted. Warnings record approved transformations and review information; errors identify missing approvals or unsafe data. A record may have several errors; error occurrences are not counts of bad activities.

Real snapshot results:

| Metric | Result |
| --- | ---: |
| Kinds / activities read | 10 / 218 |
| Decoded records | 228 |
| Fully normalizable / blocked / skipped records | 0 / 228 / 0 |
| Warnings / blocking issue occurrences | 310 / 1050 |
| Duplicate identities / broken references | 0 / 0 |
| Proposed activity candidates | 218 |
| Measurement candidates / locally resolved measurements | 804 / 258 |
| Database connections / writes | 0 / 0 |

All 1050 errors are pending mapping/configuration occurrences, **not malformed records**. Breakdown: 2 missing configuration files, 1 dataset label, 10 kind mappings, 10 presentation defaults, 7 description-loss choices, 218 dependent activity-kind mappings, 146 calendar policies, 337 zero policies, 318 unit mappings and 1 precision exception. Unit checks include 105 stored zeros whose eventual omission is also undecided; Phase 5A's 213 **nonzero** unit values are unchanged. Warnings include the 72 approved date-only omissions, 48 approved missing-owner inclusions, 168 elevation fallbacks, 2 duplicate ascent aliases, 18 kind timestamp normalizations, 1 plausible-value review and 1 destination-validation reminder.

Totals agree with Phase 5A. Both real reports are byte-for-byte identical, including issue order, and source SHA-256 values match the Phase 5A fingerprints before and after. A structural privacy check verified that report candidates contain neither title/notes/description/userId fields nor raw document payloads. No source data were copied to tracked fixtures; tests use sanitized records.

Verification: five focused Vitest cases passed; API TypeScript check/build, targeted ESLint/Prettier and diff whitespace checks passed. No full application/browser/database suite was run. Existing source exports are unchanged and no database rows were written.

## Before 5C

Resolve the remaining choices in the [mapping decision list](legacy-import-mapping.md#unresolved-decisions), supply the stable dataset label and reviewed package files, and rerun until relevant blockers are cleared. Owner scope and date-only midnight handling are already settled. Do not re-export solely to address pending mapping decisions. Phase 5C and Phase 5D have not started.
