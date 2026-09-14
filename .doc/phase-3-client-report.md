# Phase 3A and 3B implementation report

Package-manager migration note: commands below are now expressed as npm equivalents; the recorded historical results have not been rerun for this documentation update.

Completed 2026-09-07. Scope is configuration UI only. No backend, database, migration, authentication, deployment, import, activity-entry, tag-management, goal or progress changes.

## Files

New files:

```text
apps/web/src/components/dialog-focus.ts
apps/web/src/features/measurements/fields.ts
apps/web/src/features/measurements/form.ts
apps/web/src/features/measurements/section.ts
apps/web/test/measurements.test.ts
apps/web/e2e/fixture.ts
apps/web/e2e/measurements.spec.ts
.doc/phase-3-client-report.md
```

Updated files:

```text
README.md
package.json
apps/web/tsconfig.json
apps/web/playwright.config.ts
apps/web/src/app-shell.ts
apps/web/src/routes/navigation.ts
apps/web/src/services/configuration-api.ts
apps/web/src/features/activity-kinds/{icons,kind-form,page,styles,variant-form}.ts
apps/web/test/{activity-kinds,configuration-api}.test.ts
apps/web/test/support/configuration-api.ts
apps/web/e2e/configuration.spec.ts
```

The kind/variant feature, routing, client boundary and browser setup were present in the phase 3A baseline. This work finishes their formatting, accessibility, responsive verification and documentation, then adds phase 3B. Existing exact dependencies were sufficient; no additional package installation was needed in this completion pass.

## Phase 3A completion

- `/activity-kinds` and `/activity-kinds/:id` provide kind lifecycle management and reusable create/edit forms, plus variant creation, editing, default selection, archive and restore.
- Six approved Lucide icons, searchable native radio choices, approved six-colour palette, custom hex colour and numeric order fields are retained. No speculative counts or per-kind primary-name fetches.
- Filters use URL state; refresh and back/forward are tested. The typed client validates responses, applies timeout/cancellation, preserves safe request IDs, and never retries mutations automatically.
- Fixed Lit class-field semantics, stable accessible input names during validation, Tab/Shift+Tab wrapping through shadow roots, focus restoration, mobile header compression and long variant names. Fixed skip-link clipping in long-page screenshots.
- Archive/default behaviour follows the API. Archived identities remain readable, and restoring a variant never silently makes it default again.

## Phase 3B decisions

1. **Detail integration:** kind identity, Measurements, then Variants. A grouped list with separators displays type, unit, required/optional, primary, aggregation, personal-best direction and archived status.
2. **Ownership:** parent view selects parent definitions from the existing single configuration-list response. That endpoint returns all definitions for a kind; it is not assumed to be parent-only. Variant views use `effective=true&activityVariantId=...` and the API's `source` field. Inherited entries have an `Edit at parent` link, with no overrides. Variant selection and measurement archived visibility are bookmarkable query parameters. Invalid variant links cannot become accidental parent-creation flows.
3. **Reusable form:** explicit owner context and existing-definition input determine create/edit behaviour. Decimal supports precision; integer uses implicit zero precision; duration uses additional-time guidance and `h:mm:ss` bounds; rating supports 1–5 or 1–10; yes/no and text hide numeric controls. Type changes warn before clearing entered settings.
4. **Units:** loaded from `/api/v1/measurement-units`; successful metadata is cached, rejected promises are evicted. Compatible choices are grouped by API dimensions. Unit IDs, labels, symbols, default precision and conversion factors come from the API. Unitless numeric definitions are supported. Bounds are displayed in the selected unit and submitted canonically; duration submits integer seconds. Metadata failure blocks forms with a retry action.
5. **Advanced settings:** precision, bounds, aggregation, personal-best direction and numeric order are under an accessible disclosure. Plain labels replace internal enum names. Rating totals and nonnumeric reporting controls are excluded.
6. **Historical edits:** the existing API has no use/capability flag and locks precision and bounds as well as type/canonical unit. The client handles `MEASUREMENT_DEFINITION_HAS_HISTORY` on save, preserves input, explains locks and offers an explicit action to restore recorded settings while retaining safe edits. No per-row probe or backend extension was added. PATCH sends only changed fields.
7. **Primary:** eligible active parent numeric/duration/rating rows offer Set as primary and Clear primary. Text, Boolean, variant-specific and archived rows cannot be selected. The UI explains compact-summary usage. Primary archival conflicts instruct users to clear or replace the selection first.
8. **Archive/restore:** explicit confirmation preserves history. Errors stay in the dialog with request IDs. Name reservation/inherited-name conflicts explain the blocked name in context and direct users to inspect archived definitions; the existing API supplies no conflicting-record ID. Restore never changes historical values or ownership.
9. **Ordering:** the backend has no complete-list transactional reorder endpoint. Server order is preserved, with ordinary numeric order editing. Drag/drop and keyboard reorder interactions are explicitly deferred, rather than issuing one write per row.
10. **Concurrency:** superseded requests are aborted and stale responses ignored. Background refresh retains lists. Measurement mutations refresh their measurement scope; primary updates use the returned kind. Duplicate submissions are prevented; rejected values are preserved.
11. **Accessibility/responsiveness:** native modal dialogs, explicit keyboard edge wrapping, semantic forms/lists/headings, associated help/errors, first-invalid focus, Escape, opener restoration, dirty-dismissal and leave/reload warnings. Mobile headers/actions stack and forms fill the viewport with vertical scrolling. Required/primary/inherited/archived states use text. Approved light/dark tokens and reduced motion remain unchanged.

## Verification

Equivalent npm commands:

| Check | Result |
| --- | --- |
| `npm test` | 356 API tests and 38 web tests passed |
| `npm run typecheck` | All workspaces passed |
| `npm run build` | Contracts, API and production web build passed |
| `npm run test:browser` | 20 Chrome journeys passed against the production web build |
| `node node_modules/prettier/bin/prettier.cjs --check .` | Passed; equivalent to root `format:check` |
| `node node_modules/eslint/bin/eslint.js . --max-warnings 0` | Passed; equivalent to root `lint` |
| `git diff --check` | Passed |

Formatting was applied with the installed Prettier CLI. Existing PostgreSQL integration tests were not rerun: no backend or schema code changed. Browser tests intercept every API request with deterministic test-created state and do not touch a development or production database. They exercise the real client, HTTP transport and schemas, not a live PostgreSQL stack.

No requested browser tests remain unexecuted. The in-app browser connection was unavailable, so the project Playwright runner used installed Google Chrome. Browser runs emitted environment-level `NO_COLOR`/`FORCE_COLOR` notices; lint and production builds have no code warnings. Development-mode Lit notices do not occur in the production browser run.

Visual inspection covered desktop (1440×1000) and mobile (390×844), light and dark themes: parent/inherited hierarchy, empty/error states, long names, kind/variant forms, measurement advanced settings, duration and history locks. Browser assertions also cover no horizontal document overflow and modal keyboard focus. Fixed visible mobile name compression and skip-link leakage before final capture. Screenshots and failure traces are in `.artifacts/phase-3a/` (the retained directory name covers both phases); the final `.last-run.json` reports passed.

## Deferred to phase 3C or later

Tag management and all activity entry/browsing UI remain untouched. Goals, progress, charts, personal-best calculations, authentication, import, deployment and Docker remain deferred. Bulk reordering and inherited-measurement overrides require future backend semantics. No backend compatibility additions, schema changes or Git configuration changes were needed.
