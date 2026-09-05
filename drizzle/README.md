# Database migrations

Versioned Drizzle SQL migrations and metadata for PostgreSQL. Generate with `pnpm db:generate`, inspect each SQL file, check history with `pnpm db:check`, then apply explicitly with `pnpm db:migrate`.

Phase 2A creates only `activity_kinds`. Its global `lower(name)` unique index reserves archived names too, so both concurrent writes and restore operations are protected. PostgreSQL generates UUIDs; all instant columns use `timestamp with time zone`. Checks enforce normalized nonempty names, uppercase six-digit hex colours, supported Lucide identifiers and non-negative sort order. Full and partial active indexes support deterministic list ordering.

All constraints are represented in the Drizzle schema using SQL expressions where needed; no hand-written migration amendment or destructive statement is required. No data or seeds are added by migrations. Keep SQL and `meta/` snapshots together.
