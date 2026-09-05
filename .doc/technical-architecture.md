# Activus Technical Architecture

Status: Initial architecture for the clean rebuild  
Last updated: 2026-09-05

## Goals

- Build a maintainable TypeScript application for recording and exploring personal training history.
- Keep the REST API and web client independently testable.
- Use PostgreSQL for reliable aggregation, filtering, and long-term reporting.
- Preserve a clean domain model rather than reproducing the legacy MongoDB structure.
- Import legacy data later through a standalone, repeatable JSON import process.
- Deploy cleanly as a Node.js service on DreamQuest.

## Chosen stack

| Area | Choice |
| --- | --- |
| Runtime | Node.js 22 or newer |
| Language | TypeScript with strict mode |
| API | Hono REST API |
| Client | Lit with Vite |
| Database | PostgreSQL |
| ORM and migrations | Drizzle ORM and Drizzle Kit |
| Validation | Zod at API and import boundaries |
| Logging | Pino structured logging |
| Unit and integration tests | Vitest |
| Browser tests | Playwright, added for critical workflows |
| Package management | pnpm workspace |

Pin exact versions when the project is scaffolded. Do not copy version numbers from this planning document.

## Repository structure

```text
activus/
├── .doc/
│   ├── visual-design.md
│   ├── technical-architecture.md
│   ├── activus-style-board.svg
│   └── activus-app-icon.svg
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   ├── middleware/
│   │   │   ├── modules/
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   └── test/
│   └── web/
│       ├── public/
│       │   └── icons/
│       ├── src/
│       │   ├── components/
│       │   ├── features/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── styles/
│       │   └── app-shell.ts
│       └── test/
├── packages/
│   └── contracts/
│       └── src/
├── scripts/
│   └── import/
├── drizzle/
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Keep modules organized by product capability rather than by generic technical layer alone. For example, an `activities` module owns its routes, service, repository, schemas, and tests.

## Runtime boundaries

### API

The API owns:

- Input validation
- Domain rules
- Database access and transactions
- Aggregation and progress calculations
- Import validation and persistence
- Structured logging and error translation

Keep `app.ts` responsible for constructing and configuring the Hono application. Keep `server.ts` limited to loading validated configuration and starting the Node server. This separation makes API tests independent of a listening TCP port.

### Web client

The Lit client owns:

- Routing and navigation state
- Forms and immediate presentation validation
- Accessible interaction behaviour
- Theme selection and design tokens
- Charts and tables using API-provided data
- Request state, optimistic updates where safe, and error presentation

The client must not reproduce goal or aggregation rules. It displays results returned by the API.

### Shared contracts

`packages/contracts` contains transport schemas and their inferred TypeScript types. It must not contain database entities, Lit components, server services, or environment-specific code.

Share stable request and response contracts, not the entire server domain model.

## API conventions

- Prefix application endpoints with `/api/v1`.
- Use plural resource names.
- Use JSON request and response bodies.
- Use ISO 8601 calendar dates (`YYYY-MM-DD`) for date-only domain values.
- Use ISO 8601 timestamps in UTC for instants.
- Return measurement values in canonical units together with unit metadata needed for display.
- Represent list filtering, ordering, and pagination explicitly in query parameters.
- Give every error a stable machine-readable code and a concise human-readable message.

Initial resource groups:

```text
/api/v1/activity-kinds
/api/v1/activity-variants
/api/v1/activities
/api/v1/goals
/api/v1/progress
/api/v1/tags
/api/v1/settings
/api/health
```

Do not force every analytical query into generic CRUD. Purpose-specific progress endpoints are appropriate when they express stable domain questions.

## Initial data model

### Main tables

| Table | Responsibility |
| --- | --- |
| `activity_kinds` | What activity was performed |
| `activity_variants` | Structured form or environment within a kind |
| `measurement_definitions` | Typed measurements configured for a kind or variant |
| `activities` | Common activity record fields |
| `activity_measurements` | Typed values linked to an activity and definition |
| `tags` | Optional cross-cutting labels |
| `activity_tags` | Many-to-many activity/tag relationship |
| `goals` | User-defined targets and fixed periods |
| `app_settings` | Application-wide preferences that belong in storage |

### Activity kinds

Store stable identifiers rather than deriving identity from display names.

Suggested fields:

```text
id
name
icon_name
color
sort_order
primary_measurement_definition_id nullable
archived_at nullable
created_at
updated_at
```

Prevent deletion while referenced by activities, variants, definitions, or goals. Archive instead.

### Activity variants

Variants belong to exactly one activity kind.

```text
id
activity_kind_id
name
sort_order
is_default
archived_at nullable
created_at
updated_at
```

An activity may have zero or one variant, and the selected variant must belong to its activity kind.

### Activities

```text
id
activity_kind_id
activity_variant_id nullable
activity_date
started_at nullable
duration_seconds nullable
name nullable
notes nullable
effort nullable
feeling nullable
source nullable
source_external_id nullable
created_at
updated_at
```

Use a date-only column for the journal date. Keep optional start time separate so activities do not require invented precision.

`source` and `source_external_id` support idempotent imports. Apply a unique constraint to the pair when both values are present.

### Measurement definitions

```text
id
activity_kind_id
activity_variant_id nullable
name
value_type
canonical_unit
display_unit
precision
is_required
minimum_value nullable
maximum_value nullable
aggregation
personal_best_direction
sort_order
archived_at nullable
created_at
updated_at
```

A null variant means the definition belongs to the parent kind. Variant-specific definitions should be exceptional.

### Activity measurements

Values reference the definition identity rather than its name. Use typed nullable columns with a database constraint requiring exactly the column appropriate for the definition's value type.

Possible value columns:

```text
numeric_value nullable
integer_value nullable
boolean_value nullable
text_value nullable
```

Duration values use canonical integer seconds. Avoid formatted values and avoid using JSONB as the only measurement store because reporting and goal calculations depend on typed, indexable values.

### Goals

```text
id
name
goal_type
activity_kind_id nullable
activity_variant_id nullable
measurement_definition_id nullable
target_value
comparison
start_date
end_date
archived_at nullable
created_at
updated_at
```

Calculate status and progress from activities. Do not store mutable progress totals. Validate that the selected measurement belongs to the goal scope.

## Database rules

- Generate schema changes through Drizzle migrations committed to version control.
- Never run schema push commands against production as the deployment mechanism.
- Use transactions for operations that modify definitions and related ordering or values.
- Enforce important invariants in both application validation and database constraints.
- Index activity date, kind, variant, measurement-definition references, goal periods, and import source identity.
- Use soft archival only where historical references require it; do not apply soft deletion indiscriminately.
- Keep persisted dates and instants semantically distinct.

## Reporting strategy

Begin with direct SQL aggregations expressed through Drizzle. Add purpose-specific query functions for:

- Period totals and counts
- Grouped trends
- Equivalent-period comparisons
- Variant comparisons
- Personal bests
- Goal progress

Do not introduce cached aggregate tables until real data volume or measured query performance justifies them. If caching is later needed, treat activity data as the source of truth and make derived data rebuildable.

## Client architecture

### Routing

Recommended top-level routes:

```text
/
/activities
/activities/:id
/goals
/goals/:id
/progress/trends
/progress/compare
/progress/personal-bests
/activity-kinds
/settings
```

Store Progress filters in URL query parameters. Activity-entry state belongs in the dialog or panel unless deep-linking the creation form proves useful.

### State

Prefer local component state and small feature-level controllers. Add a global state library only if concrete cross-route needs emerge. Server state should be fetched through a typed API service rather than copied into an application-wide mutable store by default.

### Styling

- Implement the approved tokens in `apps/web/src/styles/tokens.css`.
- Use CSS custom properties for theme switching.
- Keep component styles inside Lit components where appropriate and global foundations in shared style modules.
- Load Manrope locally or through an explicitly chosen font delivery method.
- Use Lucide icons through a controlled wrapper so size, stroke width, labels, and accessibility remain consistent.

### Charts

Select a chart library only after testing it against the required chart types, Lit integration, responsive behaviour, keyboard and screen-reader support, theming, and bundle size. Do not make a library decision solely from popularity.

Charts require an adjacent textual summary and data-table representation for meaningful values.

## Validation and errors

- Parse and validate environment variables once during startup.
- Validate all external input at API boundaries.
- Keep domain validation inside services where it cannot be bypassed by another endpoint or importer.
- Return stable error codes such as `ACTIVITY_KIND_ARCHIVED` or `MEASUREMENT_VALUE_INVALID`.
- Do not expose stack traces or database details through production responses.
- Attach a request ID to logs and error responses.

## Logging

Use Pino JSON logs with:

- Request ID
- Method and route
- Response status and duration
- Authenticated subject if authentication is later introduced
- Stable error code
- Import run identifier for importer logs

Do not log activity notes, raw import records, database credentials, or other private values by default.

## Testing strategy

### Unit tests

- Canonical unit conversion
- Goal progress calculations
- Aggregation and comparison logic
- Definition compatibility rules
- Date-period handling

### API integration tests

- Resource validation and lifecycle
- Archival protection
- Kind/variant consistency
- Transaction behaviour
- Progress queries against a test PostgreSQL database
- Idempotent imports

### Client tests

- Form behaviour and validation
- Kind-dependent variant and measurement fields
- Theme tokens and accessible states
- Progress filter URL state
- Empty, loading, and error states

### Browser tests

Add a small Playwright suite around the critical journeys:

1. Record an activity
2. Edit an activity without losing measurements
3. Create a goal and see its calculated progress
4. Filter a progress view

## Configuration

Expected environment values will likely include:

```text
NODE_ENV
PORT
DATABASE_URL
LOG_LEVEL
WEB_ORIGIN
```

Define the final schema when the project is scaffolded. Keep secrets in the deployment environment file and provide a committed `.env.example` containing names and safe examples only.

## Deployment shape

The production build should produce:

- Compiled API code runnable by Node.js
- Static web assets served either by the API or through Caddy
- Versioned SQL migrations applied as an explicit deployment step

Recommended DreamQuest shape:

```text
Caddy
  -> Activus Node service
       -> Hono API
       -> Lit static assets
       -> PostgreSQL
```

Run the application as a dedicated systemd service with `NODE_ENV=production`, a validated environment file, automatic restart, and a health endpoint. The exact hostname, port, service name, and deployment paths remain deployment-time decisions.

## Legacy JSON import

Legacy MongoDB is an input source, not the new domain model.

Defer the importer until the new schema and normal CRUD workflows are stable. Then export legacy activity kinds and activities to versioned JSON and implement a standalone command under `scripts/import`.

The importer should:

1. Read without modifying the source export.
2. Validate every record against an explicit import schema.
3. Map legacy kinds and fields to new kinds, variants, and measurement definitions.
4. Support dry-run mode with counts, warnings, and rejected records.
5. Use stable legacy identifiers for idempotency.
6. Write one controlled transaction per batch rather than one transaction for the entire archive.
7. Produce a machine-readable result report.
8. Be safe to rerun without duplicating imported activities.

Keep source-specific field mappings in the importer. Do not add legacy-only columns to core tables unless they serve an ongoing product requirement.

## Initial implementation sequence

1. Scaffold workspace, shared TypeScript settings, formatting, and tests.
2. Add API configuration, health endpoint, logging, and PostgreSQL connection.
3. Implement activity kinds, variants, and measurement definitions.
4. Implement activity recording, editing, listing, and archival rules.
5. Build the Lit application shell, tokens, navigation, and activity workflow.
6. Add goals and calculated progress.
7. Add trends, comparisons, personal bests, tables, and charts.
8. Add settings and import/export UI as needed.
9. Export legacy MongoDB data and implement the JSON importer.
10. Perform production deployment and verify backup/restore procedures.

## Deferred decisions

- Authentication and multi-user support
- Chart library
- Exact pagination strategy
- Exact deployment hostname and port
- Recurring goals
- Tag-scoped goals
- Composite single-activity goals
- Aggregate caching
- Legacy field mappings

These decisions should be made when their requirements are concrete rather than guessed during initial scaffolding.
