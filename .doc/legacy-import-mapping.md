# Phase 5A — Legacy import mapping

Updated 2026-09-13 after inspecting the raw MongoDB exports. **Current mapping input: `data/activities.ndjson` (218) and `data/kinds.ndjson` (10).** The earlier 181-row array snapshot is comparison evidence only. Identity-preserving source data are now available; file/index identities and another export are not needed for this dataset.

Status: Phase 5C reference data have been applied and the repeat apply created no duplicates. The [migration framework report](phase-5b-import-framework-report.md) documents the ledger, preview, transactions and results. Phase 5D has now committed all 218 activities and 472 measurements using the final approved rules. Raw NDJSON source files remain unchanged. See [analysis](legacy-import-analysis.md) and [input format](legacy-export-format.md).

## Phase 5D final approvals

The user authorized the attached Phase 5D brief. Its final decisions are authoritative: derive all 146 timed activity dates in Europe/Helsinki and preserve their decoded UTC starts; keep the 72 date-only dates unchanged with null starts; correct only source activity `6a85a86fd22d3159d3bd2537`, exact distance `4030.0000000000005`, to `4030` metres with `PRECISION_EXCEPTION_APPLIED`. The private mapping and its manifest checksum now record these decisions. No general rounding is permitted. All other confirmed mappings remain unchanged.

## Confirmed user decisions

On 2026-09-11 the user confirmed both pending questions:

- All 218 activities belong to the user and should be included, including the 48 without `userId`. Missing owner IDs do not exclude records and must not be fabricated.
- The 72 exact-midnight UTC records were date-only. Preserve their recorded calendar date and set destination `started_at=null`; do not shift their dates or invent a start time.

On 2026-09-13 the user additionally approved:

- All 108 source Walking activities map to Walking + Outdoor.
- Treadmill is represented by variants of Walking and Running, never a separate destination kind. Preserve existing activity titles and notes so the five records can be manually corrected. The user subsequently approved provisional Walking + Treadmill for all five records, with a manual-review warning. Do not split records or invent gait from pace.
- Use the proposed named unitless definitions Calories (kcal), Average heart rate (bpm), and Cadence (spm), preserving the original numeric meaning without adding unit-registry entries.
- Use the proposed supported icons, neutral color and alphabetical order, retain unused kinds, and preserve source timestamps. Keep the seven kind descriptions in the private source export because the destination has no kind-description field. Reused destination configuration remains unchanged.

These approvals apply to the inspected export snapshot. The user subsequently confirmed that every stored zero means nothing recorded: omit all zero measurements, including ascent, and set zero duration to null. All five Treadmill records provisionally map to Walking + Treadmill for review. Calendar timezone and the single precision correction are now approved by the Phase 5D brief above. The importer uses the stable non-secret lineage label activus-personal; unknown export provenance is recorded explicitly.

## Source and destination authority

Legacy code is under `../../Node/MongoDB/activus`: Activity/ActivityKind models, export/import scripts, services/repositories/controllers, date filters and activity templates establish source meaning. New targets were checked against `apps/api/src/db/schema.ts`, shared contracts, activity service/validator, exact decimal helpers, display mapper and domain/migration documentation.

Both files are uncompressed UTF-8 NDJSON with no BOM. Canonical Extended JSON preserves ObjectIds, BSON dates and numeric types. Some kind timestamps are BSON strings with explicit +00 offsets, requiring the documented string normalization. Dates are not all the same physical JSON type.

Phase 5C inspected the configured PostgreSQL target and reconciled exact compatible reference records. The private reference reports and persistent ledger contain destination UUIDs; tables below describe semantic targets. Existing archived/unrelated data were not modified.

Confidence vocabulary: **confirmed by schema/source**, **strongly supported by data**, **tentative**, **unresolved**. Confirmed meaning does not imply approval of a lossy transformation.

## Field-level activity mapping

This covers every field observed across the three raw activity shapes. Required means required in the destination.

| Legacy collection | Legacy field | Observed type / presence | Meaning | New entity/field | Transformation | Required? | Missing/invalid handling | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| activities | `_id` | $oid ×218 | Stable MongoDB identity | `activities.source_external_id` | `activities:<oid>`; retain original ID in private report | Import yes | Missing/duplicate identity invalidates package; none found | confirmed by schema/source |
| activities | `kindId` | $oid ×218 | Reference to kinds._id | `activities.activity_kind_id` | Explicit source-ID→target-UUID table | Yes | Unknown mapping requires decision; all raw references resolve | confirmed by schema/source |
| activities | `userId` | string ×170; absent 48 | Source owner marker | Scope validation only; no target owner column | Include all 218 as confirmed by user; do not persist as notes/tag | Scope yes | 48 missing owner IDs explicitly included; do not synthesize userId | confirmed by schema/source |
| activities | `when` | $date/$numberLong ×218 | Instant, or confirmed date-only midnight sentinel | `activity_date`, `started_at` | UTC milliseconds; explicit calendar/time policy below | Date yes | Invalid/missing date: skip; 72 midnight records preserve date with null start; timed dates use Europe/Helsinki with preserved UTC starts | approved |
| activities | `title` | string ×218 | Activity title | `activities.name` | Trim; empty→null, max 200 | No | No truncation; over-limit record skip/report | confirmed by schema/source |
| activities | `description` | string ×218 | Personal notes | `activities.notes` | 167 empty→null; preserve 51 nonempty, max 10,000 | No | Never log notes or derive classifications automatically | confirmed by schema/source |
| activities | `distance` | $numberInt ×217, $numberDouble ×1 | Distance in metres | Distance → `activity_measurements.numeric_value` | Exact canonical metre lexeme, ×1 | No | 98 zeros need policy; one precision exception | confirmed by schema/source |
| activities | `duration` | $numberInt ×218 | Total elapsed seconds | `activities.duration_seconds` | Nonnegative safe integer, ×1 | No | 5 zeros need policy; invalid fractional/negative values skip/report | confirmed by schema/source |
| activities | `elevation` | $numberInt ×170; absent 48 | Legacy ascent field | Ascent → numeric value | Use only when ascent absent; do not create separate elevation measurement | No | 168 fallback records; both-present pairs equal, future conflict requires decision | strongly supported by data |
| activities | `ascent` | $numberInt ×50; absent 168 | Total ascent in metres | Ascent → numeric value | Prefer present ascent, else elevation; ×1 | No | Never add the two fields; effective value available in all 218 | confirmed by schema/source |
| activities | `calories` | $numberInt ×218 | Energy kcal | Calories → numeric value | ×1, explicit unit policy below | No | 92 zeros; target registry lacks kcal | confirmed by schema/source |
| activities | `steps` | $numberInt ×50; absent 168 | Step count | Steps → integer value | Safe integer, count, ×1 | No | Omit absent values; 11 actual zeros need policy | confirmed by schema/source |
| activities | `avgHR` | $numberInt ×50; absent 168 | Average heart rate bpm | Average heart rate → integer value | ×1, explicit unit policy | No | Omit absent; 1 actual zero; registry lacks bpm | confirmed by schema/source |
| activities | `cadenceAvg` | $numberInt ×50; absent 168 | Average cadence labelled spm | Average cadence → integer value | ×1, explicit unit policy; not rpm | No | Omit absent; 12 zeros; registry lacks spm | confirmed by schema/source |
| activities | `createdAt` | $date/$numberLong ×218 | Creation metadata instant | `activities.created_at` | Preserve UTC milliseconds via controlled import path | Yes | Future absent metadata may use batch timestamp with warning; none missing here | confirmed by schema/source |
| activities | `updatedAt` | $date/$numberLong ×218 | Update metadata instant | `activities.updated_at` | Preserve UTC milliseconds | Yes | Future absent value may use creation metadata with warning; never activity date | confirmed by schema/source |
| activities | `__v` | $numberInt ×218, all zero | Mongoose version metadata | Ignored | No target domain meaning; original export retained | No | Do not create an activity measurement | confirmed by schema/source |

No structured tags, route, equipment, effort, feeling, variant or goal field exists in these documents. Derived UI fields and form-only HMS/hour/minute fields are not persisted source fields. Missing source steps/HR/cadence are now demonstrably absent, unlike the old zero-filled array projection.

## Field-level kind mapping

| Legacy collection | Legacy field | Observed type | Meaning | New entity/field | Transformation | Required? | Missing/invalid handling | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| kinds | `_id` | $oid ×10 | Referenced kind identity | Private source-kind→destination UUID mapping | Resolve activities.kindId against this ID | Yes | Unique/valid for all 10; never replace application UUID with it | confirmed by schema/source |
| kinds | `kindId` | string ×10 | Older discriminator/display fallback | Ignored for relationship matching; retained in private mapping | Nine UUID-shaped, one other string; activities reference _id instead | No | Do not assume it is a destination UUID or variant discriminator | confirmed by schema/source |
| kinds | `name` | string ×10 | Kind name | `activity_kinds.name` or approved variant mapping | Trim/preserve except approved Treadmill transformation | Yes | Empty/over-limit/duplicate names require resolution | confirmed by schema/source |
| kinds | `iconName` | string ×10 | Legacy SVG macro identifier | `activity_kinds.icon_name` | Explicit icon table below | Yes | ico-* literals unsupported; use approved supported equivalent | confirmed by schema/source |
| kinds | `description` | string ×10, 7 nonempty | Kind explanation | Ignored for persistence; evidence for environment | No destination kind description column; retain original privately | No | Do not copy descriptions to every activity note | confirmed by schema/source |
| kinds | `createdAt` | string ×10 | Creation metadata with explicit UTC offset | `activity_kinds.created_at` | Strict string normalization below | Yes | All 10 normalize; no batch default needed | strongly supported by data |
| kinds | `updatedAt` | string ×8, $date ×2 | Update metadata instant | `activity_kinds.updated_at` | Normalize strings or decode BSON milliseconds | Yes | All 10 normalize; future invalid metadata: explicit warning/decision | strongly supported by data |

No kind `__v` is present. Kind description loss is an explicit decision; it is not silently substituted into another field.

## Reference-data mapping

For non-Treadmill kinds, create a new kind only if a future target dry run finds no suitable existing row. Otherwise match after confirming semantic equivalence and record its UUID. Case-insensitive name equality alone is not sufficient. Archived names remain reserved; do not restore, rename or replace automatically.

| Legacy MongoDB _id | Legacy name / proposed target kind | Older kindId string (not a reference) | Activities | Action |
| --- | --- | --- | ---: | --- |
| `6a859b002489ecc2e1afefa7` | Strength Training | `11db0a12-9bda-4953-85af-9da5e3ef4738` | 36 | create new, or match existing after validation |
| `6a859b002489ecc2e1afefa8` | Swimming | `a27becce-1525-4c82-8402-62cb719415f2` | 0 | create new, or match existing after validation |
| `6a859b002489ecc2e1afefa9` | Walking | `af00837c-1db3-4687-b65d-9f7e446c08ba` | 108 | create new, or match existing after validation |
| `6a859b002489ecc2e1afefaa` | Cycling | `a6cc7614-59c9-419f-8cd7-34116e9315a1` | 7 | create new, or match existing after validation |
| `6a859b002489ecc2e1afefab` | Running | `b74c2e29-569f-4368-885d-4a3b5296d9d6` | 0 | create new, or match existing after validation |
| `6a859b002489ecc2e1afefac` | Physio Exercises | `2f73b5ca-f9b9-4510-9ce6-96561e8bb00c` | 4 | create new, or match existing after validation |
| `6a859b002489ecc2e1afefad` | Stretching | `53476398-2000-46b9-83f7-4080e3c048ea` | 0 | create new, or match existing after validation |
| `6a859b002489ecc2e1afefae` | Meditation | `1b00c956-ed91-49e3-855e-0903f04d0130` | 57 | create new, or match existing after validation |
| `6a859b002489ecc2e1afefaf` | Treadmill | `13946b8d-d536-4538-b88f-bd0b6dc50189` | 5 | approved provisional Walking + Treadmill; manual review |
| `6a859b002489ecc2e1afefb0` | Martial Arts | `hpwidbju8034a4bkahy6dgfg` | 1 | create new, or match existing after validation |

Kinds with zero activities remain valid reference data. Proposed supported icon map:

| Source icon | Source kind(s) | Destination icon |
| --- | --- | --- |
| ico-bike | Cycling | bike |
| ico-kendo | Martial Arts | activity |
| ico-meditation | Meditation | person-standing |
| ico-activity | Physio Exercises | activity |
| ico-run | Running | footprints |
| ico-gym | Strength Training | dumbbell |
| ico-stretch | Stretching | person-standing |
| ico-swim | Swimming | waves |
| ico-walk | Walking, Treadmill | footprints |

New kind defaults: generated UUID; approved name/icon; proposed color `#64748B`; nonnegative sort order from alphabetical source names; archive null; primary measurement null; normalized original creation/update metadata. Existing matched kind presentation/metadata are preserved, not overwritten.

| Legacy evidence | Target kind | Variant | Matching rule | Confidence |
| --- | --- | --- | --- | --- |
| Walking source ID; kind description says Walking outdoors | Walking | Outdoor, approved | Exact source-kind mapping for 108 activities; no note/title heuristics | strongly supported by data |
| Treadmill source ID; description includes walk and run | Walking provisionally; Running after manual review if needed | Treadmill | All five provisionally Walking + Treadmill, preserving title/notes and reporting review | approved |
| Remaining kinds | Corresponding kind | null | No variant evidence; never choose an existing default silently | confirmed by schema/source |

The five Treadmill records retain the earlier title evidence: one explicit Walk, one Walk/Jog, three environment/context labels without reliable gait. Do not classify gait by pace or infer from gym/route text. Approved: provisionally assign all five to Walking + Treadmill, preserve their original titles/notes, and emit TREADMILL_MANUAL_REVIEW. Do not create a separate Treadmill kind. Running + Treadmill can be created when a record is actually reassigned; it is not a prerequisite for these provisional assignments.

New variants use generated UUIDs, approved parent, approved name, sort order Outdoor=0/Treadmill=1 where applicable, isDefault=false, archive null and batch timestamps. Different parents may each own a distinct Treadmill variant. No activity splits are proposed.

## Numeric meanings, units and definitions

The legacy service multiplies form kilometres by 1000 before storage, divides metres by 1000 for display, and computes elapsed seconds as hrs×3600 + mins×60 + secs. **Raw exported distance already uses metres and duration already uses seconds.** Do not convert them again. Ascent/elevation metres are supported by exporter/service fallback, UI labels and equal stored pairs. No weight fields or inconsistent per-kind units were observed.

| Source | Applicable kinds with nonzero values | Target | Legacy / canonical unit | Transformation and definition |
| --- | --- | --- | --- | --- |
| distance | Cycling, Walking, Treadmill | Distance | m / metre | ×1, decimal precision 2, display kilometre; one exact precision exception approved for Phase 5D |
| duration | All seven used kinds | Core duration_seconds only | s / seconds | ×1 safe integer; no duplicate duration measurement |
| ascent or elevation | Walking, Treadmill | Ascent | m / metre | Prefer ascent, else elevation; decimal precision 0, display metre |
| steps | Walking | Steps | steps / count | ×1 integer, precision null |
| calories | Cycling, Meditation, Strength Training, Walking, Treadmill | Calories (kcal), approved | kcal / named unitless | ×1 decimal precision 0; named null-unit fallback or future registry extension |
| avgHR | Cycling, Walking, Strength Training | Average heart rate (bpm), approved | bpm / named unitless | ×1 integer, precision null |
| cadenceAvg | Walking | Average cadence (spm), approved | spm / named unitless | ×1 integer, precision null; do not use rpm/count |

Distance precision 2 preserves the current display behavior: canonical 4030 metres displays as 4.03 km. The mapper uses definition precision for display as well as canonical validation; precision 0 would hide kilometre fractions. Original exact `4030.0000000000005` exceeds supported precision; the approved exact one-record exception converts it to 4030.

The current unit registry supports length/duration/mass/count only. A null canonical/display unit with a unit-bearing definition name can preserve values and visible meaning without claiming conversion support. This named-unitless mapping was approved on 2026-09-13. The alternative is a separately reviewed energy/rate registry extension, or explicit approved omission of 213 nonzero values. Never relabel kcal/bpm/spm as count.

Definitions belong to parent kinds where retained values require them; no variant-specific definitions are needed here. If Treadmill changes parent, reevaluate the union of definitions. Only match existing definitions after checking type, ownership, canonical meaning, units, precision and bounds. New definitions: generated UUID, parent UUID, variant null, required=false, minimum=0, maximum=null, personalBestDirection=none, archive=null, batch timestamps. Aggregation total for Distance/Ascent/Steps/Calories, average for HR/Cadence (unweighted recorded-activity average, not time-weighted). Sort order 0..5 in that order, skipping unused definitions.

Store one typed value per activity/definition pair; numeric/integer column as above, all other typed columns null. Use existing base-ten conversion/validation, not binary floating-point parsing or display rounding for persistence. History locks definition type/unit/precision/bounds. Do not bypass validation through direct SQL.

Absent steps/HR/cadence: omit the value (504 absent fields over 168 activities), without inventing zero. The user confirmed that all 337 actual stored zeros across 134 activities mean nothing recorded. Omit all zero measurements, including ascent; set zero duration to null. Do not create zero-only definitions. Missing fields are also omitted, never synthesized.

## Temporal rules

| Source field | Observed representation | Meaning / target | Transformation / risk |
| --- | --- | --- | --- |
| activities.when | $date/$numberLong, epoch milliseconds | Calendar activity_date plus optional started_at | Decode exact instant; derive date using explicit approved timezone; 72 confirmed date-only midnight records preserve recorded date and use null start; remaining calendar timezone is Europe/Helsinki (approved) |
| activities.createdAt / updatedAt | $date/$numberLong | Creation/update metadata | Preserve UTC milliseconds; do not derive activity date from metadata |
| kinds.createdAt | 10 strings of form YYYY-MM-DD HH:mm:ss.sss+00 | Kind creation metadata | Strictly replace space with T, +00 with Z, validate round trip, preserve |
| kinds.updatedAt | Same string format ×8, BSON dates ×2 | Kind update metadata | Explicit branch on observed type; no local-time parsing |
| duration | $numberInt | Elapsed seconds | No date parser or timezone conversion |

Kind strings are valid BSON strings in canonical EJSON, not malformed date wrappers. The literal +00 confirms UTC for those metadata values; their shape resembles SQL timestamp text but prior database provenance is not established. No timestamp precision reduction is required: all observed dates use milliseconds.

Activity range: 2025-11-14 through 2026-09-06. All 218 activity instants parse; 72 are UTC midnight, 146 not. Helsinki and UTC yield the same calendar date for all current records; this observation does not prove the original timezone. Code uses environment-local parsing/display and UTC date inputs inconsistently. Do not replay the editor's mixed conversions. Choose an explicit IANA zone if confirmed; no fixed +02/+03 offset.

Approved: preserve the recorded calendar date for the 72 midnight records and set started_at to null. Europe/Helsinki for the other calendar dates and preservation of nonmidnight UTC instants as starts are approved by the Phase 5D brief. Missing actual start time cannot be reconstructed from metadata or ObjectId. Missing/invalid future required dates are skipped/reported, never set to now. Kind metadata can now be preserved instead of synthesized.

## Tags and goals

| Source field/value | New tag | Rule | Reason |
| --- | --- | --- | --- |
| No structured tag field | none | tagIds=[]; no joins | No evidence of structured tags |
| Titles/notes/context keywords | none automatically | Preserve only name/notes | No keyword extraction or inferred environment/gait |
| userId / IDs / icons / kind discriminator | none | Scope/identity/metadata only | Not user context tags |

No goal model/export was found; the legacy challenge controller supplies an empty list. Create no goals inferred from historical behavior.

## Activity transformation and required destination coverage

One accepted source document creates one activity, zero or more measurement rows, and zero tag joins. Splitting a mixed activity into multiple rows would invent allocations and alter counts; it requires separate explicit approval and is not part of this mapping.

| Destination | Source / generated/default / decision |
| --- | --- |
| activities.id | Generated application UUID, never source ObjectId or older kindId |
| activity_kind_id | Required approved source-kind→target UUID |
| activity_variant_id | Approved Walking/Treadmill policy; otherwise null |
| activity_date | Required valid when, under explicit calendar policy |
| started_at | Exact decoded instant or approved null for date-only records |
| duration_seconds | Source safe integer; approved zero handling |
| name / notes | Source title/description trimmed; optional empties null |
| effort / feeling | null; no corresponding source data |
| is_partial | false for new optional definitions; explicitly true with warning if matched configuration requires absent measurements; do not weaken existing requirements |
| source / source_external_id | Atomic import identity pair specified below |
| created_at / updated_at | Preserve valid source metadata through controlled import path |
| measurement id / activity_id / definition ID | Generated UUID, destination activity UUID, approved effective same-kind definition |
| measurement values | Exactly one typed column; absent source→no row, never synthesized zero |
| measurement created_at / updated_at | Inherit activity metadata as approved; separate measurement timestamps unavailable |
| tagIds / activity_tags | Empty; no generated tags or joins |

All required new kind/variant/definition fields have defaults above. Existing archived references remain readable in history, but current creation rules do not permit arbitrary new assignments to them. Report archived/configuration conflicts; no implicit restore or validation bypass. The future import path must share domain validation with normal activity writes and preserve metadata/identity atomically; public POST rejects source identity and is insufficient unchanged.

## Stable source identity and reruns

Raw identity loss is resolved: all 218 activities and 10 kinds have unique ObjectIds and all references resolve. Use:

- source = `legacy-activus-mongodb:<datasetId>`
- source_external_id = `activities:<original-_id-string>`

Dataset ID identifies the source database lineage and is reused across re-exports; it must not be a fresh export timestamp or random new ID each run. Preserve source collection and original ID separately in a private mapping/report as well. This separates systems/collections/database lineages while keeping generated destination UUIDs.

Existing schema already provides the all-or-none identity check and partial unique index `activities_source_unique`. No ledger migration is needed solely for core deduplication. Insert identity, activity and owned values atomically; unique conflicts roll back owned writes. Same identity/same content: skip/report rerun. Changed mapped content: conflict pending explicit update mode, not silent overwrite. Distinct IDs remain distinct activities even if values look identical.

Kinds lack source columns. Phase 5C now uses the transactional PostgreSQL `legacy_reference_mappings` ledger for source kind IDs, target kind/variant/definition UUIDs, source namespace and reference fingerprints. The private manifest and decisions remain checksum-bound inputs. Validate ledger and target configuration on every rerun. Do not import the old arrays in addition to the raw files, and do not use projection matching as persistence identity. The old file/index fallback is retired for this migration.

## Import dispositions

| Condition | Future action |
| --- | --- |
| Corrupt JSON/encoding, invalid manifest/version/checksum, duplicate source identity | Abort package before writes |
| Unknown owner scope/reference/time policy/unit policy | Explicit decision before dependent writes |
| Missing/invalid required activity date, impossible numeric value | Skip individual record and report ID/reason without notes |
| Truly absent optional measurement | Omit; report incomplete if destination requires it |
| Empty optional text | null; never substitute another field |
| Present ascent plus elevation equal | Use ascent once; ignore duplicate alias with audit information |
| Both ascent/elevation disagree | Require explicit mapping decision; none currently disagree |
| Distance 4030.0000000000005 | Approve exact exception→4030 with warning; otherwise approved omission/partial or skip |
| Approved zero/midnight omission | Import with documented null/omission and warning |
| Unusual plausible values | Preserve with review warning, not automatic correction |
| Different IDs with duplicate-looking values | Keep both; optional review only |
| Previously imported same identity | Skip unchanged; changed values require explicit update policy |
| New/unmapped field or incompatible target configuration | Mapping review; no silent field loss |

Current reference coverage: all 218 activities resolve persisted reference mappings. Phase 5D committed and reconciled all 218 records and 472 measurements with no blocking defects. The approved date and precision decisions are recorded above. Raw source export files remain unchanged.

## Decision register (all resolved)

1. **Source label/provenance ? recorded.** The private manifest uses stable lineage label `activus-personal`, retained across re-exports. Unknown source database/tool/export time/consistency are explicitly acknowledged, not inferred. Owner scope includes all 218.
2. **Calendar timezone - resolved by Phase 5D.** Derive dates for 146 timed records using Europe/Helsinki; preserve exact UTC starts. Keep the 72 date-only dates unchanged with null starts.
3. **Treadmill initial assignment ? resolved.** All five provisionally map to Walking + Treadmill, preserving original titles/notes and reporting manual review. No split and no separate Treadmill kind.
4. **Walking environment — resolved 2026-09-13.** All 108 source Walking records map to Walking + Outdoor.
5. **Stored zeros ? resolved.** All 337 values across 134 activities mean nothing recorded: omit distance 98, ascent 118, calories 92, steps 11, HR 1 and cadence 12; set five zero durations to null. No zero ascent is retained. The 504 absent optional fields are also omitted.
6. **Distance precision - resolved by Phase 5D.** Only source ID `6a85a86fd22d3159d3bd2537` and exact source distance `4030.0000000000005` are corrected to `4030` metres, emitting `PRECISION_EXCEPTION_APPLIED`. No general rounding.
7. **Unsupported units — resolved 2026-09-13.** Named null-unit definitions are approved for kcal (126 nonzero), bpm (49), and spm (38), covering 213 values across 126 activities. Never reinterpret as count. Zero handling remains separate.
8. **Reference presentation/description loss — resolved 2026-09-13.** Proposed supported icons/color/order, retention of unused kinds, normalization of kind timestamps, and private retention of seven descriptions are approved. Existing target conflicts remain unknown until dry run; matched configuration must not be overwritten.
