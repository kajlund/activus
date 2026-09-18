# Phase 6A — revised compact activity editor

Implemented the revised brief in the existing Lit application. The referenced approved image was not attached; the written brief and existing Activus identity supplied the visual target.

## Main changes

- `apps/web/src/styles/tokens.css`, shared management styles: warm ivory and charcoal-plum themes, semantic surfaces, text, actions, borders, navigation, controls, spacing and sizing. Bundled Manrope remains the body font; system Georgia is used for the editor title.
- `apps/web/src/theme.ts`, `index.html`, `app-shell.ts`: accessible sun/moon button with tooltip, persistent explicit light/dark choice under `activus-theme`, early theme application and native `color-scheme`. The OS preference supplies the initial default when no explicit choice exists. No three-way selector.
- `app-shell.ts`: all six destinations remain visible in the desktop top header. A container-width breakpoint replaces them with a right-side burger menu when space is insufficient, including under CSS zoom. The menu closes after navigation, Escape or outside pointer interaction. The duplicate global creation button is removed; the Journal retains New activity and its return-filter context.
- `components/accordion.ts`: shared semantic headers, leading icons, Lucide chevrons, live one-line summaries, expanded/panel relationships, error notices and reduced-motion-aware hover transitions.
- `features/activities/page.ts`: common create/edit structure, real kind radio tiles, directly selectable variant chips, kind search above 12 options, compact timing row, up to four measurement columns, optional context and persistent actions. Only one section opens at a time; existing edits begin collapsed and section query parameters remain supported. Desktop height is bounded; oversized panels scroll while the other headers and actions remain visible.

## Summaries and retained behavior

Summaries read the live draft and selected configuration: kind/variant/name; formatted journal date, start time and duration; the populated primary measurement (or first populated definition), unit and count of other populated measurements; notes first line, tag count, effort and feeling. The ordinary Duration alias is excluded from the measurement summary. Opening/closing panels and switching themes preserve the same draft.

Retained exact decimal conversion, ordering, configured measurement bounds and required validation, archived references, partial historical entries, original canonical values, recoverable incompatible measurement drafts, explicit discard confirmation, dirty-route guards, duplicate-save prevention, error recovery and success navigation. Required fields use asterisks; repetitive optional/type/aggregation copy is removed. Unusual measurement rules remain available where useful.

## Duration diagnosis and compatibility

Read-only inspection of the current API configuration found required ordinary Duration definitions on Walking (h:mm:ss display) and Strength Training (minutes display), in addition to the common `activities.duration_seconds` field. The schema and activity API deliberately support these as separate values; rendering every configured definition caused duplicate entry. The legacy import path already maps source overall duration to the common field.

A sample of 100 existing activities contained 98 common durations, three records with both representations, one conflict, and no measurement-only durations in that sample. This was a sample, not a claim about every historical record. No live data was written or migrated during implementation/testing.

The editor conservatively recognizes a definition only when its type is `duration` and its trimmed, case-insensitive name is exactly `Duration`. It hides that field from Measurements and uses Timing for entry. It continues sending a compatible measurement value for new/changed duration so existing required validation, measurement goals and consumers remain supported. Moving time, interval duration, lap time and other names remain independent fields.

Historical measurement-only duration is mapped into Timing; saving promotes it into the common field without deleting the historical measurement. If historical common and configured values conflict, unchanged values are preserved even when other measurements are edited. Explicitly changing Timing synchronizes the ordinary alias. This is an editor compatibility mapping, not a change to API contracts or schema, and does not reinterpret writes made by other API clients.

## Start-time behavior

The visible control is optional HH:mm with a 60-second step. Changed values derive their calendar date from Activity date and resolve in Europe/Helsinki, independent of the browser timezone. Spring-forward gaps are rejected; repeated fall-back times consistently use the earlier occurrence. There is no duplicate date input or DST occurrence selector. Unchanged stored timestamps retain their exact instant, seconds and milliseconds, even when their historical calendar date differs from the journal day.

## Verification

- `npm test`: 372 API tests and 149 frontend tests passed. Focused editor/shell tests were rerun after follow-up changes.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; production web builds repeated for browser verification.
- Prettier applied to changed files. `npm run format:check` flags only pre-existing formatting in unchanged `package.json`, `drizzle/meta/_journal.json`, `drizzle/meta/0006_snapshot.json`, and `drizzle/meta/0007_snapshot.json`.
- All 120 browser scenarios have passing case results across the full run and focused reruns. The final 12 redesign cases passed in all four desktop/mobile light/dark projects, including keyboard-only entry, 21-kind search/selection, menu dismissal, theme persistence, second-precise duration and 320px layout with visible Save.
- Browser verification uses the existing Chrome/Playwright harness with isolated API repositories; the in-app Browser was unavailable. The full suite and focused reruns exercise all existing routes, saves, archived data, dirty navigation, validation, responsive layouts, both themes and axe accessibility checks.
- New regression tests cover ordinary versus specialised duration, required duration, seconds, measurement-only historical records, conflicting historical values, exact timestamp preservation and Helsinki DST resolution.
- Layout checks cover 1440 x 900, 1920 x 1080, tablet, and narrow phones. At desktop sizes every section can be opened with no document-level vertical scrolling, including 17 visible measurement fields; headers and Save stay visible. Screenshots are produced under `.artifacts/phase-3a` and reviewed visually.
- The Windows Playwright runner has an existing teardown hang after test cases finish. Completed case results are recorded separately from the process exit; the stuck runner is interrupted only after all cases report.

## Deferred visual work

Journal, activity detail, goals, tags and configuration screens retain their internal layouts while inheriting the new shell and theme. Their detailed redesign remains for later phases. Overview and Progress retain their existing placeholder behavior.
