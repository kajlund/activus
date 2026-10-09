# Progress v1

`/progress/trends` now uses `GET /api/v1/progress`. The endpoint returns filter
choices, definition-specific metrics, summaries, comparison dates, bucketed
trends and up to six personal records in one repeatable-read snapshot. Queries
are parameterized and PostgreSQL performs the numeric aggregation. No migration,
chart dependency, cache, summary table or background job was added.

## Calendar and aggregation

- Default: last 12 months. Also supports last 30 days, last 3 months, this year,
  previous year, all time and an inclusive custom date range.
- Today uses Europe/Helsinki; stored activity dates remain authoritative.
  Calendar arithmetic uses UTC date-only operations to avoid DST and host
  timezone changes. Weeks begin Monday.
- Thirty-day and custom ranges compare with the immediately preceding equal
  number of dates. Rolling month ranges compare with the preceding calendar
  month span. This year compares with the same elapsed dates last year, clamping
  leap day to February 28. Previous year compares with the preceding full year.
  All time has no comparison; ranges predating year 1 have none either.
- Automatic day buckets through 45 days, week through 180 days, month through
  1461 days, and year thereafter. Boundary buckets are clipped to the selection.
- Counts include every matching activity. Duration sums only recorded seconds.
  Numeric definition metrics use total, average, latest or minimum. Missing
  values remain null; recorded zeros remain zero. Latest uses journal ordering.
  Definitions with no aggregation and boolean/text definitions are excluded.
- Definitions stay separate across kinds and variants, even when labels or units
  match. Archived configuration remains labelled and available for history.
  A configured primary metric is preferred; duration/count are fallbacks.
- Canonical values remain decimal strings. Display conversion reuses existing
  exact decimal/unit utilities. Only chart geometry uses floating-point values.
  Comparisons are unavailable for absent or nonpositive previous values.

## Records and interaction

There was no existing record calculator or endpoint. The implementation uses
the existing `personalBestDirection` eligibility and highest/lowest metadata.
Records are all-time within the selected kind/variant scope. Equal values choose
the earliest date, then start time (unknown last), creation time and ID. Each
record links to its source activity; ineligible definitions never become records.

The page uses existing compact controls and theme tokens, bars for totals and
lines for other aggregates, with an expandable exact-value table. Loading,
errors/retry, empty periods, absent measurements and absent records are distinct.
Filter state is retained in the URL. Requests are cancelled on replacement or
disconnect and stale results are ignored. Browser document restoration refreshes
the response. No browser automation was added.

Deliberate limits: automatic grouping only, six records in configuration order,
and no cross-definition combined metrics. The chart uses canonical units, stated
beside it; the table and summaries use configured display units.

## Verification

- Three focused PostgreSQL tests passed against the guarded test database:
  missing/zero measurements and averages, kind/variant scope and aggregation,
  and eligible highest/lowest records with ties and source IDs. Route validation
  and the snapshot endpoint are exercised within the scope test.
- The calendar/comparison test and seven existing app tests passed.
- One Lit test passed for stale-request protection and the chart data table.
- Workspace typecheck, production build, scoped ESLint, changed-file Prettier
  and `git diff --check` passed.
- No browser automation or visual screenshot verification was performed.
