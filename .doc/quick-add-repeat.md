# Quick Add and Repeat Activity

Journal inline actions now include **Repeat activity**. A compact native dialog
defaults to empty values, offers explicit duration/measurement copying and shows
an unchecked Copy notes option only when notes exist. Confirmation opens the
normal `/activities/new` editor. The source ID may appear in the route; copy
options are handed over once in memory. Notes and activity payloads are never
stored in navigation state, local storage or URLs.

New Activity offers up to five deduplicated active setups from the latest 30
Journal entries. Choices use kind, variant and normalized name, in Journal
recency order. Quick Add uses the same initializer with values and notes empty.
Start blank is always available; replacing an edited draft asks before clearing
unsaved changes. Existing accordion structure and theme styles remain in use.

The pure mapper in `features/activities/repeat.ts` copies active kind/variant and
name, resets the date to today in Europe/Helsinki, and clears start time, effort,
feeling and tags. Duration, measurements and notes are empty unless explicitly
requested. IDs, timestamps, import lineage, partial status and historical links
are never part of its draft. Normal create validation supplies a new independent
activity; no repeat endpoint, database relationship or migration was added.

Current effective definitions determine fields and validate copied canonical
values. Incompatible or archived measurements are omitted with named warnings.
Compatible copied values retain exact canonical inputs while their unchanged
display text may be rounded, matching the existing editor's historical numeric
handling. Editing a value returns it to normal input parsing. Required values
remain required, including when repeating an imported partial record.

Archived/unavailable kinds leave the kind unselected. An unavailable source
variant requires choosing an active variant or explicitly confirming No variant.
Nothing is silently substituted or reactivated. Failed initialization can be
retried or cleared with Start blank; stale requests cannot replace newer setup.

Principal files: the existing activity editor, `values.ts`, the new repeat mapper
and dialog, and Journal `entry-details.ts`. The default blank activity date now
also uses Helsinki, consistent with the editor's existing Helsinki start time.

Deliberate limits: pinning is deferred; recent choices are bounded to 30 entries,
so fewer than five distinct choices may appear. Reloading a Repeat URL uses safe
empty-value defaults rather than persisting permission to copy historical values
or notes. No browser automation was added.

## Verification

- Five focused tests cover safe reset/Helsinki dates, deliberate value and note
  copying with exact canonical values, archived/changed configuration, the dialog
  and independent normal create path, and deduplication plus Quick Add/Start blank.
- Those tests and the existing activity-entry and Journal suites passed: 79 tests.
- Workspace typecheck and production build passed, alongside scoped ESLint,
  changed-file Prettier and `git diff --check`.
- No browser automation or screenshot verification was performed.
