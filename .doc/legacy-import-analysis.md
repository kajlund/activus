# Phase 5A — Legacy source analysis

Updated 2026-09-11 for the new raw exports. **Current source: 218 activities and 10 kinds in this repository's `data/` directory.** These replace the earlier 181-activity array snapshot as the mapping input. See [mapping and decisions](legacy-import-mapping.md) and [export format](legacy-export-format.md). All available records were scanned; completeness relative to the live database is not independently verified. The subsequent [Phase 5B dry run](phase-5b-import-framework-report.md) independently confirms these totals and reports the remaining mapping blockers.

## Evidence and verification

Legacy code: `../../Node/MongoDB/activus`. Inspected the Activity/ActivityKind models, export/import scripts, activity service/repository/controller, kind service/controller, date filters in `src/app.js`, activity views and browser filtering, routes, authentication middleware and challenge controller. No environment file, connection secret, or live database was accessed. Target rules come from the current Drizzle schema, contracts, activity validation/decimal/display helpers, README and migration/domain documentation.

Run from this repository with Node 24 (verified with 24.17.0):

```powershell
node scripts/import/analyze-legacy-ndjson.mjs data '../../Node/MongoDB/activus/data'
```

The optional last argument compares the old `activities.json` projection; omit it for raw-only analysis. This standard-library scanner reads explicitly named files, validates UTF-8/JSON objects and recognized date/number wrappers, reports shapes/types/missingness/numeric ranges/time diagnostics/reference integrity, and compares SHA-256 before/after. It never writes files or calls the database. Titles/notes are compared in memory without being emitted; owner identifiers are suppressed. It retains exact numeric wrapper strings for precision exceptions. Aggregate numeric minima/maxima use Number; all supplied values have safe magnitude and the single fractional lexeme is separately reported. The scanner is for these small files (32 MiB/file maximum), not a general-purpose Extended JSON importer; use a streaming scanner for larger exports.

Independent PowerShell line-by-line `ConvertFrom-Json` and nonblank-line counts confirm 218 activities and 10 kinds. Kind distributions also total 218. All observed top-level fields have explicit mapping/ignored entries. Targeted syntax, ESLint and Prettier checks cover analysis code only; no application suite or database checks are needed. Source hashes remain unchanged. The personal NDJSON paths are now ignored by Git.

## Physical format and fingerprints

| File | Bytes | Records | Shapes | Format |
| --- | ---: | ---: | ---: | --- |
| `data/activities.ndjson` | 107440 | 218 | 3 | Uncompressed UTF-8, no BOM, 218 LF, no CRLF/blank lines |
| `data/kinds.ndjson` | 2450 | 10 | 1 | Uncompressed UTF-8, no BOM, 10 LF, no CRLF/blank lines |

One document per line; no metadata envelope/manifest. IDs use `$oid`; all activity dates use `$date: { $numberLong: "<epoch milliseconds>" }`; numbers use `$numberInt` except one distance `$numberDouble`. No Decimal128 values or top-level numeric `$numberLong` fields were found. Canonical Extended JSON still represents BSON **string** fields as strings: the kind timestamp strings are not export-format corruption.

```text
activities.ndjson  005d719d7b1fa03363fc7d63772928fb440b51515ea3704531a2da973819f137
kinds.ndjson       f93741b04c4d9f9f3f7551369e4dad78e10b49eee8f13cb6f28ba8e0e04751b1
```

The user exported these files; exact export tool/version/time, source database label and snapshot consistency are not recorded in the files. Do not infer them from filesystem timestamps.

## Complete field inventory

All present values are non-null. No whitespace-only strings or strings needing trimming were observed. Max lengths below are Unicode code-point counts for string fields; no title/notes exceed destination limits.

| File | Field | Observed type | Missing | Null | Empty string | Max string length |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| kinds.ndjson | `_id` | `$oid` × 10 | 0 | 0 | 0 | — |
| kinds.ndjson | `createdAt` | `string` × 10 | 0 | 0 | 0 | 26 |
| kinds.ndjson | `description` | `string` × 10 | 0 | 0 | 3 | 21 |
| kinds.ndjson | `iconName` | `string` × 10 | 0 | 0 | 0 | 14 |
| kinds.ndjson | `kindId` | `string` × 10 | 0 | 0 | 0 | 36 |
| kinds.ndjson | `name` | `string` × 10 | 0 | 0 | 0 | 17 |
| kinds.ndjson | `updatedAt` | `$date` × 2, `string` × 8 | 0 | 0 | 0 | 26 |
| activities.ndjson | `__v` | `$numberInt` × 218 | 0 | 0 | 0 | — |
| activities.ndjson | `_id` | `$oid` × 218 | 0 | 0 | 0 | — |
| activities.ndjson | `ascent` | `$numberInt` × 50 | 168 | 0 | 0 | — |
| activities.ndjson | `avgHR` | `$numberInt` × 50 | 168 | 0 | 0 | — |
| activities.ndjson | `cadenceAvg` | `$numberInt` × 50 | 168 | 0 | 0 | — |
| activities.ndjson | `calories` | `$numberInt` × 218 | 0 | 0 | 0 | — |
| activities.ndjson | `createdAt` | `$date` × 218 | 0 | 0 | 0 | — |
| activities.ndjson | `description` | `string` × 218 | 0 | 0 | 167 | 54 |
| activities.ndjson | `distance` | `$numberDouble` × 1, `$numberInt` × 217 | 0 | 0 | 0 | — |
| activities.ndjson | `duration` | `$numberInt` × 218 | 0 | 0 | 0 | — |
| activities.ndjson | `elevation` | `$numberInt` × 170 | 48 | 0 | 0 | — |
| activities.ndjson | `kindId` | `$oid` × 218 | 0 | 0 | 0 | — |
| activities.ndjson | `steps` | `$numberInt` × 50 | 168 | 0 | 0 | — |
| activities.ndjson | `title` | `string` × 218 | 0 | 0 | 0 | 23 |
| activities.ndjson | `updatedAt` | `$date` × 218 | 0 | 0 | 0 | — |
| activities.ndjson | `userId` | `string` × 170 | 48 | 0 | 0 | 24 |
| activities.ndjson | `when` | `$date` × 218 | 0 | 0 | 0 | — |

Activity shapes:

- 168: `__v,_id,calories,createdAt,description,distance,duration,elevation,kindId,title,updatedAt,userId,when`.
- 2: the above plus `ascent,avgHR,cadenceAvg,steps`.
- 48: all fields of the second shape except `elevation,userId`.

Kinds all have `_id,createdAt,description,iconName,kindId,name,updatedAt`; none has `__v`. Activity `__v` is `$numberInt:"0"` in all 218 records. Kind `kindId` is a separate string discriminator: nine UUID-shaped strings and one other string. Activity references point to the kind's MongoDB `_id`, **not** this discriminator. Exact kind IDs are listed in the mapping.

## Identity, ownership and comparison with old arrays

All 228 documents have valid unique MongoDB ObjectIds within their collection. All 218 activity references resolve, and all 10 kind names are unique case-insensitively. The identity-loss blocker is resolved; no file/index fallback is needed.

170 activities share one nonempty string `userId`; 48 lack that field. Missing-owner records comprise 38 Walking, 6 Cycling and 4 Strength Training activities. The legacy create controller forwards form data without attaching an authenticated user ID, while the old import script assigns a fixed user ID. This is a plausible explanation for cohorts, not proof of ownership. On 2026-09-11 the user confirmed that all 218 records belong to them and should be included, including the 48 without userId. Owner scope is resolved; no owner value is copied into this report or synthesized in the source.

Comparison against the original 181-row arrays, using the exact old exporter projection across all 13 fields:

- 180 unique complete matches.
- 1 unique same-kind/same-instant candidate matching all fields except `updatedAt`, a Treadmill activity; no measurement or text changes.
- 37 additional projected activities: 31 Walking, 4 Strength Training, 2 Cycling, spanning 2026-07-02T08:43:00.000Z through 2026-09-06T13:40:00.000Z.
- No ambiguous matches. This supports continuity, but comparison is **not an identity/deduplication algorithm**; use raw ObjectIds for migration.

The old snapshot remains a historical comparison only: 181 activities, 10 kinds, 2025-11-14 through 2026-06-30; IDs/owners absent, all seven numbers projected even when missing in MongoDB. Its original scanner remains available as `analyze-legacy.mjs`.

## Numeric values and kinds

Counts refer to present stored fields; missing is distinct from zero.

| Field | Present | Missing | Zero | Nonzero | Min | Max | Max fractional places |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `distance` | 218 | 0 | 98 | 120 | 0 | 11000 | 13 |
| `duration` | 218 | 0 | 5 | 213 | 0 | 6570 | 0 |
| `elevation` | 170 | 48 | 103 | 67 | 0 | 200 | 0 |
| `ascent` | 50 | 168 | 15 | 35 | 0 | 200 | 0 |
| `calories` | 218 | 0 | 92 | 126 | 0 | 602 | 0 |
| `steps` | 50 | 168 | 11 | 39 | 0 | 11347 | 0 |
| `avgHR` | 50 | 168 | 1 | 49 | 0 | 189 | 0 |
| `cadenceAvg` | 50 | 168 | 12 | 38 | 0 | 121 | 0 |

Effective ascent chooses present `ascent`, otherwise `elevation`. There are 168 elevation-only records, 48 ascent-only, and 2 with both. Both pairs are equal (200/200 and 48/48); no conflicts. Effective ascent is present in all 218, with 118 zeros and 100 nonzeros, range 0–200 metres. Count each pair only once.

| Kind | Activities | Distance nonzero | Duration nonzero | Effective ascent nonzero | Calories nonzero | Steps nonzero | HR nonzero | Cadence nonzero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Strength Training | 36 | 0 | 33 | 0 | 24 | 0 | 4 | 0 |
| Swimming | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Walking | 108 | 108 | 107 | 99 | 93 | 39 | 39 | 38 |
| Cycling | 7 | 7 | 7 | 0 | 7 | 0 | 6 | 0 |
| Running | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Physio Exercises | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 |
| Stretching | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Meditation | 57 | 0 | 56 | 0 | 1 | 0 | 0 | 0 |
| Treadmill | 5 | 5 | 5 | 1 | 1 | 0 | 0 | 0 |
| Martial Arts | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |

Confirmed units from code/views: distance/elevation/ascent metres; duration seconds; calories kcal; steps count; HR bpm; cadence spm. Nonzero HR now also appears in Strength Training (4 records), so the previous definition applicability table has been updated. No evidence supports interpreting cycling cadence as rpm (all six present cycling cadence values are zero). The scanner's `numbersByKind` also reports per-kind min/max/type/precision/missing counts.

Exactly one distance is `4030.0000000000005`, stored as BSON double; source ID `6a85a86fd22d3159d3bd2537`. The residue exists in MongoDB, not just the old exporter. All other numeric values are integers. There are no negative values, fractional durations, non-finite/invalid numeric wrappers, magnitude overflows, decimal commas, numeric BSON strings or negative sentinels. The one precision exception exceeds the destination scale of six and requires explicit handling.

There are **337 stored zero values across 134 activities**, counting effective ascent once. There are also **504 truly absent measurement values** (168 each for steps, HR, cadence). The latter can now be omitted without guessing. Missing `ascent` has an elevation fallback, so do not count those 168 as missing ascent measurements. Stored zeros still need a source-specific policy.

Three units lack target registry entries: kcal, bpm, spm. They account for 213 nonzero values (126 + 49 + 38) across 126 activities. A Meditation calorie value of 261 remains unusual but not structurally invalid; preserve with a review warning. Do not label plausible exercise values impossible based on heuristics.

## Dates and temporal semantics

| Collection / field | Earliest UTC | Latest UTC | Representation |
| --- | --- | --- | --- |
| activities / `when` | 2025-11-14T10:00:00.000Z | 2026-09-06T13:40:00.000Z | 218 canonical BSON dates |
| activities / `createdAt` | 2025-12-12T19:26:31.142Z | 2026-09-06T13:01:54.411Z | 218 canonical BSON dates |
| activities / `updatedAt` | 2025-12-12T19:26:31.142Z | 2026-09-06T13:01:54.411Z | 218 canonical BSON dates |
| kinds / `createdAt` | 2025-12-03T13:00:43.697Z | 2026-04-27T14:30:14.763Z | 10 BSON strings |
| kinds / `updatedAt` | 2025-12-03T13:00:43.697Z | 2026-08-20T13:14:04.653Z | 8 BSON strings, 2 canonical BSON dates |

Kind strings follow exactly `YYYY-MM-DD HH:mm:ss.sss+00`. Strictly replace the separator space with T and +00 with Z for normalization, then validate; this is explicit UTC, not server-local time. All 20 kind metadata values normalize successfully. Preserve them instead of generating batch timestamps for these files. No missing/invalid temporal values remain after recognizing both observed representations; no activity update precedes creation.

72 activity dates are exactly midnight UTC; 146 are not. None is Helsinki midnight. UTC versus Europe/Helsinki produces the same calendar date for all 218 activities and all metadata values. Activity Helsinki offsets: +02:00 for 127, +03:00 for 91. One activity falls on 2026-03-29; UTC instants are unambiguous across that spring DST transition. No autumn transition lies within the activity range.

The user confirmed on 2026-09-11 that the 72 midnight records are date-only; preserve their recorded calendar dates and use null destination start times. Deployment timezone is still not established by the data. The old editor combines a UTC date input with server-local hours and saves an offsetless datetime; display uses server timezone, browser filtering uses browser-local calendar logic. Do not replay that inconsistency or choose a fixed timezone offset. Midnight precision is now resolved by user confirmation; the policy for the other 146 starts/calendar timezone remains proposed.

## Anomalies and proposed disposition

| Category | Current count | Action |
| --- | ---: | --- |
| Invalid JSON/root, missing/invalid IDs, duplicate source IDs | 0 | Future structural corruption/duplicate identity aborts package |
| Unknown kind references / duplicate kind names | 0 / 0 | All references resolve |
| Missing owner field | 48 | User confirmed inclusion in the 218; do not fabricate owner IDs |
| Missing required dates / unparseable timestamps after explicit normalization | 0 / 0 | No date repair needed |
| Midnight start-time semantics | 72 | Confirmed date-only: preserve recorded date, started_at=null |
| Actual stored numeric zeros | 337 values / 134 activities | Explicit field-level policy |
| Truly absent steps/HR/cadence | 504 values / 168 activities | Omit values; never synthesize zero |
| Elevation/ascent conflict | 0 | Proven fallback; preserve one value |
| Precision beyond six places | 1 | Exact exception approval or skip/approved omission |
| Unsupported units | 3 / 213 nonzero values / 126 activities | Decide named null-unit definitions versus unit support |
| Duplicate-looking activities | 0 | Compared kind, instant and seven effective numeric values |
| Empty / whitespace-only notes | 167 / 0 | Empty→null; retain 51 nonempty notes |
| Over-limit titles/notes | 0 / 0 | No truncation |
| Mixed kind timestamp storage | 18 strings + 2 BSON dates | Explicit normalization, no timezone guessing |
| Treadmill gait ambiguity | 5 | Still one explicit walk, one mixed walk/jog, three unclear from earlier matching titles |
| Unexpected unmapped fields | 0 | Every observed field mapped |

Exclusive current disposition: **218 activities remain subject to the remaining mapping decisions**, 0 approved for import, 0 known irreparably corrupt activities. These are pending decisions, not 218 invalid records. The precision record is conditionally skipped if neither correction nor omission is approved. Potentially all 218 can be represented one-to-one after decisions and validation against actual target configuration. Aggregate anomaly counts overlap and must not be summed as rejected activities.

No source file or database was modified. No importer, database migration, unit extension, or live export was executed.
