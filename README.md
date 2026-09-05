# Activus

Activus training journal, through phase 2A: the phase 1 web shell plus PostgreSQL persistence and REST endpoints for activity kinds. Design and architecture are defined in `.doc/visual-design.md` and `.doc/technical-architecture.md`.

## Setup

Use Node.js 22.13+ (22.x), 24+, or a newer supported even release and pnpm 10.34.5. Dependencies are pinned exactly and recorded in `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

If pnpm is unavailable, prefix commands with `npx --yes pnpm@10.34.5` instead of `pnpm`; no global installation is necessary.

Before migrating or starting the API, copy `.env.example` to `.env` at the repository root and set `DATABASE_URL` to your development PostgreSQL database. Existing process environment variables take precedence. Never commit credentials. `DATABASE_URL` is required for real server startup and migrations; app-only tests need no database. `WEB_ORIGIN` must be an HTTP(S) origin without a path or trailing slash.

Open <http://localhost:5173>. Vite proxies `/api` to the API on port 3000 (or `PORT` from the root environment). The API exposes `GET /api/health`, returning `{"status":"ok"}`. This is process health, not database readiness. `WEB_ORIGIN` controls API CORS; Vite uses a fixed port with strict port checking.

`pnpm dev` builds contracts first, then watches contracts, API, and web together. Ctrl+C stops the process group; an exited child stops its siblings. The API verifies database connectivity before listening, handles SIGINT/SIGTERM, stops accepting requests, and closes its pool after requests finish. Shutdown has a 15-second deadline; database statements have a 10-second timeout. Startup never applies migrations or seeds data.

## Commands

| Command                            | Purpose                                                       |
| ---------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                         | Start all development watchers                                |
| `pnpm build`                       | Build contracts, Node API, and static web assets              |
| `pnpm typecheck`                   | Check all source, tests, and Vite configuration               |
| `pnpm test`                        | Run API and client Vitest tests                               |
| `pnpm lint`                        | Run ESLint with zero warnings allowed                         |
| `pnpm format`                      | Format project files                                          |
| `pnpm format:check`                | Check formatting                                              |
| `pnpm --filter @activus/api start` | Run the compiled API after building                           |
| `pnpm db:generate`                 | Generate SQL and snapshots from the Drizzle schema, offline   |
| `pnpm db:check`                    | Check Drizzle migration history consistency, offline          |
| `pnpm db:migrate`                  | Apply committed migrations using validated `DATABASE_URL`     |
| `pnpm test:db`                     | Run real PostgreSQL tests against guarded `TEST_DATABASE_URL` |

`pnpm test` runs unit, direct Hono API, and client tests without a database or TCP listener. `pnpm test:db` is separate and uses real PostgreSQL, never SQLite or a test double. Client tests use jsdom. Manrope is bundled from a local dependency, with system fallbacks and no font CDN requests.

## Structure and boundaries

```text
apps/api/src/
  config/env.ts       Zod environment validation
  config/load-env.ts  Explicit root environment loading
  db/                Drizzle schema, pool lifecycle, migration command
  modules/activity-kinds/
                     Schemas, routes, service, repository, mapper, unit/API tests
  app.ts              Hono construction, health, logging, errors
  server.ts           Environment loading, startup, shutdown
apps/api/test/        Foundation tests, test support, guarded PostgreSQL tests
apps/api/drizzle.config.ts
                     Offline migration generation configuration
apps/web/
  public/icons/       Approved pulse-shield SVG
  src/app-shell.ts    Responsive navigation and placeholder content
  src/styles/        Approved tokens and local font foundation
  test/              Shell navigation and keyboard focus tests
packages/contracts/  Health, activity-kind and error transport schemas/types
scripts/import/      Reserved for the future JSON importer
drizzle/             Generated SQL migrations and snapshots
```

Build output lives in each package's `dist/`. Contracts export compiled JavaScript and TypeScript declarations; they contain only environment-independent transport schemas. The default export condition also lets Drizzle Kit load the same ESM module through Node's supported `require(esm)` bridge. API logs use generated request IDs and omit request bodies, query strings, credentials, and arbitrary exception messages. Error responses use stable codes and request IDs; internal details remain private in every environment.

The web shell follows the six approved navigation labels. Destinations currently render placeholder content only. A mobile navigation disclosure uses native keyboard behavior. Both themes follow `prefers-color-scheme`; motion respects `prefers-reduced-motion`.

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

Creation requires `name`, `iconName`, `color`, and `sortOrder`. PATCH accepts only those fields, requires at least one, and cannot archive/restore. Unknown fields, invalid or repeated query parameters, invalid UUIDs, malformed JSON, and invalid values return `400` with `ACTIVITY_KIND_INVALID`. JSON bodies must use `Content-Type: application/json`. Missing resources return `404` / `ACTIVITY_KIND_NOT_FOUND`; reserved names return `409` / `ACTIVITY_KIND_NAME_CONFLICT`. Errors preserve `{ "error": { "code", "message", "requestId" } }` and the matching `X-Request-Id` header. This phase consistently uses `400` for input validation rather than introducing a separate `422` convention.

Names are trimmed, nonempty and limited to 120 characters. **Stored names are reserved case-insensitively across both active and archived rows.** Restore the existing kind instead of creating a new identity with its archived name. A global unique index on `lower(name)` protects creation, rename, and restore under concurrency. This is deliberately stronger than active-only uniqueness: a conflicting archived row cannot normally exist. Renaming an existing row is supported; its former name is no longer reserved. Archival alone never frees a name.

Archive and restore are idempotent: requesting the current state returns the current record with unchanged timestamps. A real state transition updates `updatedAt`; repeated calls preserve `archivedAt` too. Archived rows remain readable and editable. There is no DELETE endpoint.

Supported Lucide identifiers are `activity`, `footprints`, `bike`, `waves`, `dumbbell`, and `person-standing`. The catalogue is explicit in contracts and enforced by a database check; adding an icon requires updating the catalogue and generating a migration. SVG markup is rejected. Colours must be six-digit hex (`#RRGGBB`) and are normalized to uppercase. Sort order is an integer from 0 through 2147483647; duplicates and gaps are allowed. Lists order by sort order, name using PostgreSQL `C` collation, then UUID, backed by full-list and active-only indexes.

The table uses PostgreSQL-generated UUIDs (`gen_random_uuid()`), snake_case columns, and `timestamptz` creation/update/archive instants. The driver session uses UTC and responses serialize instants as UTC ISO 8601 strings. Database checks protect names, supported icons, canonical colours and non-negative sort order. `updated_at` is maintained by repository mutations, not a generic trigger. No measurement-definition foreign key is added.

## Dedicated database tests

Provision an isolated disposable test database with a dedicated non-superuser role. Never use the development/production database or its role:

```sql
CREATE ROLE activus_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password activus_test
CREATE DATABASE activus_test OWNER activus_test;
```

Set `TEST_DATABASE_URL=postgresql://activus_test:YOUR_PASSWORD@localhost:5432/activus_test` in the root `.env` or process environment, then run `pnpm test:db`. The normal `DATABASE_URL` remains separate. URI-encode any special characters in passwords.

Guards require a database named `activus_test` or `activus_test_...`, the role `activus_test`, no URL query overrides, non-production `NODE_ENV`, and a database name different from `DATABASE_URL` even when hostnames differ. The suite verifies the actual database/role and refuses superuser, database-creator or role-creator connections before migrating. It applies committed migrations only to this test database and removes only UUIDs it inserted; it never drops or truncates a database/schema/table. Without `TEST_DATABASE_URL`, the database suite reports explicit skips. An unsafe URL or a configured but unreachable database fails rather than silently skipping.

## Deferred after phase 2A

Bulk reordering is deferred to phase 2B: a complete active-set reorder must coordinate concurrent creates and archive/restore operations atomically. This phase exposes ordinary `sortOrder` edits, not an unsafe partial reorder endpoint. Optional development seeds are also deferred; migrations contain no opinionated kinds.

Activity variants, measurement definitions, activities, goals, progress queries, tags, authentication, legacy import, and activity-kind management UI are not implemented. Deployment, Docker and chart selection remain deferred. No Git repository or Git configuration is initialized or changed.
