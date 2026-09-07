# Phase 3D — Activity entry

## Scope and routes

Implemented creation at `/activities/new` and editing at `/activities/:id/edit`. The persistent **Record activity** action opens creation; the six primary navigation labels remain unchanged. Activities is selected for entry routes.

Saving opens `/activities/:id/edit?saved=1`, reads the persisted record and announces **Activity saved**. This is a deliberately temporary destination until phase 3E provides the journal/detail flow. Cancel returns to the existing Activities placeholder. No journal listing, detail-page implementation, activity deletion, duplication, bulk editing or phase 3E work was added.

The complete approved visual and technical documents were read before implementation. The phase 3D prompt explicitly asks for a page-level form, conflicting with the older desktop dialog/panel presentation. This conflict was explained before choosing the newer, specifically authorized phase 3D direction. Existing domain rules remain authoritative: variant, start timestamp and duration are optional; the model has no required-variant flag. Zero duration is valid, and partial historical records keep their existing completeness status.

## Files and responsibilities

| File | Change |
| --- | --- |
| `apps/web/src/features/activities/page.ts` | Page-level editor, independent initial reads, selection/configuration loading, explicit draft and historical state, validation, changed-field PATCH, safe errors and navigation protection. |
| `apps/web/src/features/activities/tag-picker.ts` | Searchable native-checkbox multi-select with named selected-tag removal, optional colour cues and archived historical selections. |
| `apps/web/src/features/activities/values.ts` | Exact decimal input conversion, canonical constraints, duration parsing and browser-local timestamp conversion. |
| `apps/web/src/services/configuration-api.ts` | Typed activity GET/POST/PATCH methods using the existing transport; retains structured error details and adds activity-specific messages. |
| `apps/web/src/app-shell.ts` | Editor route rendering, global Record activity action and Activities navigation selection. |
| `apps/web/test/support/activity-editor.ts` | Test-only real Hono application and existing isolated repository doubles, with deterministic domain fixtures. |
| `apps/web/test/activity-entry.test.ts` | Component, serialization and direct API integration coverage. |
| `apps/web/e2e/activity-entry.spec.ts` | Create/edit, configuration changes, historical references, keyboard use, failure states and timezone browser journeys. |
| `README.md` | Setup/structure updated through phase 3D and entry semantics documented. |

No dependencies, shared contracts, backend implementation, database schema or migrations changed. No credentials, Git configuration, deployment configuration or Docker setup changed.

## Configuration and historical editing

- Initial activity-kind, tag and optional activity reads run concurrently. Failed required dependencies show an explicit retry and do not expose an empty editable record. Configuration errors prevent submission.
- Kind and variant controls use native selectors with keyboard type-ahead and visible names; the chosen kind also displays its approved Lucide icon. New entries exclude archived references. A kind with no variants has no variant control. Real configured defaults apply when selecting a kind; editing keeps its stored variant, including a stored null selection.
- For a selected variant, the client calls the existing effective measurement endpoint. Without a variant, it reads definitions and retains parent definitions only. Server ordering and inherited/additional definition semantics remain intact; no overrides or invented measurement definitions are introduced.
- Effective active definitions determine type, unit, requirement, precision, bounds and ordering. Boolean, decimal, integer, duration, rating and text inputs all serialize through shared schemas. No distance/heart-rate/steps-specific fields are hard-coded.
- An unchanged historical scope also includes archived definitions with stored values. Missing historical definitions block saving instead of dropping their values. A partial historical record does not gain invented required values. Existing effort, feeling and immutable metadata remain intact.
- Measurement drafts are keyed by stable definition ID. Values survive disappearing fields during kind/variant switches and return when those definitions become applicable again. Hidden nonempty values are named visibly; saving without them requires explicit confirmation. Final replacement sets contain only applicable measurements.
- Already attached archived kinds, variants, measurements and tags remain visible. A stored archived kind keeps its original variant; switching away and back restores that selection. Archived tags can be removed but are never offered as new selections. Tags submit deduplicated IDs; colours are secondary cues only.

## Serialization and saving

- **Journal date:** browser-local current date on creation, submitted unchanged as `YYYY-MM-DD`; it never passes through UTC conversion.
- **Optional start:** separate local date/time in the displayed browser timezone, converted to a UTC instant. Nonexistent daylight-saving times are rejected. Repeated times support first/second occurrence. An unmodified historical start preserves its exact UTC instant and milliseconds, including a later overlap occurrence, regardless of the initial selector default.
- **Duration:** separate whole hours, minutes and seconds preserve second precision. All blank means null; explicit zero stays zero. Minutes/seconds must be 0–59 and the canonical total must be a safe integer. Configured `hour-minute` measurements accept `hours:minutes[:seconds]`; other units use their fixed configured representation.
- **Numbers:** input text accepts a decimal point or one decimal comma, never grouping separators or exponent notation. Base-ten BigInt arithmetic converts configured display units into canonical units before validating precision and bounds. Decimal payloads remain strings; integer/duration/rating payloads remain safe integers. Conversion never rounds a write to fit constraints.
- **Historical numeric accuracy:** an unchanged input reuses its original canonical value. Rounded display values are never treated as exact replacements, including when another measurement changes and the complete measurement set must be submitted.
- **Notes/name:** shared trimming and limits apply; notes are plain text and internal line breaks remain. Empty optional text becomes null. No rich text, attachments or import fields are introduced.
- **PATCH:** sends changed common fields only. Measurement and tag arrays are included independently only when changed; a kind/variant change sends the complete applicable measurement set. Source identity, IDs, timestamps and other immutable metadata are not submitted.
- The existing API commits common fields, measurement replacements and tag assignments transactionally. It does not expose an optimistic revision or ETag precondition; no speculative concurrency contract was added. Same-field concurrent edits therefore retain the existing server behaviour.
- Submission is guarded while pending. Failed mutations retain entries and request IDs, and never automatically retry. Supported missing/incompatible-definition error IDs map to controls; client formatting errors focus the first invalid field and open optional details when needed. Errors without field identifiers remain visible at form level.
- Internal navigation, Cancel, browser Back and refresh/close use the established dirty-form confirmation. A successful save clears dirty state. Navigation is blocked while saving to avoid abandoning an in-flight mutation.

## Verification

The existing installed dependencies were used; no install or dependency update was necessary. Commands use pinned pnpm through `npx --yes pnpm@10.34.5` where applicable.

| Check | Result |
| --- | --- |
| `pnpm test` | Passed: 356 API tests and 93 web tests (36 new activity-entry tests alongside 57 existing tests). |
| `pnpm test:browser` | Passed: 64 Chrome journeys, including 28 activity-entry journeys. |
| `pnpm typecheck` | Passed for all workspaces. |
| `pnpm build` | Passed: contracts, API and production web assets. |
| Installed ESLint CLI `. --max-warnings 0` | Passed; root lint equivalent. |
| Installed Prettier CLI `--check .` | Passed; root format-check equivalent. |
| `git diff --check` | Passed. |

Component coverage includes empty/loading/dependency errors, edit not-found, defaults and optional variants, every measurement type, ranges and precision, false/zero preservation, exact historical updates, disappearing/recovered fields, stale configuration responses, configuration retries, active/archived tags, dirty navigation, hidden-field focus, failed create/update preservation and duplicate-submit prevention.

Browser requests are intercepted and forwarded to the real Hono app with the existing in-memory repository doubles. Tests verify saved values by reading the same real activity API. No request reaches development/production data. PostgreSQL integration tests were not rerun because backend/schema code did not change; database transaction coverage remains in the existing dedicated suite.

## Visual and accessibility verification

| Viewport | Themes |
| --- | --- |
| 1440 × 1000 desktop | Light and dark |
| 390 × 844 mobile | Light and dark |

The connected Browser had no available browser, so verification used the project's installed Chrome/Playwright runner. Screenshots cover populated new/edit forms, no variants or measurements, no tags, multiple selected tags and long labels, historical archived references, loading, read errors, validation, pending save and save errors. The full form reflows without horizontal document scrolling. Field labels and units remain associated; selected names never depend on colour. Focus rings, keyboard tag selection, explicit errors and accessible native controls were inspected. Layout uses existing tokens and reduced-motion behaviour, with no added animations.

Browser tests verify the native unsaved-changes confirmation text and accept/dismiss behaviour, including Back. Native browser dialogs are platform UI and are not included in page screenshots. Date/time tests run in `Europe/Helsinki`, rejecting the spring gap and selecting the second autumn occurrence while retaining a separate journal date.

Screenshots remain under `.artifacts/phase-3a/activity-entry-*` to preserve the existing runner convention. Environment-level `NO_COLOR`/`FORCE_COLOR` notices are inherited from the runner; they are unrelated to source code.

## Carry into phase 3E

Replace the temporary saved-editor destination and Activities placeholder with the intended journal/detail navigation. Keep the same entry routes and shared workflow. Preserve exact canonical numeric values, date/instant separation, explicit replacement semantics, partial history and archived-reference rules. Any future optimistic-concurrency contract needs an explicit backend decision rather than a client-only approximation.

Journal browsing, calendar/timeline, filtering/pagination UI, goals, coaching, charts, progress, duplication, bulk editing, imports, authentication and deployment remain deferred.
