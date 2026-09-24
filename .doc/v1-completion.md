# V1 Overview and release verification

Implemented the remaining Overview scope from `activus-complete-v1-prompt.md`.

## Implementation

- Replaced the home placeholder with a responsive Overview using the Phase 6
  heading, controls, spacing and semantic theme colours.
- One local New activity action; five recent entries link to the existing
  activity detail/editor flow and show recorded duration, primary measurement,
  variant and partial status.
- Current local calendar month: activity count, recorded duration including
  seconds, missing-duration and partial-entry counts, and configured kind
  breakdown. Month/kind links open the Journal with matching date filters.
- Reads every Journal API page before publishing month totals. A failed page
  produces an error, never a partial total. Recorded zero and absent duration
  remain distinct. Archived kinds remain represented by their recorded entries.
- Up to five active goals show existing server-calculated progress, units,
  recurrence and achieved state, with links to goal details and all goals.
  Missing progress explicitly says unavailable.
- Independent loading/error/empty states, retry, request IDs, cancelled stale
  reads, route-entry refresh and back/forward-cache restoration.

No API, database schema or domain calculation changes were required. Monthly
totals use the existing paginated activity query; goal calculations remain on
the existing goal service. No release blocker was found in the exercised scope.

## Scope assumptions that did not match the repository

The brief assumes existing personal records and export. Neither has an
implementation in this checkout. Overview therefore has a small honest
personal-records unavailable state; it does not invent record rules or totals.
The Progress route remains its existing placeholder. Primary measurements are
shown per recent activity, not aggregated across incompatible definitions.

There is no export or web import flow to exercise. Existing legacy import tests
are included in the API suite; no live import or mutation of user data was run.
Legacy import remains deferred as requested. No deployment, server change,
release tag or publication was performed.

## Verification

- `npm test`: 372 API and 166 web tests passed (538 total). Four new focused
  tests cover calendar boundaries, multi-page totals, failed later pages, and
  independent errors/retry with unavailable goal progress.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- `npm run format:check`: four pre-existing warnings only, in `package.json`
  and `drizzle/meta/{_journal,0006_snapshot,0007_snapshot}.json`.
- Changed-file Prettier checks and `git diff --check`: passed.
- `npm run test:browser -- final-polish.spec.ts hardening.spec.ts
  redesign.spec.ts goals.spec.ts --output=../../.artifacts/v1-release`:
  58 passed, 2 intentionally redundant viewport cases skipped, exit 0 (2 minutes).
  Runs desktop/mobile in both themes; the route matrix additionally checks
  1920, 1440, 768, 390 and 320 pixels. Covers configuration, seconds and
  measurements, Journal expansion/editing, goals, Overview totals after an
  actual UI edit, filtered month links, browser history, keyboard interaction,
  axe accessibility and theme persistence through reload.
- Inspected generated Overview screenshots at desktop and mobile sizes in
  light/dark themes. Evidence is in `.artifacts/v1-release` (ignored by Git).

The browser fixtures are isolated from user data. Goal browser responses use
the existing fixed/recurring fixtures; actual calculation behavior is covered
by the API tests. Monthly reads reuse offset pagination, so simultaneous edits
in another client are not a cross-request snapshot; reopening Overview reads
fresh data. No new aggregation endpoint was introduced for this personal-use
summary.
