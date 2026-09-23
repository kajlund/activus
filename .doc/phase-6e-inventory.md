# Phase 6E route and state inventory

Created before implementation on 2026-09-23 from the route switch, components,
API fixture tests and import documentation. This checklist drives the pass.

## Surfaces

| Route / surface | States and interactions to check |
| --- | --- |
| `/` Overview | Placeholder, journal link, shared shell |
| `/activities` Journal | Loading, populated, true/filtered empty, invalid filters, API/retry, paging, single inline expansion, delete confirmation, return from edit |
| `/activities/new` | Configuration loading/error/empty, kind/variant choices, accordion, validation, pending/error save, dirty cancel, time/date, duration seconds, measurements/tags/notes/effort/feeling |
| `/activities/:id/edit` | Loading, missing/error, archived references, retained values, patch/save, return context |
| `/activities/:id` | Loading, missing/error/retry, measurements, tags, notes, matching goals, edit/delete |
| `/goals` | Loading/error/retry, active/completed/archived, true/filtered empty, progress unavailable versus zero, archive/restore |
| `/goals/:id` | Loading, missing/error, fixed/recurring progress, history/contributions, edit/archive/restore |
| `/goals/new`, `/goals/:id/edit` | Loading/missing/error, required fields, target types, schedules, retained input, historical references, recalculation/discard confirmations, pending save |
| `/progress/trends` | Honest planned state, goals/journal links; no chart or personal-record UI exists |
| `/activity-kinds` | Loading/error/retry, first use/archived-only/no archived, create, detail links |
| `/activity-kinds/:id` | Loading/missing/error, variants/defaults, inherited/owned measurements, history locks, primary eligibility, archive/restore confirmations |
| Kind / variant dialogs | Create/edit, required/invalid fields, pending/error, dirty dismissal, focus containment/return |
| Measurement dialog | Six types, units, bounds, required/primary, progressive settings, invalid collapsed field, history lock, pending/error/dirty dismissal |
| `/tags` and tag dialog | Search/empty/loading/error, create/edit, validation/pending, archive/restore, dirty dismissal/focus |
| `/settings` | Two configuration destinations |
| Unknown routes | Not-found heading/title, recovery link, focus after navigation |
| Global shell | Horizontal navigation, burger, current route, outside/Escape/keyboard dismissal, focus, Back/Forward, theme persistence and form preservation |
| Import/export | No web routes or export capability. Existing CLI validation/preview/report and safety tests only; no real data apply |

## Verification matrix

- [x] Capture current routes before corrections and inspect representative saved screenshots.
- [x] Light/dark at 1920, 1440 × 900, 768, 390 and 320 pixels.
- [x] One H1, headings, landmarks, labels, errors, status announcements, automated contrast checks.
- [x] Keyboard menus/dialogs/accordions, route focus, disabled/pending controls.
- [x] Theme reload, reduced motion, overflow and short viewport navigation.
- [x] Existing cross-route journeys and console/page errors.
- [x] Formatter, typecheck, lint, unit/integration/component tests, production build.
- [x] Document fixes, evidence, limitations and Phase 7 deferrals.

Browser availability: Browser skill initialized but reported no available browser
surfaces. Repository Playwright tests provide isolated fixture-driven browser
verification and screenshots; this does not constitute manual assistive-technology
or physical on-screen keyboard testing.
