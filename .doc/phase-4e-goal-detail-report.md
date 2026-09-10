# Phase 4E — Goal detail and follow-up

Implemented `/goals/:id`. Overview goal names link to detail while edit and lifecycle controls remain independent. Detail shows the description, lifecycle, exact formatted progress, remaining value or reached result, full definition, archived references, recurring history, and qualifying activities.

## Implementation

- `apps/web/src/features/goals/detail.ts`: section-level loading/retry state, period selection, activity pagination, lifecycle actions, and responsive presentation.
- `presentation.ts`: shared archive confirmation, value formatting, and restrained accessible progress bar. Existing overview and journal styles are reused.
- `page.ts`, `state.ts`, `create-page.ts`, and `app-shell.ts`: detail entry point, validated return paths, URL period state, edit-save return, and active Goals navigation.
- Journal `state.ts` and `detail.ts`: return from a qualifying activity to its goal and selected period.
- `configuration-api.ts` and shared `goals.ts` contracts: typed detail, period-window, and contribution responses.
- API goal `qualification.ts`, `progress-repository.ts`, `progress-service.ts`, and `routes.ts`: shared goal matching, detail projection, bounded period windows, and PostgreSQL activity pagination. Journal measurement hydration is reused from the activity repository.

## Semantics and bounds

Fixed values retain over-target amounts; achievement comes from the backend, independently of lifecycle. Recurring progress emphasizes the current clipped calendar period and completed-period counts. History defaults to the latest goal periods, with 12 rows per page (maximum 50) and a `nextBefore` window. Current, latest-ended, or first-upcoming contribution selection is supplied by the server. Explicit selection uses the effective period start in the URL and resets activity pagination.

Contributions are qualifying activities, including missing target measurements. Missing contribution is null and appears as “No recorded contribution”; recorded zero remains numeric. The single qualification predicate is shared by all progress and contribution reads, preserving kind, optional variant, inclusive dates, and match-all tags. Activity pages default to 25 (maximum 100), use stable reverse ordering with an ID tie-breaker, and hydrate measurements/tags in batches. Period aggregation is restricted to its requested date window.

Partial failures retain readable goal information and previously loaded rows. Changing periods aborts stale requests. Archive and restore use existing endpoints and shared confirmation wording/focus trapping. A failed restore keeps archived data visible. Detail-originated edits reload all sections after saving. No schema migration, deployment, chart library, or cumulative history chart was added.

## Verification completed

- 56 frontend tests passed across detail, overview, goal forms, journal, shell, and typed client.
- Existing focused API projection test passed.
- Two focused real PostgreSQL tests passed: overview regression and contribution qualification/pagination. They verify exact measurement contribution, missing versus zero, tag de-duplication, kind/variant/date exclusions, clipped periods, invalid period validation, archived history, and canonical progress consistency. The other 20 activity integration tests were intentionally not run.
- Workspace TypeScript checking and production build passed.
- ESLint, changed-file Prettier checks, and `git diff --check` passed.
- Practical headless Chrome pass with mocked typed API responses: desktop light at 1440×1100 and narrow mobile dark at 390×844. Checked fixed and recurring goals, historical selection/back navigation, period/activity Load more, empty periods, archived references, unavailable progress, contribution error/retry, and edit-save return. No page errors or horizontal overflow. Desktop and mobile screenshots were visually inspected. Local screenshots are under `.artifacts/goal-detail/`; no screenshot test suite was committed.

## Preserve in Phase 4F

Keep lifecycle separate from achievement; reuse the shared qualification predicate and exact backend calculator; preserve clipped period identities, bounded query/response sizes, missing-versus-zero semantics, archived references, URL return context, and independent retry/stale-response handling. Phase 4F has not been started.
