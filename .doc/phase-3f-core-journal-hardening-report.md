# Phase 3F core journal hardening

Package-manager migration note: commands below are now expressed as npm equivalents; the recorded historical results have not been rerun for this documentation update.

Reviewed 2026-09-08. No Phase 4 functionality, database schema changes, migrations, authentication, deployment, Docker, or import work was added.

## Workflows and corrections

Reviewed `/activity-kinds`, `/activity-kinds/:id`, `/tags`, `/settings`, `/activities/new`, `/activities`, `/activities/:id`, and `/activities/:id/edit`. The integrated browser journey creates a kind, Outdoor/Treadmill variants, a required distance measurement and a tag; records an older activity; filters the journal by year, kind, variant and all selected tags; edits notes; then verifies truthful historical references after configuration is archived.

- Kind and variant forms now protect dirty work during dismissal and navigation. Pending tag and measurement mutations also block navigation. Browser Back/Forward cancellation restores the history position without creating a duplicate entry.
- Activity saves and deletion ignore responses after their component disconnects; deletion requests are cancelled on disconnect. Pending deletion also protects against unloading.
- Routes have meaningful document titles. Unknown routes have a recoverable not-found page. Mobile navigation closes with Escape and restores focus to its summary.
- Removed the obsolete activity-entry success destination and duplicated activity-kind JSON parsing. Existing numeric, date/time, unit, pagination and tag-filter semantics remain unchanged.
- Fixed invalid accessible labels on generic tag containers and measurement spans. Measurement summaries now expose complete spoken labels using visually hidden text.
- Added separate control-border colours after the subtle divider colours measured only about 1.4-1.5:1 against field surfaces. Light control borders measure at least 3.1:1; dark borders at least 4.0:1 against their adjacent supported surfaces.
- Archived badges explicitly use normal text. Selected navigation and default badges use the existing primary-hover colour against primary-soft backgrounds. These fixes resolve the six initial browser accessibility failures without excluding axe rules.
- API writes reject untrusted or opaque Origin headers before reaching handlers, returning a safe 403 error. Configured web origins, same-origin requests and clients without Origin remain supported. This does not replace future authentication.
- Production Vite builds no longer load the API's root environment file. A development `NODE_ENV` in that file previously selected Lit's development code and emitted browser warnings. Development proxy configuration still reads the root API port.

## Verification

Commands below use npm workspace syntax.

| Check | Result |
| --- | --- |
| `npm test` | 358 API and 122 web tests passed; no skips |
| `npm run test:db` | 80 guarded PostgreSQL integration tests passed; no skips |
| `npm run test:browser` | 108 Chrome cases passed, retries disabled |
| `npm run test:browser:edge` | Six hardening cases passed in light and dark themes |
| Final Chrome hardening rerun | All 12 cases passed after the locale-aware assertion update |
| `npm run typecheck` | Passed |
| `npm run format:check` | Passed |
| `npm run lint` | Passed with zero ESLint warnings |
| `npm run build` | Contracts, API and production web builds passed |
| `npm run db:check` | Passed; no schema changes |
| `git diff --check` | Passed |
| `npm audit --omit=dev` | No known vulnerabilities |

Added two API origin tests, four web unit regressions, one database query-count/performance case, and three browser hardening journeys across four Chrome projects. The existing configuration conflict test now explicitly discards dirty changes before leaving. No existing tests were removed. Browser language is requested as `en-US`, with `Europe/Helsinki` timezone. The historical measurement assertion checks the exact localized quantity through the browser's Intl formatting, since installed Edge retained regional decimal formatting even with the requested language.

The complete dependency audit reports one moderate development-only advisory: Drizzle Kit's transitive esbuild version is affected by [GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99). The project does not start that esbuild development server. Production dependencies are clean. No speculative cross-version override was applied to the migration tooling; revisit when its upstream dependency is updated. The complete audit therefore exits nonzero and is not represented as clean.

The browser runner emits a terminal warning because its forced colour output coexists with the host's `NO_COLOR`. This is a runner environment warning, not application output. The integrated journey asserts no browser warnings, console errors, or page errors.

## Layout and accessibility evidence

Chrome projects use 1440 x 1000 desktop and 390 x 844 mobile viewports in both light and dark themes. The hardening route matrix additionally checks 320, 768, 1024 and 1920 px widths at 1000 px height for all eight routes listed above. It checks document overflow and captures screenshots. Automated WCAG A/AA axe checks run on the narrow route matrix and the integrated journey, without rule exclusions. Reduced-motion preference is enabled for the route matrix.

Keyboard checks exercise dialog Escape, Keep editing focus, focus restoration, tag selection, filters, main-content focus after navigation, and dirty Back/Forward cancellation. Gated requests exercise pending writes, failed writes and retained input; existing browser cases cover initial and later-page errors, retries, conflicts, empty states and archived long names. Tests use isolated Hono HTTP fixtures; real database verification runs separately against the guarded test database.

Manual screenshot inspection included narrow entry/journal/detail, dark configuration at 320 px, light entry at 768 px, dark journal at 1920 px, archived detail, tag forms, dirty dialogs and large values. Representative current screenshots:

![Archived history in dark theme](../.artifacts/phase-3a/hardening-core-journey-joi-e8570-diting-and-archived-history-desktop-dark/04-historical-detail.png)

![Narrow dark configuration](../.artifacts/phase-3a/hardening-routes-mobile-na-48c6a-w-zoom-and-accessible-forms-desktop-dark/320-configuration.png)

Artifacts are ignored local verification output and are regenerated by browser runs. Their directory remains `.artifacts/phase-3a/` for compatibility with the existing browser configuration.

Verification limits: the 200% check uses CSS zoom at a 1440 x 1000 viewport, not native browser zoom. Native zoom, physical mobile devices, Firefox/WebKit, and a human screen-reader session were not verified. Automated axe and targeted keyboard checks do not establish complete WCAG conformance. The route matrix captures every route, but manual screenshot inspection was representative rather than every route/state/viewport combination. These are remaining manual verification items, not claims of completed coverage.

## Database and build measurements

The guarded database case inserts 10,000 owned activities spanning multiple years and removes only its fixtures. Both kind-filtered and full-year kind-plus-variant journal requests use three SELECTs for a 25-item page plus one lookahead row; detail also uses three SELECTs. Captured `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` output is in `.artifacts/phase-3f/journal-query-plans.json`.

The initial measurement found about 56 ms for the kind-filtered repository call and 39 ms for the full-year variant call. SQL execution was about 15 ms and 2 ms respectively, using existing kind/date and variant/date indexes. These are local measurements, not latency guarantees; bulk fixture statistics were not explicitly refreshed. No speculative index or caching changes were justified.

The corrected production web bundle is 294.39 kB JavaScript, 72.04 kB gzip; CSS is 2.70 kB, 1.02 kB gzip; the local Manrope font is 24.83 kB. Removing accidental Lit development code reduced JavaScript from the intermediate 308.14 kB build. No lazy-loading refactor was introduced.

## Documentation and deferred work

README now documents the hardening behavior and quality commands. Visual design records accessible control borders and existing-palette badge corrections; its entry presentation was aligned with the accepted phase 3D page-level editor. Technical architecture now names `/health` and the accepted page-level entry routing. These are targeted corrections, not a replacement design or architecture.

Existing limitations remain: cursor pagination is not a transaction snapshot across concurrent edits; bulk reorder and inherited-definition override semantics remain deferred. Goals, reporting, progress, personal bests, analytics, authentication, import and deployment belong to later phases.
