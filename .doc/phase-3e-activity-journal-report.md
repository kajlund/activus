# Phase 3E: Activity journal

Completed 8 September 2026. Scope is the activity journal and its integration with the existing Phase 3D editor.

## Routes and files

The approved six navigation labels are retained: **Activities** opens the page titled **Journal**. The prompt's conceptual preference for a Journal navigation label does not override the visual-design document.

- /activities: reverse-chronological journal, date groups, filters and Load more.
- /activities/:id: addressable reading view, including historical references.
- /activities/new and /activities/:id/edit: existing editor, with contextual return destinations.

New files under apps/web/src/features/journal:

| File             | Responsibility                                                         |
| ---------------- | ---------------------------------------------------------------------- |
| page.ts          | Journal reads, date groups, summaries, active chips and pagination     |
| filters.ts       | Applied filter drafts, calendar presets, kind/variant and tag controls |
| state.ts         | Validated URL filters and local return destinations                    |
| detail.ts        | Full activity reading view and edit/delete actions                     |
| delete-dialog.ts | Shared permanent-delete confirmation and mutation state                |
| format.ts        | Locale dates, times, duration and exact measurement formatting         |
| presentation.ts  | Historical reference labels, tags and safe read errors                 |
| styles.ts        | Responsive journal styling using approved existing tokens              |

Changed apps/web/src/app-shell.ts, features/activities/page.ts and services/configuration-api.ts for routing, return/save flows, typed activity listing and DELETE/204 handling. Added test/journal.test.ts, test/support/journal.ts and e2e/journal.spec.ts. Updated e2e/activity-entry.spec.ts to expect the completed detail destination after saves. README documents the completed flows.

## Existing API and data semantics

The list response already supplies kind/icon, variant, tags, duration, note presence and configured primary measurement. Rows use that primary measurement; no arbitrary first-two fallback is needed. They omit absent optional facts and preserve real zero values. Detail renders every stored measurement in server order. Notes remain plain text; no HTML interpretation occurs.

Dates are the recorded YYYY-MM-DD calendar dates and never shifted through UTC. Date headings use localized unambiguous dates. Optional timestamps display in the browser timezone with a timezone indicator. This week is Monday through Sunday, including weeks crossing month/year boundaries. Numeric display uses the API's display strings and unit metadata, preserving precision without converting large decimals through floating point. Values and units stay together where practical; full unit labels are accessible.

Archived kinds, variants, measurements and assigned tags remain visible and identified. Filter reference reads include archived records for historical retrieval; this does not change the editor's active-only new-assignment rules.

No backend, contract, database schema, migration or index change was required. The existing repository applies parameterized filters before offset pagination, orders by activity date descending, start descending with nulls last, creation descending and UUID descending, then batch-loads associations. Tag matching avoids joins that duplicate activities. Existing activities_journal_idx, activities_kind_date_idx, activities_variant_date_idx and activity_tags_tag_activity_idx support the relevant access paths. The client makes no per-row detail requests or total-count requests.

## Filters and URL state

Inclusive date bounds, one activity kind, one variant constrained by that kind and multiple tags use the existing server contract. Match any is the established default; Match all is explicitly selectable. Full calendar-year Walking + Treadmill + all selected tags is covered by browser tests.

Filters are applied explicitly rather than requesting on each intermediate edit. Cancel or Escape discards unapplied draft changes when reopened. Reset changes the draft; Apply commits it. URL state contains dateFrom, dateTo, activityKindId, activityVariantId, tagIds and tagMatch as applicable. Shared validation rejects malformed values; unsupported/repeated filters and inconsistent ranges are ignored with a notice. Applying controls writes a canonical link. Refresh and browser back/forward preserve meaningful filters. Human-readable chips support individual removal and Clear all. No notes-search control is introduced because there is no established indexed full-text capability.

## Pagination, errors and accessibility

The existing offset contract is used with 25 entries per request, deterministic server order, duplicate-request guards and ID deduplication. Filter changes reset pagination and abort/disregard superseded reads. Loaded rows remain visible during refresh and on recoverable errors, with clear stale-result wording; a failed filter refresh cannot append an incompatible later page. Later-page errors preserve rows and provide an explicit retry. The shown count describes loaded rows only.

Semantic date headings, lists, independent row links and native Actions disclosures preserve keyboard semantics. Native filter/delete dialogs use the existing shadow-root focus trap, Escape handling and opener restoration. Filter expanded state and explicit select names are exposed. Load more retains focus after success/failure; deletion restores journal heading focus. Controls follow existing touch-target, theme and reduced-motion tokens.

## Create, edit and delete

Creating opens the existing editor and then the saved detail, even when an older activity does not match current journal filters. Editing from a row returns to the filtered journal and refreshes summaries; editing from detail returns to refreshed detail and retains its journal context. Cancel follows the same sanitized local context. External return destinations are rejected.

The existing DELETE endpoint is permanent. Confirmation identifies the kind, precise date and optional name, and explains removal of the activity, measurements and tag assignments. It defaults focus to Keep activity. Duplicate mutations and automatic retries are prevented. Failures retain the activity and expose a safe message/request ID. Only successful deletion reconciles the list; detail deletion navigates back to the filtered journal. The pending-mutation navigation guard is cleared before completion navigation.

## Verification

- pnpm test: 356 API tests and 118 web tests passed (including 25 journal component/integration tests).
- pnpm test:browser: 96 browser cases passed across all four viewport/theme projects, including all prior configuration and entry journeys.
- pnpm --filter @activus/web exec playwright test e2e/journal.spec.ts: all 32 cases passed again with the final expanded multi-measurement and sparse-record visual fixtures.
- pnpm typecheck and pnpm build passed for all workspace packages.
- ESLint ran with --max-warnings 0 and passed.
- Prettier --check . and git diff --check passed. The phase report was separately formatted because .doc is excluded from the root formatting command.

Commands use npx --yes pnpm@10.34.5 where pnpm is not installed globally. Existing dependencies were sufficient; no package or lockfile changes were needed. Browser output includes the existing environment-level NO_COLOR/FORCE_COLOR warning, unrelated to application code.

Tests exercise real Hono routes and domain services through isolated repository doubles. Browser HTTP requests are intercepted by those fixtures and never reach the development database. No live PostgreSQL test rerun or migration was needed for this frontend-only change; this report does not claim new live-database verification.

Visual verification uses installed Chrome at 1440 ? 1000 and 390 ? 844, in light and dark themes. Screenshots are retained under .artifacts/phase-3a/journal-* for compatibility with the existing runner. Review covers populated and sparse histories, long names, archived references, measurements/tags/notes, detail, filters and chips, empty/no-results/errors, later-page retry and delete confirmation. Keyboard journeys cover filter validation, Escape, focus restoration, row/detail navigation and mutation failures. Screenshot review corrected excess whitespace in detail values; regression checks corrected filter draft reset and cross-month week presets.

## Handoff and intentional limits

Offset pagination has the existing concurrent-insertion/deletion boundary limitation; client ID deduplication prevents repeated rows but cannot turn offsets into a stable snapshot. Refreshing or returning to the journal reads the first matching page: loaded-page depth and scroll position are not encoded in the URL. No new cursor or caching contract is introduced.

The editor retains the existing API concurrency semantics; there is no revision/ETag contract. The journal does not introduce analytics, goals, coaching, charts, year comparisons, bulk operations, import, authentication or deployment. Phase 3F and later reporting work have not begun.
