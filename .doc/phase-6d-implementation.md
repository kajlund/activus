# Phase 6D — Activity kinds and Settings

The [pre-implementation inventory](phase-6d-inventory.md) records the existing
capabilities and protections. This phase changes presentation and navigation;
there are no API, database, migration, import or stored-data changes.

## Implemented

- Activity kinds use the Phase 6A–6C editorial heading, light list rows,
  configured-colour accents and a single Add activity kind action. Rows open
  details; editing and confirmed archival/restoration live on the detail page.
  First-use, all-archived, no-archived and failure states remain distinct. Only an
  empty active list makes an additional read to distinguish archived-only data.
- Variant names directly open editing, with visible Measurements and
  Archive/Restore variant actions. The form identifies its owning kind. Default
  selection, order and archived-parent restrictions are unchanged. A selected
  archived measurement variant no longer produces an empty variants list when
  archived variants are hidden.
- Measurements use aligned definition lists for value type, unit, requirement,
  summary and comparison. Primary is the prominent badge; archival is plain
  text. Names open editing, and primary/archive actions are explicit. Desktop
  metadata aligns in five columns; mobile uses two columns without horizontal
  scrolling. Inherited definitions still link to editing at their parent.
- Kind forms group icon and colour selection, show a name/icon/colour preview,
  mark required fields, constrain numeric widths and use Create activity kind.
  Variant and measurement forms share the scoped form styles.
- Measurement forms separate details from progressively disclosed entry rules,
  summary behaviour and display order. Aggregation, comparison and rating ranges
  use native radio groups; compatible units still use the dynamic API catalogue.
  The six-type selector remains compact. Collapsing settings retains values.
  Invalid display order now opens its containing disclosure before focus moves.
- Duration guidance distinguishes common overall duration from specialised
  moving/rest-time measurements. Existing generic Duration definitions show a
  history-preservation explanation. Phase 6A entry consolidation is unchanged.
- Settings exposes its actual two destinations under Journal configuration with
  explanatory navigation rows. Tags adopts the same editorial heading and direct
  name-edit/archive actions. Theme remains in the application header.

## Reuse and retained complexity

`configuration-styles.ts` is scoped to these configuration components and builds
on existing `managementStyles`, semantic theme tokens, native controls, existing
Lucide activity icons and dialog focus handling. The global tokens, activity
editor, Journal, Goals and Progress implementations were not changed.

The existing dirty-state protection, cancellation/stale-response guards, blocked
duplicate submissions, field validation, request-ID errors, confirmation copy,
server ordering, patch-only measurement edits and focus restoration remain.
Canonical unit conversions, precision and bounds, six value types, required
normal-entry semantics, rating restrictions, primary eligibility, parent/variant
ownership, history locks and default-clearing rules are intentionally retained.

Phase 5 import remains CLI-only (`npm run import:legacy`). Its preview/apply
separation, reviewed mappings, fingerprints, ledger, transactional writes and
reporting were not touched or executed. No web importer/exporter exists, so no
upload/export controls or unsupported preferences were added.

## Verification

- `npm test`: 372 API and 157 web tests passed (529 total).
- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- Scoped `prettier --check` and `git diff --check`: passed.
- `npm run format:check`: reports only four pre-existing formatting warnings in
  `package.json` and `drizzle/meta/{_journal,0006_snapshot,0007_snapshot}.json`.
- Browser checks use isolated fixture APIs, never the user's development
  database. They exercise configuration CRUD, every measurement type, units,
  defaults, primary values, archival/restoration, history locks, failed requests,
  dirty forms, keyboard/focus behaviour, Settings and tags; regression journeys
  cover activity entry, Journal, Goals, Progress, themes and navigation.
- Screenshots were inspected in light/dark themes at desktop and mobile sizes;
  responsive checks cover 1920, 768, 390 and 320 pixels. The initial review led
  to wider icon-label space and denser desktop measurement rows. Artifacts are
  retained under `.artifacts/phase-6d/`.

- Final browser run (2026-09-23): `npm run test:browser -- --workers=4
  --output=../../.artifacts/phase-6d` passed all 160 tests across desktop/mobile
  and light/dark themes in 2.5 minutes, exiting normally with code 0.
  The initial sandboxed run passed all 160 tests but stalled during teardown and
  was interrupted; the rerun outside the sandbox completed cleanly.
