# Phase 6C: Goals and Progress visual alignment

## Inventory and scope

See [the pre-implementation inventory](phase-6c-inventory.md). The implemented goal lifecycle is Active, Upcoming, Ended and Archived. Reached is calculated, not a lifecycle view. Goals support fixed or recurring week/month/year schedules and count, total-duration or numeric measurement-total targets. Goal detail already includes current/remaining values, recurring period history and qualifying activity links.

Progress was only a planned-section placeholder at /progress/trends. There is no implemented trend chart, Progress period/filter model, personal-record definition/API, record grouping or source-activity interaction to align. This phase gives that route a consistent editorial planned state and links to existing Goals and Journal. It deliberately does not fabricate charts, metrics, records, completed-goal categories, manual completion or goal deletion.

## Changes

- goals/page.ts: editorial heading, compact lifecycle navigation with existing URLs, lightweight two-column goal rows, Lucide navigation chevrons, restrained progress and reached indicators, directly labelled Edit/Archive/Restore actions. Existing accurate counts, true-empty versus lifecycle-empty messaging, API failure/retry and confirmations remain.
- goals/detail.ts: current/target hierarchy, semantic scope/date/target definition grid, compact selectable period-history rows, visible historical-reference warnings and a separate lifecycle-action footer. Edit and refresh stay by the heading; qualifying activities and pagination remain available.
- goals/create-page.ts: compact labelled form sections and adjacent fields, required markers, native radio choices, realistic numeric widths, adjacent canonical units and aligned date controls. Irrelevant target/schedule fields are hidden and disabled without removing their DOM controls, preserving entered values when choices change. This also removes the old irrelevant required target-value control that blocked native duration-form submission.
- Duration targets now expose seconds already supported by the model, preserving precise targets during name-only edits instead of silently rounding to minutes.
- goals/styles.ts: scoped shared styling based on existing journalStyles and Phase 6A managementStyles, typography and semantic tokens. The selected lifecycle tab uses readable text over the purple selection surface in both themes.
- progress/page.ts and its app-shell route: aligned planned-state presentation; existing URL preserved.
- Tests: goal form retention/seconds regressions and a new Goals browser suite covering lifecycle navigation, every target type, recurring history, archival references, confirmation/cancellation, failed saves, missing/empty/error states, responsive layouts and accessibility.

## Preserved behavior

No schema, contracts, goal calculations, period boundaries or APIs changed. Canonical measurement target units remain canonical and are now clearly labelled. Display values and progress ratios still come from the existing server-backed presentation. Inclusive dates, clipped boundary periods, all-selected-tag matching, partial/no-contribution activities, exact decimals, archived stored-reference retention, safe return routes, dirty-form confirmation, recalculation confirmation and archive/restore are retained.

Forms remain four visible related sections rather than introducing accordion interaction for these fields. Wide layouts put labels/controls into compact columns; small screens stack them and scroll naturally. Goal rows become vertical summaries on narrow displays. No page-specific literal colours, decorative charts or animation were introduced. Activity kinds, Settings, the Journal and the activity editor were not redesigned.

## Verification

- npm test: passed, 372 API tests plus 157 web tests (529 total).
- npm run typecheck: passed.
- npm run lint: passed.
- npm run build: passed.
- npm run test:browser -- --workers=4 goals.spec.ts journal.spec.ts redesign.spec.ts: all 52 Journal/editor scenarios passed. Two Goals dark-theme checks initially found selected-tab contrast failures; these were fixed.
- npm run test:browser -- --workers=4 goals.spec.ts: final run passed all 20 cases, including WCAG-tagged Axe checks. Combined with the regression run, 72 distinct browser/project scenarios passed.
- Verified light/dark desktop and mobile; screenshots also cover 320px, 768px and 1920px form/Progress layouts. Inspected rendered overview, detail, form, confirmation and planned-state screenshots. No horizontal overflow in these checks.
- Changed files were formatted. Repository-wide format:check retains four existing warnings in package.json and drizzle/meta/{_journal.json,0006_snapshot.json,0007_snapshot.json}; these unrelated files were left alone.
- git diff --check passed.

The Windows Playwright runner remained alive during teardown after all test cases completed, as in earlier phases. It was interrupted after final case output; these are passing case results, not clean browser-runner process exits. Its preview server was stopped. Screenshots are in the ignored local .artifacts/phase-6c/ directory.

Browser coverage uses isolated activity/configuration fixtures and contract-validated goal responses. Goal calculation correctness remains covered by the existing API tests; no personal database data was modified.
