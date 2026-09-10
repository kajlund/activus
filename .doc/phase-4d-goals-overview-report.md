# Phase 4D — Goals overview

Implemented `/goals` as the destination for the existing primary Goals navigation. A compact list presents scope, kind/variant icons and labels, required tags, schedule, dates, lifecycle, progress, and edit/archive/restore controls. URL-backed Active, Upcoming, Ended, and Archived controls retain browser history and refresh state.

Fixed goals use one current/target line, a slim capped bar, and a neutral Reached label. Values exceeding the target remain visible. Recurring goals emphasize the current calendar period, with separate completed-period facts; upcoming and ended goals have no cumulative bar. Loading, first use, empty lifecycle, read error/retry, valid zero, and unavailable progress are distinct.

## Changed files

- `apps/web/src/features/goals/page.ts` and `state.ts`: overview, lifecycle URL state, confirmation/focus handling, and responsive styles.
- `apps/web/src/app-shell.ts`: canonical overview route.
- `apps/web/src/features/goals/create-page.ts`: saved goals return to their server-derived lifecycle; cancel retains the originating view.
- `apps/web/src/services/configuration-api.ts`: typed overview/archive/restore calls and restore conflict messages.
- `packages/contracts/src/goals.ts`: compact overview schemas and archived query support.
- `apps/api/src/modules/goals/{routes,repository,progress-repository,progress-service}.ts`: selected lifecycle loading, reference projection, and batched daily aggregates using the existing calculator. A nonempty overview uses four database queries and one HTTP request, without recurring history in its response.
- `apps/api/src/modules/goals/{mapper,service}.ts`: remove database-only fields before strict validation, normalize retained numeric targets for edits, and preserve restore conflict explanations. Existing async goal routes now await service results before serialization.
- Focused tests in `apps/web/test/goals.test.ts`, `goal-edit.test.ts`, `apps/api/test/goals-overview-api.test.ts`, and the existing PostgreSQL activity integration suite.

## Verification

- 26 focused frontend tests passed across overview, goal forms, shell, and typed client.
- One focused API projection test passed, including unavailable aggregates and recurring goals beyond 520 periods.
- One real PostgreSQL integration test passed against the guarded test database. It covers tag de-duplication, fixed/recurring summaries, lifecycle selection, edit, archive, and restore. The other 20 activity tests were intentionally not run in this focused invocation.
- Workspace TypeScript checking and production build passed.
- ESLint, changed-file Prettier checks, and `git diff --check` passed.
- A practical local headless Chrome pass used mocked typed API responses at 1440×1100/light and 390×844/dark. Checked fixed and recurring progress, upcoming/ended/archived views, archive confirmation and keyboard focus wrapping, restore, empty and unavailable states, edit-save return, and create-save return to Upcoming. No page errors or horizontal overflow. Screenshots were visually inspected; local artifacts are under `.artifacts/goals/` and no screenshot suite was committed. The connected-browser runtime had no available browser.

## Phase 4E continuity

Preserve the shared compact overview contract, exact backend progress and unit conversion, independent lifecycle/achievement, clipped recurring periods, match-all tag scope, safe archive/restore, and URL return context. Individual detail, period history, contributing activities, and charts remain deferred. No schema migration or production deployment was needed.
