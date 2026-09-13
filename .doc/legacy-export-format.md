# Phase 5A — Legacy export format

Updated 2026-09-11. The user has supplied the preferred identity-preserving raw exports. **No further export or source cleanup is needed for analysis of this dataset.** See [analysis](legacy-import-analysis.md) and [mapping decisions](legacy-import-mapping.md#unresolved-decisions).

## Current source files

```text
data/
  activities.ndjson   # 218 documents, 107440 bytes
  kinds.ndjson        # 10 documents, 2450 bytes
```

Both are uncompressed UTF-8 without BOM, one JSON document per LF-terminated line, no blank lines, no array or metadata envelope. These are genuine NDJSON, unlike the earlier pretty-printed arrays. The corresponding model collection names are `activities` and `kinds`.

Observed canonical Extended JSON v2 representations:

| Value | Observed representation | Handling |
| --- | --- | --- |
| Document IDs and activity.kindId | `{"$oid":"<24 lowercase hex characters>"}` | Preserve original identity; references resolve to kinds._id |
| Activity when/createdAt/updatedAt | `{"$date":{"$numberLong":"<epoch milliseconds>"}}` | Decode UTC milliseconds exactly |
| Most numbers and activity.__v | `{"$numberInt":"<integer>"}` | Validate integer string; convert only when safe for target type |
| One distance | `{"$numberDouble":"4030.0000000000005"}` | Preserve lexeme; explicit precision exception, never silent rounding |
| All kind.createdAt and eight kind.updatedAt | BSON string `YYYY-MM-DD HH:mm:ss.sss+00` | Strict explicit +00→UTC normalization |
| Two kind.updatedAt | Canonical BSON dates | Same date decoder as activity timestamps |
| Titles/descriptions/names/icons/older kindId/userId | BSON strings | Preserve meaning; no numeric or date coercion by field name alone |

These are shape-only redacted examples, not full records. No Decimal128 or numeric BSON long measurement values were found. Canonical EJSON legitimately leaves BSON strings as strings; mixed kind timestamp storage is data variation, not a broken export. Kind `kindId` strings must not be confused with ObjectIds or destination UUIDs.

Do not convert raw files into the old array format. Its legacy exporter drops `_id`/`userId`, populates names, collapses missing fields to zeros, and overwrites fixed paths. The old arrays are retained only for comparison: 180 exact projected matches, one updatedAt-only difference, 37 additional raw activities. Import raw files once, not both snapshots.

## Phase 5B input package

The two supplied files are sufficient for read-only analysis. Before writes, attach a small manifest and reviewed mapping decisions; preserve the original NDJSON bytes:

```text
legacy-export/
  manifest.json
  kinds.ndjson
  activities.ndjson
  mapping-decisions.json
```

All four files are required before the package can be declared ready for later apply stages. The [Phase 5B dry run](phase-5b-import-framework-report.md) inspects the two raw files even when configuration is missing, reporting blocking package issues rather than inventing decisions. No goal file is required or accepted by version 1 because none was found. The package directory name is arbitrary; the current `data/` directory can be used privately if desired. No package or manifest is fabricated in Phase 5A or 5B.

Collections: uncompressed UTF-8 without BOM, canonical EJSON v2 NDJSON, LF or CRLF accepted, one object per nonempty line; checksums cover exact bytes. Manifest and mapping files: UTF-8 JSON objects. Reject arrays, CSV, unsupported types, inconsistent wrappers and unapproved fields rather than guessing the input format. Decoder must explicitly accept the two observed timestamp representations by field, not coerce arbitrary strings. Stream larger sources; the small analysis scanner has a 32 MiB/file cap.

### Manifest fields

| Field | Required contract |
| --- | --- |
| formatVersion | Literal `activus-legacy-ejson-v1` |
| sourceSystem | Literal `legacy-activus-mongodb` |
| datasetId | Stable non-secret identifier for this source database lineage, reused across re-exports |
| sourceDatabase | Database name only, or explicit null if unknown; no URI/credentials |
| exportedAt | Actual UTC export timestamp if known, otherwise null with provenanceUnknown acknowledgement |
| exportTool | Name/version if known, otherwise null with provenanceUnknown acknowledgement |
| provenanceUnknown | Boolean; true when export metadata were not recorded; never invent metadata from filesystem times |
| consistency | Known paused-write/restored-backup procedure or explicit unknown acknowledgement |
| ownerScope | User confirmed all 218 activities belong to them and are included, including the 48 missing userId values |
| files | Exact filenames, original collection names, record counts and SHA-256 for both files |
| mappingFile / mappingSha256 | `mapping-decisions.json` and byte hash of the approved mapping |

Ownership is confirmed for the inspected 218-record snapshot. Dataset identity must still be explicit before writes; unknown provenance is not permission to invent it. The files prove reference consistency, not snapshot completeness relative to the live database.

Current hashes:

```text
activities.ndjson  005d719d7b1fa03363fc7d63772928fb440b51515ea3704531a2da973819f137
kinds.ndjson       f93741b04c4d9f9f3f7551369e4dad78e10b49eee8f13cb6f28ba8e0e04751b1
```

### Mapping decisions

Version 1 mapping records: source kind ObjectId→approved target kind/variant, explicit activity calendar timezone, midnight/start policy, owner inclusion, zero policy per field, exact numeric exceptions by source activity ObjectId, unsupported-unit policy, kind presentation defaults and description-loss policy. Preserve source `kindId` discriminator values only as audit metadata; raw activities reference `kinds._id`.

A future dry run resolves/validates target kind/variant/definition UUIDs and records them for reruns, including archived/name conflicts. Unresolved decisions prevent dependent writes. No placeholder UUID counts as approval.

Confirmed on 2026-09-11: include all 218 activities, including 48 without userId; treat the 72 exact-midnight UTC records as date-only, preserving their recorded dates with started_at=null. Carry these approvals into the future mapping file. Remaining policies are still pending; no mapping file or importer is generated here.

### Identity and restart behavior

Use source namespace `legacy-activus-mongodb:<datasetId>` and external ID `activities:<original ObjectId>`. Dataset ID is persistent database lineage, not import-batch ID. Existing schema uniqueness supports atomic idempotent writes. Changed payload under the same identity is a conflict unless an update mode is explicitly approved. Different source IDs do not collapse when values look alike.

Original IDs are now available for all 228 documents: the previous immutable-array/file-index fallback is **retired for this migration**. Do not use hashes or array positions as activity identity. Checksums identify source bytes and detect changes; they do not identify domain records. Phase 5B normalizes partial candidates in memory for its dry-run report; no apply/import writes are implemented.

Structural corruption, duplicate identities, invalid manifest or checksum mismatch abort before writes. Invalid individual activity dates/values normally skip that record with a redacted report once package validation passes. Never silently repair source bytes.

## Optional future re-export reference

A re-export is unnecessary now unless the owner wants a later snapshot. Keep previous files/backups intact and use a new private directory. Do not run the legacy app's lossy exporter.

The previously verified source-owner templates are:

```powershell
mongoexport --host '<HOST>' --port '<PORT>' --username '<READ_ONLY_USER>' --authenticationDatabase '<AUTH_DATABASE>' --db '<LEGACY_DATABASE>' --collection 'kinds' --type=json --jsonFormat=canonical --out '<NEW_PRIVATE_DIRECTORY>/kinds.ndjson'
mongoexport --host '<HOST>' --port '<PORT>' --username '<READ_ONLY_USER>' --authenticationDatabase '<AUTH_DATABASE>' --db '<LEGACY_DATABASE>' --collection 'activities' --type=json --jsonFormat=canonical --out '<NEW_PRIVATE_DIRECTORY>/activities.ndjson'
```

Apply deployment-required TLS settings. Omit password arguments for an interactive prompt. `--jsonFormat=canonical` preserves BSON types and omission of `--jsonArray` produces individual documents, per the [MongoDB mongoexport reference](https://www.mongodb.com/docs/database-tools/mongoexport/). Use direct `--out` rather than shell text redirection. Export while writes are paused or from a consistent restored backup; record actual tool version/time/consistency and SHA-256. No live command was executed by the assistant.

## Privacy and verification

The supplied `/data/activities.ndjson` and `/data/kinds.ndjson` paths are ignored by Git. Keep future manifests and decision/report files private too; their filenames are ignored under `/data/` as documented in the repository ignore rules. Do not place raw records, personal notes, user IDs or credentials in tracked docs. A migration export is not a replacement for the original database backup.

Run:

```powershell
node scripts/import/analyze-legacy-ndjson.mjs data '../../Node/MongoDB/activus/data'
```

The Phase 5A scanner reads only specified local sources, emits summaries without notes/owner IDs and verifies unchanged hashes. Reported file totals are independently checked using PowerShell line counts/parsing. Phase 5B's separate typed CLI and verification results are documented in the [framework report](phase-5b-import-framework-report.md). No original export or database was modified; later apply stages remain deferred.
