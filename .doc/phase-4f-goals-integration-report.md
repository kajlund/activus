# Phase 4F — Goals integration and hardening

Implemented the connected goal/activity flow without adding later-phase features.

## Corrections and integration

- Added typed, bounded `GET /api/v1/goals/for-activity/:id` and the compact **Counts toward goals** activity-detail section. Matching uses the existing SQL qualification predicate: kind, optional exact variant, inclusive dates, match-all tags. Non-archived upcoming/ended goals also qualify. Recurring links select the activity's clipped calendar period. Missing measurements still follow Phase 4B scope qualification.
- Corrected PATCH creation defaults clearing omitted references/recurrence and rejecting recurring edits. Explicit nulls and empty tags still work; an empty PATCH is rejected.
- Unified injectable UTC dates across goal projections and list filtering. Archived goals cannot leak into a requested non-archived lifecycle when `includeArchived=true` is also supplied.
- Added **Refresh goal** and refreshed periods/contributions along with definition/progress. Scoped browser-document restoration reloads read-only goal/activity pages. Normal route entry and edit return already reload. No counters or progress caches were introduced.
- Corrected goal-return wording on saved activities and preserved the form after failed goal creation. Schedule edits clear the old selected-period return parameter so detail uses the new server default. Matching-goal errors/retries do not replace activity details; pagination preserves earlier matches and guards against stale responses. Native links, theme tokens, minimum-height link targets and Load more focus recovery are reused.
- Historical kind/variant/tag/measurement IDs and labels remain intact; no active same-name substitution occurs. Retained archived references can remain in edits. Restore conflicts remain specific. Units are static registry entries without an archive operation. Activities support physical deletion, not archival.

## Query review

Recorded actual PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` plans with 10,000 activities for overview, fixed progress, recurring periods, contributions and activity-to-goal matching. SELECT counts were respectively 4, 2, 4, 4 and 2. Existing kind/date, activity primary-key and unique activity/measurement indexes were used. Tag EXISTS predicates avoid row multiplication; page queries include bounds and deterministic ordering. No new index or migration was justified. Contributions now load note presence instead of note contents.

Plans are local test artifacts at `.artifacts/phase-4f/goal-query-plans.json`. These are representative local plans, not a production performance guarantee. Overview intentionally returns all goals in its lifecycle view, as established in Phase 4D; activity matches, contributions and period pages are bounded.

## Verification

- Guarded PostgreSQL suite: 83 tests passed. The combined journey verifies fixed measurement progress after creation, duration/measurement edits, kind/variant/date/tag qualification, weekly period moves, criteria edits, pagination/de-duplication, archived labels, restore conflicts, and deletion. Existing tests cover exact decimals, missing/zero measurements, archived measurement references and contributions.
- Focused contract/API regression covers partial updates and inclusive lifecycle boundaries with an injected date. Two new frontend tests cover linked matching goals/browser restoration and independent failure/retry. The existing create-return test also checks draft retention after failure.
- `pnpm test`: 360 API/unit tests and 144 frontend tests passed. `pnpm test:db`: 83 database tests passed. `pnpm typecheck`, `pnpm build`, ESLint with zero warnings, changed-source Prettier formatting, and `git diff --check` passed.

## Manual verification limits

The Browser skill was initialized, but browser discovery returned no available browsers. Consequently no live UI journey, keyboard pass, desktop-light or narrow-mobile-dark viewport inspection was performed in this phase. Existing UI logic and styles were reviewed in source and exercised by the focused frontend tests. The representative Outdoor measurement/Treadmill weekly-tag journey was executed through the real database/service/API tests, not manually through the browser.

Visual and keyboard acceptance remains to be completed when a browser is available. No screenshot suite, coaching, forecasting, reporting, reminders, import, or next-phase work was added.
