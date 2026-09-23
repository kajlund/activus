# Phase 6E — Final polish and regression report

Scope follows the [route/state inventory](phase-6e-inventory.md). Existing
functionality was audited; no API contracts, database schema, calculations,
dependencies or product features were added.

## Findings and corrections

1. **Shell and navigation.** Opening the mobile menu left keyboard focus after
   its links in DOM order. Opening now focuses the current destination (or first
   link), Escape returns to the toggle, and leaving the menu by focus or pointer
   closes it. Focus handling covers Lit's shadow boundary. The non-modal menu
   remains untrapped and scrolls within short viewports. Overview and not-found
   recovery links now use semantic theme colour and 44-pixel targets.
2. **Journal and activity editor/detail.** Standalone detail retained the older
   sans-serif heading. Shared editorial heading styles now cover it alongside
   the editor, Journal and configuration. Existing single-open accordion and
   inline expansion, return context, seconds, start-date derivation and generic
   Duration consolidation are preserved.
3. **Goals.** Dynamic kind/variant requests could reject without handling or let
   stale responses overwrite a newer selection. They now expose loading and
   recoverable errors with secondary request IDs, ignore stale results and
   preserve other input. Save is blocked until references are available. Pending
   saves disable fields and Cancel, guard navigation even for an unchanged goal,
   and reject duplicate submission. Recalculation confirmation also blocks
   navigation without stacking another dialog. Route reuse reloads the selected
   goal. Same-view refresh retains existing rows and shows an updating status;
   failed refresh keeps the last result. Singular goal counts are grammatical.
4. **Configuration and Settings.** Their oversized headings now use the same
   heading style as Journal and Goals. Activity-kind loading/error states retain
   a heading. Kind rows use a Lucide chevron. Tag Name now has the shared required
   marker, Colour drops its optional suffix, and narrow colour choices use one
   column so their names do not break mid-word. The Tags list now actually opts
   into the shared transparent list styling, uses the configuration content width,
   and keeps short row actions beside their tag instead of forcing a second line.
5. **Shared controls.** Required markers and select/textarea focus outlines live
   in the existing management styles. Disabled buttons use semantic background
   and text tokens instead of fading their entire contents. The existing theme
   palette, boolean theme control, domain units and native dynamic selectors are
   retained. Dedicated editor/detail widths remain intentional.

## Route and state audit

The new browser matrix covers all 15 implemented route shapes and four
configuration dialogs at **1920, 1440, 768, 390 and 320 pixels**, in light and dark,
with 900-pixel viewport height. Existing editor tests additionally verify
1440 × 900, 1920 × 1080, 820 × 1180, 390 × 844 and 320 × 844, including large
measurement sets. Navigation additionally uses a 390 × 400 short viewport.

Existing journeys exercise loading, true/filtered empty, invalid filters,
validation, missing resources, read/save failures, retry, pending operations,
dirty dismissal, archive/restore, deletion, retained historical references and
Back/Forward. Configuration → activity entry → Journal → inline expansion →
edit/save and goal create/edit/lifecycle flows are retained. Import tests cover
validation, deterministic preview/report output, checksums, rejected unsafe
apply, transactional rollback and references in isolated fixtures/test storage.

Automated accessibility checks use axe's WCAG 2 A/AA, 2.1 AA and 2.2 AA tags.
The route matrix checks one H1 and horizontal overflow; other journeys cover
keyboard-only entry, labels, collapsed errors, focus trapping/restoration,
reduced motion, theme reload/preservation, accessible dialogs and CSS zoom.
Screenshots before corrections are in `.artifacts/phase-6e-before/`; final
screenshots are in `.artifacts/phase-6e-final/`, with the final tag correction and
route matrix in `.artifacts/phase-6e-tag-polish/`. Representative screenshots were
opened and visually inspected, including headings, narrow forms, dialogs,
measurement metadata, light/dark surfaces and the desktop editor action bar.

Browser console and uncaught-error listeners cover the route matrix and core
journey. The failed-reference regression explicitly checks for uncaught errors;
an intentionally simulated HTTP 503 is expected only in that failure scenario.
Request concurrency is tested with delayed responses. Theme switching retains
form state, and existing expansion tests protect single-open behavior.

## Evidence and limits

The Browser skill found no available browser surface, so interactive inspection
used the repository's Playwright fixture workflow plus visual inspection of its
saved screenshots. This is not a manual screen-reader certification or a
physical-device/on-screen-keyboard test. Native control and autofill appearance
can vary by browser/OS; Chrome is the tested browser. No new caching layer,
virtualization or performance architecture was warranted by this pass.

The application has **no export UI/API, web importer, personal-record view or
implemented trend charts**. These could not be exercised as product flows.
Overview and Progress remain honest placeholders for Phase 7. Import checks used
fixtures and the guarded test database; private migration inputs and normal
development data were not reapplied.

## Verification

- `npm test`: 372 API and 162 web tests passed (534 total).
- `npm run test:db`: 91 PostgreSQL integration tests passed. The sandbox blocked
  the first connection; the authorized run outside it completed successfully
  against the separate test database with existing identity/role guards.
- `npm run test:browser -- --workers=4
  --output=../../.artifacts/phase-6e-final`: 170 passed in 3.2 minutes, exit 0.
  Two redundant mobile matrix cases are intentionally skipped: each desktop
  theme matrix already runs at all five widths, including both mobile widths.
- `npm run typecheck`, `npm run lint`, scoped `prettier --check`, and
  `git diff --check`: passed.
- `npm run test:browser -- tags.spec.ts final-polish.spec.ts --workers=4
  --output=../../.artifacts/phase-6e-tag-polish`: 26 passed in 47.7 seconds,
  exit 0, after the final Tags list correction. The same two redundant matrix
  cases were skipped. Final light/dark mobile Tags screenshots were inspected.
- `npm run build`: production API and web builds passed; final frontend build is
  also part of the browser command.

The full formatter check has four pre-existing warnings in `package.json` and
`drizzle/meta/{_journal,0006_snapshot,0007_snapshot}.json`. These unrelated files
are not reformatted by this phase.

Phase 6E implementation is complete. No known high-impact Phase 6 regression
remains in the exercised flows; manual assistive-technology and physical-device
verification remain limited as described above. Changes are uncommitted.

## Selected visual evidence

Opened screenshots show the corrected editorial heading on activity detail,
readable tag choices and the preserved compact activity editor. They are local
QA artifacts and remain ignored by Git.

![Activity detail with shared heading](../.artifacts/phase-6e-final/final-polish-all-implement-d4522-ible-responsive-foundations-desktop-light/1440-activity-detail.png)

![Tag form at 320 pixels in dark theme](../.artifacts/phase-6e-final/final-polish-all-implement-d4522-ible-responsive-foundations-desktop-dark/320-tag-dialog.png)

![Activity editor at 1440 by 900](../.artifacts/phase-6e-final/final-polish-all-implement-d4522-ible-responsive-foundations-desktop-light/1440-new-activity.png)
