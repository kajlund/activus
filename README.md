# Activus

Activus training journal, through phase 3C: PostgreSQL configuration, activity and tag APIs plus a Lit client for activity kinds, variants, measurements and tag management. Design and architecture are defined in `.doc/visual-design.md` and `.doc/technical-architecture.md`.

## Setup

Use Node.js 22.13+ (22.x), 24+, or a newer supported even release and pnpm 10.34.5. Dependencies are pinned exactly and recorded in `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

If pnpm is unavailable, prefix commands with `npx --yes pnpm@10.34.5` instead of `pnpm`; no global installation is necessary.

Before migrating or starting the API, copy `.env.example` to `.env` at the repository root and set `DATABASE_URL` to your development PostgreSQL database. Existing process environment variables take precedence. Never commit credentials. `DATABASE_URL` is required for real server startup and migrations; app-only tests need no database. `WEB_ORIGIN` must be an HTTP(S) origin without a path or trailing slash.

Open <http://localhost:5173>. Vite proxies `/api` to the API on port 3000 (or `PORT` from the root environment). The server exposes `GET /health` outside the API prefix, returning `{"status":"ok"}`; access it directly at <http://localhost:3000/health> with the default port. This is process health, not database readiness. `WEB_ORIGIN` controls API CORS; Vite uses a fixed port with strict port checking.

`pnpm dev` builds contracts first, then watches contracts, API, and web together. Ctrl+C stops the process group; an exited child stops its siblings. The API verifies database connectivity before listening, handles SIGINT/SIGTERM, stops accepting requests, and closes its pool after requests finish. Shutdown has a 15-second deadline; database statements have a 10-second timeout. Startup never applies migrations or seeds data.

## Commands

| Command                            | Purpose                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                         | Start all development watchers                                               |
| `pnpm build`                       | Build contracts, Node API, and static web assets                             |
| `pnpm typecheck`                   | Check all source, tests, and Vite configuration                              |
| `pnpm test`                        | Run API and client Vitest tests                                              |
| `pnpm test:browser`                | Run isolated Chrome configuration journeys in four screen/theme combinations |
| `pnpm lint`                        | Run ESLint with zero warnings allowed                                        |
| `pnpm format`                      | Format project files                                                         |
| `pnpm format:check`                | Check formatting                                                             |
| `pnpm --filter @activus/api start` | Run the compiled API after building                                          |
| `pnpm db:generate`                 | Generate SQL and snapshots from the Drizzle schema, offline                  |
| `pnpm db:check`                    | Check Drizzle migration history consistency, offline                         |
| `pnpm db:migrate`                  | Apply committed migrations using validated `DATABASE_URL`                    |
| `pnpm test:db`                     | Run real PostgreSQL tests against guarded `TEST_DATABASE_URL`                |

`pnpm test` runs unit, direct Hono API, and client tests without a database or TCP listener. `pnpm test:db` is separate and uses real PostgreSQL, never SQLite or a test double. Client tests use jsdom. Manrope is bundled from a local dependency, with system fallbacks and no font CDN requests.

## Structure and boundaries

```text
apps/api/src/
  config/env.ts       Zod environment validation
  config/load-env.ts  Explicit root environment loading
  db/                Drizzle schema, pool lifecycle, migration command
  modules/activity-kinds/
                     Schemas, routes, service, repository, mapper, unit/API tests
  modules/activity-variants/
  modules/measurement-definitions/
                     Feature schemas, services, repositories, routes and tests
  modules/measurement-units/
                     Explicit metadata registry and conversion helpers
  modules/activities/
                     Contracts validation, exact decimal arithmetic, service,
                     transactional repository, mappers, routes and unit tests
  modules/tags/       Managed tag service, repository, validation, routes and tests
  app.ts              Hono construction, health, logging, errors
  server.ts           Environment loading, startup, shutdown
apps/api/test/        Foundation tests, test support, guarded PostgreSQL tests
apps/api/drizzle.config.ts
                     Offline migration generation configuration
apps/web/
  public/icons/       Approved pulse-shield SVG
  src/app-shell.ts    Responsive navigation and History API routing
  src/features/activity-kinds/
                     Kind and variant lists, detail view and reusable forms
  src/features/measurements/
                     Parent/effective lists, measurement form and validation
  src/features/tags/  Tag list, URL filters, lifecycle dialogs and name/colour form
  src/services/      Typed configuration API client and cached unit metadata
  src/components/    Dialog focus handling across Lit shadow roots
  src/routes/        Client navigation helpers
  src/styles/        Approved tokens and local font foundation
  test/              Shell, API-client and configuration component tests
  e2e/               Isolated Playwright journeys and HTTP fixture
packages/contracts/  Health, configuration, activity, tag, unit and error contracts
scripts/import/      Reserved for the future JSON importer
drizzle/             Generated SQL migrations and snapshots
```

Build output lives in each package's `dist/`. Contracts export compiled JavaScript and TypeScript declarations; they contain only environment-independent transport schemas. The default export condition also lets Drizzle Kit load the same ESM module through Node's supported `require(esm)` bridge. API logs use generated request IDs and omit request bodies, query strings, credentials, and arbitrary exception messages. Error responses use stable codes and request IDs; internal details remain private in every environment.

The web shell follows the six approved navigation labels. Activity kinds is implemented, and Settings links to configuration management, including Tags. The other destinations remain placeholders. A mobile navigation disclosure uses native keyboard behavior. Both themes follow `prefers-color-scheme`; motion respects `prefers-reduced-motion`.

## Configuration client (phases 3A and 3B)

Open `/activity-kinds` to create, edit, archive and restore kinds. `/activity-kinds/:id` shows kind identity, Measurements, then Variants. Forms use the approved Lucide icon registry and colour palette, with a custom hex option. Variant default changes follow the API: archive clears defaults and restore does not reinstate them. Names remain reserved across archived records. Counts and primary names on the kind list are omitted to avoid per-row requests.

Archived filters live in `archived`, `variantsArchived` and `measurementsArchived` URL parameters. A variant's Measurements link sets `measurementVariant=<uuid>`; refresh, deep links and back/forward work. That view uses the effective endpoint and clearly separates inherited, read-only parent definitions from additional variant definitions. `Edit at parent` returns to the parent measurement list. No inheritance overrides are implemented.

Measurement forms support decimal, integer, duration, rating, yes/no and short text. Required state is a basic field; bounds, precision, aggregation, personal-best direction and numeric display order are under Advanced settings. Unit choices and conversion factors come from cached `/api/v1/measurement-units` metadata. Unitless numbers are explicit. Bounds use the selected display unit, or `h:mm:ss` for duration, and are submitted in canonical units/seconds. Ratings use the API's 1–5 or 1–10 ranges. Integer precision is implicitly zero. Boolean and text definitions submit no numeric settings.

The API does not expose history-use flags. On `MEASUREMENT_DEFINITION_HAS_HISTORY`, the form preserves entered data, explains and locks type, canonical dimension, precision and bounds, and offers **Keep recorded settings** before saving safe edits. This follows the existing API's stricter precision/bounds policy; no backend extension or extra per-row request is needed. PATCH sends only changed fields. Primary actions are limited to eligible active parent numeric/duration/rating definitions; clearing primary is supported. Archiving primary explains that it must first be cleared or replaced. Archive/restore never removes history.

Requests have cancellation, a 15-second timeout, response-schema validation, safe error messages and request IDs. Mutations are never automatically retried. Failed saves preserve forms. Superseded reads cannot overwrite a newer selection. Measurement saves refresh their measurement scope. Native dialogs provide modality, with explicit Tab/Shift+Tab wrapping through shadow roots, Escape handling, first-invalid-field focus and opener focus restoration. Dirty measurement forms require discard confirmation; leaving/reloading also warns. Mobile forms fill the viewport and scroll vertically.

Complete-list transactional reorder endpoints remain deferred by the backend. The client preserves server order and offers ordinary numeric order edits; there is no drag reordering or sequence of per-row reorder writes.

Browser tests use installed Google Chrome (`channel: chrome`). If Chrome is unavailable, install it or run `pnpm --filter @activus/web exec playwright install chrome`. `pnpm test:browser` builds the web client, then starts and stops an isolated Vite preview server on port 4173. Every API request is intercepted by deterministic test-created state; no development or production database is accessed. Screenshots and failure traces are written under `.artifacts/phase-3a/` for both phases. Tests run at 1440×1000 and 390×844 in light and dark themes. Static production hosting will need an SPA fallback for deep links when deployment is implemented.

## PostgreSQL setup and migrations

Use a locally installed PostgreSQL 15+ server or an explicitly provisioned development instance. No Docker setup is included. With `psql` as an administrator, create a dedicated development role and database (choose passwords interactively):

```sql
CREATE ROLE activus LOGIN;
\password activus
CREATE DATABASE activus OWNER activus;
```

Configure the root `.env` with the matching connection URL, then run:

```sh
pnpm db:migrate
pnpm dev
```

For schema changes, edit `apps/api/src/db/schema.ts`, run `pnpm db:generate`, inspect the generated SQL in `drizzle/`, and run `pnpm db:check` before `pnpm db:migrate`. Commit SQL and metadata together. The migration command uses the Drizzle migrator and its migration journal. There is no schema-push workflow, automatic migration, seed data, or production deployment configuration.

## Activity-kind API and storage policy

Base path: `/api/v1/activity-kinds`.

| Method and path     | Behaviour                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `GET /`             | `{ "items": [...] }`, active only; `?includeArchived=true` explicitly includes archived rows |
| `POST /`            | Create; `201`, activity-kind response and `Location` header                                  |
| `GET /:id`          | Fetch active or archived kind; `200`                                                         |
| `PATCH /:id`        | Partial update; `200`; omitted fields remain unchanged                                       |
| `POST /:id/archive` | Preserve row and archive; `200`                                                              |
| `POST /:id/restore` | Restore the same identity; `200`                                                             |

Creation requires `name`, `iconName`, `color`, and `sortOrder`. PATCH accepts those fields and nullable `primaryMeasurementDefinitionId`, requires at least one, and cannot archive/restore. Unknown fields, invalid or repeated query parameters, invalid UUIDs, malformed JSON, and invalid values return `400` with `ACTIVITY_KIND_INVALID`. JSON bodies must use `Content-Type: application/json`. Missing resources return `404` / `ACTIVITY_KIND_NOT_FOUND`; reserved names return `409` / `ACTIVITY_KIND_NAME_CONFLICT`. Errors preserve `{ "error": { "code", "message", "requestId" } }` and the matching `X-Request-Id` header. This phase consistently uses `400` for input validation rather than introducing a separate `422` convention.

Names are trimmed, nonempty and limited to 120 characters. **Stored names are reserved case-insensitively across both active and archived rows.** Restore the existing kind instead of creating a new identity with its archived name. A global unique index on `lower(name)` protects creation, rename, and restore under concurrency. This is deliberately stronger than active-only uniqueness: a conflicting archived row cannot normally exist. Renaming an existing row is supported; its former name is no longer reserved. Archival alone never frees a name.

Archive and restore are idempotent: requesting the current state returns the current record with unchanged timestamps. A real state transition updates `updatedAt`; repeated calls preserve `archivedAt` too. Archived rows remain readable and editable. There is no DELETE endpoint.

Supported Lucide identifiers are `activity`, `footprints`, `bike`, `waves`, `dumbbell`, and `person-standing`. The catalogue is explicit in contracts and enforced by a database check; adding an icon requires updating the catalogue and generating a migration. SVG markup is rejected. Colours must be six-digit hex (`#RRGGBB`) and are normalized to uppercase. Sort order is an integer from 0 through 2147483647; duplicates and gaps are allowed. Lists order by sort order, name using PostgreSQL `C` collation, then UUID, backed by full-list and active-only indexes.

The tables use PostgreSQL-generated UUIDs (`gen_random_uuid()`), snake_case columns, and `timestamptz` creation/update/archive instants. The driver session uses UTC and responses serialize instants as UTC ISO 8601 strings. Database checks protect names, supported icons, canonical colours and non-negative sort order. Repository mutations maintain `updated_at`; clearing defaults when archiving a kind also updates variant timestamps transactionally.

## Phase 2B configuration API

All paths below start with `/api/v1`. Creates return `201` and `Location`; reads, patches and archive/restore return `200`. Lists default to active records and accept `includeArchived=true`. Partial PATCH bodies must be nonempty and cannot change ownership or archival state. Names retain phase 2A's case-insensitive reservation across archived records. Lists order by `sortOrder`, name with `C` collation, then ID.

| Methods    | Path                                               | Purpose                        |
| ---------- | -------------------------------------------------- | ------------------------------ |
| GET, POST  | `/activity-kinds/:activityKindId/variants`         | List/create variants           |
| GET, PATCH | `/activity-variants/:id`                           | Read/update variant            |
| POST       | `/activity-variants/:id/archive`, `/restore`       | Archive/restore variant        |
| GET, POST  | `/activity-kinds/:activityKindId/measurements`     | List/create definitions        |
| GET, PATCH | `/measurement-definitions/:id`                     | Read/update definition         |
| POST       | `/measurement-definitions/:id/archive`, `/restore` | Archive/restore definition     |
| GET        | `/measurement-units`                               | Static supported unit metadata |

Variant creation requires `name`, `sortOrder`, and `isDefault`. Setting a default clears the previous default in one transaction. Archiving a variant clears its default; archiving a kind clears all its defaults. Restoring never implicitly reinstates a default. New children and restoration require active parents. Historical configuration remains readable and editable. There are no DELETE endpoints.

Definition creation requires `name`, `valueType`, `canonicalUnit`, `displayUnit`, `precision`, `isRequired`, `minimumValue`, `maximumValue`, `aggregation`, `personalBestDirection`, and `sortOrder`. Supply explicit null for irrelevant nullable fields. Optional `activityVariantId` defaults to null (parent-level). Owning kind and variant cannot change. Parent definitions are inherited; variant definitions supplement them. Names cannot collide with inherited definitions, including reserved archived names.

The measurements list accepts `activityVariantId=<uuid>` to select only that variant's definitions. Add `effective=true` to include its inherited parent definitions. Effective mode requires a variant ID and returns `{view: "effective", items: [...]}` with each item's `source` set to `inherited` or `variant-specific`. Other lists return `{view: "definitions", items: [...]}`.

Combination rules live in the focused domain validator and are also protected by database checks:

| Type          | Units, precision and bounds                                                                                    | Aggregation / personal best                   |
| ------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| decimal       | Compatible units or null/null; precision 0–6 required; decimal bounds allowed                                  | All five aggregations / highest, lowest, none |
| integer       | Compatible units or null/null; precision null or 0; integral bounds                                            | All five / all three                          |
| duration      | Canonical `second`; display `second`, `minute`, `hour-minute`; null precision; nonnegative whole-second bounds | All five / all three                          |
| rating        | Null units/precision; exactly 1–5 or 1–10                                                                      | average, latest, minimum, none / all three    |
| boolean, text | Null units, precision and bounds                                                                               | none / none                                   |

All definition bounds are finite numbers within ±`Number.MAX_SAFE_INTEGER`, stored as PostgreSQL double precision configuration bounds; minimum cannot exceed maximum. Irrelevant settings are rejected. Text is intended for short structured values. Activity values use the exact storage described below.

The explicit registry supports metres, kilometres, miles, feet, seconds, minutes, hours/minutes, kilograms, pounds and count, with stable singular IDs, labels, symbols, dimensions, canonical units, conversion factors and default precision. Metres, seconds, kilograms and count are canonical. Unitless numeric definitions use null/null. `hour-minute` is a presentation of canonical seconds, not a fractional-hour conversion. Conversion helpers reject non-finite inputs/results; no unrestricted conversion framework is introduced.

Kinds expose nullable `primaryMeasurementDefinitionId`. Select or clear it through the existing kind PATCH endpoint. A primary must be an active, same-kind parent definition of decimal, integer, duration or rating type. Archiving it or changing it to an unsuitable type returns a conflict until the primary is cleared or replaced. Database triggers protect these rules under concurrent and direct writes.

Constrained text columns use shared TypeScript constants and PostgreSQL checks because no safe enum-migration policy is established. Partial unique indexes handle null parent ownership and one active default; a composite foreign key enforces variant/kind ownership. Cross-scope naming and primary guards serialize writes through the owning kind. Serialization/deadlock conflicts return `409 CONFIGURATION_WRITE_CONFLICT` and may be retried. All configuration foreign keys use restrictive deletion. See [migration notes](drizzle/README.md).

## Phase 2C activities

| Method | Path                     | Behaviour                                                             |
| ------ | ------------------------ | --------------------------------------------------------------------- |
| POST   | `/api/v1/activities`     | Create common fields and all values atomically; `201` plus `Location` |
| GET    | `/api/v1/activities/:id` | Complete detail, including archived configuration; `200`              |
| GET    | `/api/v1/activities`     | Filtered, paginated journal summaries; `200`                          |
| PATCH  | `/api/v1/activities/:id` | Partial common-field update or explicit value replacement; `200`      |
| DELETE | `/api/v1/activities/:id` | Permanent deletion of activity and its owned values; `204`            |

Missing activities return `404 ACTIVITY_NOT_FOUND`, including repeated deletion. There is no trash or undo. No activity UI or browser workflow is introduced in this phase.

Create requires `activityKindId`, `activityDate`, and a `measurements` array (possibly empty). Optional common fields are `activityVariantId`, `startedAt`, `durationSeconds`, `name`, `notes`, `effort`, `feeling`, and `isPartial`. Nullable fields default to null; `isPartial` defaults to false. No default variant is silently selected. Source identity fields are reserved and rejected with `ACTIVITY_SOURCE_IDENTITY_FORBIDDEN`.

```json
{
  "activityKindId": "<existing kind UUID>",
  "activityDate": "2024-02-29",
  "durationSeconds": 3600,
  "measurements": [
    {
      "measurementDefinitionId": "<existing distance definition UUID>",
      "valueType": "decimal",
      "value": "1.25",
      "unitId": "kilometre"
    }
  ]
}
```

Replace the placeholders with existing IDs. Decimal/integer inputs may specify a supported compatible unit; omission means canonical units. Duration inputs require `unitId: "second"`. Rating, Boolean and text inputs do not accept units. Measurement arrays are limited to 200 entries and reject duplicate definition IDs.

### Common fields and duration

`activityDate` is a validated `YYYY-MM-DD` string (years 0001–9999) and PostgreSQL `date`; it never passes through a JavaScript Date. `startedAt` is an independent optional instant, accepts offsets and up to millisecond precision, and returns UTC. It never changes the journal date. Overall `durationSeconds` is a nonnegative safe integer stored directly on the activity. Additional duration definitions mean moving/rest/interval times only; no common-duration definition or duplicated value is created. A primary definition always denotes a kind-specific measurement.

Name and notes are trimmed, with empty strings stored as null; limits are 200 and 10,000 characters. Effort and feeling use nullable integer ratings 1–5. The documents did not specify their numeric scales, so this uses the existing small-rating convention without inventing qualitative labels.

### Exact numbers and typed values

Decimal values use PostgreSQL `numeric` without a rounding typmod, plus checks limiting canonical scale to six and magnitude to `Number.MAX_SAFE_INTEGER`. Definition precision (0–6) applies to **canonical values after conversion**. Values that do not fit are rejected, never silently rounded. For example, one mile is exactly `1609.344` metres and needs precision 3 or greater. One pound produces `0.45359237` kilograms and exceeds the supported canonical scale; 100 pounds produces `45.359237` and fits precision 6. This is a deliberately bounded registry, not unrestricted conversion or approximate persistence.

Use plain decimal strings for exact input. Strings reject exponents, whitespace, leading plus signs, leading zeroes, separators and unit suffixes; the input boundary is at most 48 characters and 24 fractional digits before conversion. Trailing zeroes are normalized. Number inputs mean JavaScript's shortest decimal representation of that number; precision already lost before transmission cannot be recovered. Conversion multiplies base-ten integer coefficients using the registry's explicit factors. Existing floating-point unit helpers are not used for persistence.

Canonical decimal responses are strings. Integers, additional durations and ratings use safe integers backed by `bigint`; Booleans and text use their own columns. Exactly one column must be present, with one row per activity/definition. Text is trimmed and limited to 500 characters; empty text omits or removes its value. False and zero remain real values.

Each returned measurement includes definition ID/name, type, archived state, inherited/variant-specific source, canonical value/unit and display value/unit. Display numeric values are plain decimal strings rounded half away from zero to the configured precision or unit default. They are presentation values, not exact canonical replacements. `hour-minute` display values remain seconds for the future formatter. Detail orders parent definitions first, then variant definitions, then configured order, name with `C` collation, and definition ID.

### Completeness, editing and history

Every active required effective definition must have a value unless `isPartial: true` is explicit. Partial records still validate all supplied values, ownership, active parent selection and dates. Age never implies partial status. If configuration adds new requirements, a later edit must supply them or explicitly mark the entry partial.

PATCH must be nonempty. Omitted common fields and omitted `measurements` are preserved. A supplied measurement array is the **complete desired set**; `[]` removes all values only when completeness permits it. Changing kind or variant requires that array explicitly. Missing or incompatible replacement sets return `409` with `error.details.incompatibleDefinitionIds`; missing required values return `400` with `missingDefinitionIds`. No incompatible values are silently discarded or retained. There is no definition-ID remapping between kinds.

Existing archived kinds/variants remain readable and their activity common fields can be corrected. Moving an activity requires active resulting configuration. Existing archived-definition values may be corrected or explicitly removed, but new archived-definition values cannot be added. Restoring configuration never rewrites values. Once values reference a definition, its type, canonical unit, precision and bounds cannot change; archive and replace it instead (`409 MEASUREMENT_DEFINITION_HAS_HISTORY`). Names, display units and other non-storage metadata remain editable. This is the small phase 2B compatibility extension required once history exists.

ActivityService centrally checks definition effectiveness, type, units, ranges, required values and historical-editing rules inside the repository transaction. PostgreSQL checks cannot compare a value to another table's definition: arbitrary direct SQL can bypass these domain rules, so future importers must use this same service. The database still enforces typed-column presence, safe numeric bounds, ownership foreign keys and unique pairs. A focused configuration trigger prevents reinterpretation of stored history, following phase 2B's existing trigger convention; there is no opaque value-validation trigger.

PATCH locks the activity before reading and merging it, then locks relevant kind rows in UUID order to coordinate with configuration writes. Creation takes the same kind lock. Reads use a repeatable-read snapshot for consistent common fields and values. Replacement upserts retained values and deletes only omitted ones, inside the same transaction. Failures roll back both common fields and measurements.

### Filters and pagination

Lists accept inclusive `dateFrom`/`dateTo`, `activityKindId`, `activityVariantId`, `isPartial=true|false`, literal case-insensitive `search` over name/notes (1–200 characters), `limit` (default 25, maximum 100) and `offset` (default 0, maximum 1,000,000). Reversed dates, repeated/unknown parameters and arbitrary ordering are rejected. A variant filter resolves its owning kind; a supplied incompatible kind returns an error. Search is parameterized and escapes SQL wildcard characters.

Ordering is journal date descending, start time descending with nulls last, creation time descending, then UUID descending. Summary responses expose kind/variant metadata, duration, selected primary value when recorded, duration fallback when no primary value is available, partial status and `hasNotes`, never full notes. No unrelated measurement is guessed as a fallback.

Pagination returns `limit`, `offset`, `hasMore` and nullable `nextOffset`. The repository fetches one extra row instead of an expensive total count. It batch-loads measurements in one additional query, avoiding N+1 reads. Like other offset APIs, separate page requests can shift when concurrent inserts/deletes occur.

## Phase 2D tags and activity tagging

Tags are optional global labels such as Commute, Recovery, Race or With dog. They describe cross-cutting context. Use an activity variant for structured distinctions such as Treadmill, Outdoor, Trail or Pool. No tags are implicitly created from activity input.

| Method     | Path                       | Behaviour                                               |
| ---------- | -------------------------- | ------------------------------------------------------- |
| GET, POST  | `/api/v1/tags`             | List tags or create one (`201` and `Location`)          |
| GET, PATCH | `/api/v1/tags/:id`         | Read or partially update a tag (`200`)                  |
| POST       | `/api/v1/tags/:id/archive` | Archive without removing historical assignments (`200`) |
| POST       | `/api/v1/tags/:id/restore` | Restore the same identity (`200`)                       |

Create requires a trimmed, nonempty name of at most 120 characters. Optional `color` defaults to null, accepts six-digit CSS hex, and normalizes to uppercase. PATCH accepts only name and colour, requires at least one field, preserves omitted colour and allows explicit null to clear it. Tags have no icons, ordering fields, hierarchy or kind ownership. Responses expose `id`, `name`, `color`, `isArchived`, `createdAt` and `updatedAt`.

Names are globally reserved case-insensitively across both active and archived rows, matching activity kinds. Archival does not free a name; renaming does. The PostgreSQL unique index protects concurrent/direct writes and restore. Under this stronger reservation policy a conflicting archived identity cannot normally be created. Archive/restore are idempotent and preserve timestamps when already in the requested state. There is no permanent tag deletion endpoint. `activityCount` is deliberately deferred.

Tag lists default to active records and accept `includeArchived=true` and optional `search` (1–120 trimmed characters, literal case-insensitive substring). Unknown/repeated parameters are rejected. Lists and activity tag summaries order by `lower(name)` using PostgreSQL `C` collation, then UUID.

Activity create and PATCH accept `tagIds`, an array of at most 100 UUIDs. Omission means no tags on create and preservation on PATCH. A supplied array is the complete desired set; `[]` removes every assignment. Duplicate IDs, including differently cased spellings of the same UUID, are rejected. All tags must exist. Newly assigned tags must be active; an already-attached archived tag may remain by omission or explicit inclusion. After explicit removal, an archived tag cannot be re-added until restored. Archival and restoration never modify join rows or activity data.

Tag replacement, common fields and measurement changes commit in the same activity transaction. Tag IDs and measurement arrays have independent replacement semantics: changing one does not replace the other. Shared tag row locks coordinate assignment validation with concurrent archival/updates; activity row locks preserve independent concurrent PATCH changes. These active-assignment rules are enforced by the activity service, which future application write paths must reuse. Database foreign keys and a composite primary key protect relationship integrity.

Activity details and list items include `tags: [{id, name, color, isArchived}]`, including historical archived tags. Assignment storage uses `activity_tags(activity_id, tag_id, created_at)`. Its composite primary key supports activity-to-tag lookup; a `(tag_id, activity_id)` index supports reverse filtering. Activity deletion cascades to its assignment rows. Tag deletion is restricted while referenced and never cascades to activities.

Activity filtering uses a single comma-separated query parameter:

```text
/api/v1/activities?tagIds=<uuid>,<uuid>&tagMatch=all
```

`tagMatch=any` is the default when IDs are supplied; `all` requires every requested tag. `tagMatch` without IDs, empty lists, malformed/duplicate IDs and repeated parameters are rejected. Filters accept up to 100 IDs and can include archived tags. Unknown IDs return `404 TAG_NOT_FOUND`. All existing date, kind, variant, search, partial-status, ordering and offset-pagination behaviour remains available.

`any` uses a correlated `EXISTS`; `all` compares the matching unique-assignment count with the requested ID count. Neither joins tag rows into the paginated activity result, so each activity appears once. Responses retain load-more metadata without total counts. Tags and measurements are batch-loaded: three SELECTs per nonempty activity page, or four with the batched tag-existence check, independent of page size.

Errors retain the existing request-ID envelope: `TAG_INVALID`, `ACTIVITY_TAG_INVALID` and `ACTIVITY_TAG_DUPLICATE` use `400`; `TAG_NOT_FOUND` uses `404`; name conflicts (`TAG_NAME_CONFLICT`) and new archived assignments (`TAG_ARCHIVED`) use `409`. Malformed activity query parameters retain `400 ACTIVITY_INVALID`.

## Dedicated database tests

Provision an isolated disposable test database with a dedicated non-superuser role. Never use the development/production database or its role:

```sql
CREATE ROLE activus_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password activus_test
CREATE DATABASE activus_test OWNER activus_test;
```

Set `TEST_DATABASE_URL=postgresql://activus_test:YOUR_PASSWORD@localhost:5432/activus_test` in the root `.env` or process environment, then run `pnpm test:db`. The normal `DATABASE_URL` remains separate. URI-encode any special characters in passwords.

Guards require a database named `activus_test` or `activus_test_...`, the role `activus_test`, no URL query overrides, non-production `NODE_ENV`, and a database name different from `DATABASE_URL` even when hostnames differ. The suite verifies the actual database/role and refuses superuser, database-creator or role-creator connections before migrating. It applies committed migrations only to this test database and removes only UUIDs it inserted; it never drops or truncates a database/schema/table. Without `TEST_DATABASE_URL`, the database suite reports explicit skips. An unsafe URL or a configured but unreachable database fails rather than silently skipping.

## Tag management client (phase 3C)

Open **Settings → Tags** to reach `/tags`. Tags add optional context across activity kinds; variants remain the place for structured forms such as Outdoor or Treadmill. The six primary navigation labels remain unchanged, with Settings selected on the Tags route.

Create and edit a name plus optional colour. The name limit and trimming come from shared contracts. The form offers six approved palette colours and **No colour**, with native keyboard-operable radio choices and a text selection indicator. Existing API-provided custom colours can be retained or cleared, but no unrestricted picker is introduced. Swatches carry colour while text uses theme tokens. No icons, categories, descriptions, ordering or activity counts are added.

Search uses a 300 ms debounce and the existing case-insensitive tag API. `search` and `archived=true` stay in the URL for refresh and back/forward navigation; query updates retain search focus. Superseded requests are cancelled and cannot overwrite newer results. The last loaded list remains during a background request or recoverable read error. Search stays visible even for small lists to keep filters stable. Only an empty unfiltered active list performs one additional include-archived read to distinguish first use from an entirely archived collection. There are no per-tag requests for counts.

Archive/restore use confirmation dialogs and preserve historical associations. Names remain reserved across archived tags under the existing backend policy; conflicts preserve entered data and show request IDs. PATCH sends changed fields only, including explicit `color: null` when clearing colour. Duplicate submissions are blocked and mutations never retry automatically. Dialogs retain the existing focus trap, Escape, dirty-discard warning and focus-restoration conventions. A removed row returns focus to the page heading.

`pnpm test` covers the typed client and tag components. `pnpm test:browser` adds tag creation/editing, archive/restore, search/history and error-state journeys to the existing configuration suite. Browser data uses the same isolated HTTP fixtures as phases 3A/B, never the development database. The retained `.artifacts/phase-3a/` directory also contains `tags-*` screenshots for this phase. See `.doc/phase-3c-tag-management-report.md` for results and implementation details.

## Deferred after phase 3C

Bulk reordering remains deferred: phase 2A did not establish a complete-list reorder pattern. Ordinary `sortOrder` edits remain available. Explicit inherited-definition overrides/hiding are deferred until their semantics are designed. Optional development seeds remain deferred; migrations contain no opinionated kinds.

Tag assignment and activity-entry UI belong to phase 3D. The activity journal, goals (including tag-scoped goals), progress and personal-best calculations, tag analytics/grouping, authentication and legacy import remain deferred. Per-tag activity counts, deployment, Docker and chart selection remain deferred. No Git repository or Git configuration is initialized or changed.
