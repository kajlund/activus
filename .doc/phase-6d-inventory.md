# Phase 6D inventory (before implementation)

Inspected ActivityKindsPage, KindForm, VariantForm, MeasurementSection,
MeasurementForm/fields, TagsPage/TagForm, app-shell Settings, configuration API,
existing browser/unit tests and Phase 5 import documentation.

- Activity kinds: ordered list and detail, create/edit name, six searchable icons,
  palette or custom hex colour, non-negative sort order; include archived filter,
  archive/restore confirmation. No delete. No overview measurement/variant counts
  in the kind response; do not add per-kind requests for decorative counts.
- Variants: fixed owning kind, name, sort order, transactional single default,
  archive/restore. Archiving clears default; restoring does not reinstate it.
  Archived parents prevent adding/restoring variants and selecting defaults.
  Variant measurement links preserve the existing query-string deep link.
- Measurements: parent definitions apply to every variant; variant-specific
  definitions are additive. Inherited rows link to parent editing. Types are
  decimal, integer, duration, rating, yes/no and short text. Dynamic compatible
  units, canonical/display conversion, precision, optional bounds, required flag,
  aggregation, comparison direction and sort order all exist. Rating permits
  1–5 or 1–10 and cannot total. Boolean/text have no numeric reporting settings.
  Only eligible active numeric parent measurements can be primary; primary must
  be cleared before archival. History locks type/dimension/precision/bounds, with
  a recovery action that retains permitted edits. Type changes require confirmation
  before discarding non-default settings. Archive/restore preserves recorded values.
- Common activity duration already exists; Phase 6A consolidates exact generic
  Duration aliases in entry while retaining historical values. Specialised duration
  measurements remain supported. No migration or data cleanup is appropriate.
- Settings: two real configuration destinations, activity kinds/measurements and
  tags. Theme is already in the application header. No unit preferences, account,
  notification or import/export controls exist. Tags support search, colour,
  create/edit and confirmed archival/restoration, preserving historical assignments.
- Legacy import exists only as `npm run import:legacy` (Phase 5 CLI), with preview,
  explicit apply stages, reviewed mappings, checksums/fingerprints, identity ledger,
  transaction guards and redacted reports. There is no web import/export API or UI.
  Preserve the CLI and its safeguards without adding an upload or export facade.
- Existing route guards, dirty dismissal, focus trapping/restoration, errors with
  request IDs, pending guards and abort/stale-response protection must remain.

Implementation scope: scoped configuration styling, direct labelled actions,
editorial headings, responsive metadata and grouped forms; Settings navigation
and tags alignment. Shared shell, tokens, existing native controls/dialogs and
domain services remain the source of truth. No schema, API or import changes.
