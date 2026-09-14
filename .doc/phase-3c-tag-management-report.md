# Phase 3C: Tag management UI

Package-manager migration note: commands below are now expressed as npm equivalents; the recorded historical results have not been rerun for this documentation update.

Implemented the tag-management client at `/tags`, reached through **Settings → Tags**. The six primary navigation sections remain unchanged. Settings also links to activity-kind and measurement configuration; it introduces no unrelated settings features.

## Files and components

Created:

- `apps/web/src/features/tags/page.ts`: route controller, debounced filters, list states, lifecycle dialogs and mutation orchestration.
- `apps/web/src/features/tags/form.ts`: focused reusable name/optional-colour editor, shared-schema validation and dirty-form handling.
- `apps/web/src/components/chart-colours.ts`: the existing approved palette, now shared by kind and tag forms.
- `apps/web/test/support/tag-api.ts`: isolated typed test state.
- `apps/web/test/tags.test.ts`: component and typed-client checks.
- `apps/web/e2e/tags.spec.ts`: four tag journeys across four viewport/theme configurations.
- This report.

Changed:

- `apps/web/src/app-shell.ts`: Tags route, Settings entry point, active navigation and focus preservation on query-only navigation.
- `apps/web/src/services/configuration-api.ts`: typed tag list/create/update/archive/restore methods and safe tag error messages, using the existing transport.
- `apps/web/src/features/activity-kinds/kind-form.ts`: imports the shared palette with unchanged options.
- `apps/web/e2e/fixture.ts`: isolated tag HTTP responses alongside existing configuration fixtures.
- `README.md`: setup/navigation, implemented behaviour, test coverage and deferred scope.

No backend, contracts, database, migration or dependency changes were required. Git configuration and environment files were not changed.

## Interactions and decisions

- Active tags are the default. Search and `archived=true` are URL-backed, with refresh and back/forward support. Search uses the backend's case-insensitive semantics and a 300 ms debounce. Stale requests are cancelled or ignored. The last successful list remains during background loading and read failure, with an explanatory notice on failure.
- Search remains visible for small lists to keep the filter layout stable. Server ordering is preserved: normalized name, then identifier. The UI does not introduce a conflicting client sort.
- The unfiltered empty active list makes one additional include-archived request to distinguish first use from an entirely archived collection. Populated and searched lists need only their normal list request. No per-tag fetches or activity-count queries are introduced.
- Separate states cover first use, no search matches, no active tags, no archived tags, initial loading and actionable read errors. Empty data never produces sample tags.
- Create/edit accepts only name and optional colour. Name trimming and the maximum length come from the shared schema. The six approved colours and No colour use native radio controls, named swatches and a text selection indicator. Text uses theme tokens rather than arbitrary tag colours. Existing custom API colours can be retained or cleared; the UI cannot invent new custom colours.
- PATCH sends changed fields only. Clearing colour sends explicit null; omission preserves it. Failed saves retain input, expose field-level duplicate-name errors and preserve request IDs. Double submission is blocked. Mutations are never automatically retried.
- Archive confirms that historical associations remain and future assignment becomes unavailable. Restore is recoverable and uses the existing endpoint. The backend reserves names case-insensitively across both active and archived rows, which is stronger than active-only uniqueness; messages follow that existing rule. Defensive restore-conflict handling is covered despite normal uniqueness constraints preventing a duplicate archived identity.
- The page explains tags versus structured variants. There are no activity counts, icons, descriptions, categories, nesting, manual order or deletion controls.
- Native dialogs reuse the existing shadow-root keyboard focus trap, Escape handling, dirty-discard warning and focus restoration. When a row disappears after archival, focus returns to the page heading. Dirty route/reload warnings follow phase 3B. Live regions announce loading and mutation results.

## Verification

Equivalent npm commands:

| Check | Result |
| --- | --- |
| `npm test` | 356 API tests and 57 web tests passed |
| `npm run typecheck` | All workspaces passed |
| `npm run build` | Contracts, API and production web build passed |
| `npm run test:browser` | 36 Chrome tests passed, including 16 tag tests |
| Installed Prettier CLI `--check .` | Passed, equivalent to root `format:check` |
| Installed ESLint CLI `. --max-warnings 0` | Passed, equivalent to root `lint` |
| `git diff --check` | Passed |

The tag browser journeys cover Settings navigation, keyboard colour selection, creation/editing, focus trapping/restoration, archive/restore, URL search/filter history, refresh, long names, loading, read-error recovery and rejected forms. Component tests additionally cover debounce timing, out-of-order responses, schema limits, archived-name and restore conflicts, explicit colour clearing, existing custom-colour retention and duplicate mutation prevention.

Browser tests run the production build with the existing isolated HTTP fixtures. They do not access the development or production database. PostgreSQL integration tests were not rerun because no backend/schema code changed. All browser tests were executed. The runner emits the existing environment-level NO_COLOR/FORCE_COLOR notice; source lint and production builds have no code warnings.

Visual inspection used 1440×1000 desktop and 390×844 mobile screens in light and dark themes. Screenshots cover empty, populated, archived, editor, colour selection, archive confirmation, long-name, loading, conflict and read-error states. Verified readable wrapping, accessible focus, modal layout and no horizontal document scrolling. Adjusted read-error spacing and explained retained results. Swatches never supply the only identity or selected-state indication.

Screenshots are retained in `.artifacts/phase-3a/tags-*` alongside the existing configuration suite; the directory name is unchanged for compatibility. The final `.last-run.json` reports passed.

## Carry into phase 3D

Tag assignment belongs in the future activity-entry flow. No assignment, activity creation/editing, journal browsing, goals, progress, imports, hierarchy or permanent deletion was implemented. Continue using the existing tag IDs, optional colours, archived-assignment restrictions and historical association semantics. No activity-count endpoint was added solely for list decoration.
