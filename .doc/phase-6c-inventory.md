# Phase 6C inventory (before implementation)

Goals routes: /goals, /goals/new, /goals/:id and /goals/:id/edit. The view query selects active, upcoming, ended or archived. Reached is calculated progress, not a separate lifecycle or a manual Complete action.

Targets: activity count, total duration (canonical seconds), or a total-aggregated numeric measurement (canonical unit). Scope includes one kind, optional variant and all selected tags. Schedules are fixed or recurring calendar week/month/year; inclusive start/end dates clip boundary periods.

Overview: accurate returned count and hasGoals distinguish true-empty from lifecycle-empty. Real current/target values and capped progress bars, recurring completed-period totals, explicit Edit/Archive or Restore actions. Archive is confirmed and preserves history; restore selects its resulting lifecycle. Loading/error/retry and browser-document restoration exist.

Detail: current/remaining progress, scope and dates, archived-reference warning, recurring period history with pagination, selected period in URL, qualifying activities (including null contributions), activity links with return context, independent period/activity retries, refresh, edit, archive and restore. No goal deletion or manual completion.

Forms: name, description, kind, variant, tags, target type/value, duration hours/minutes, measurement, schedule/recurrence and dates. Current form displays irrelevant target and schedule controls simultaneously; native required target value can block duration creation. Typed values reside in persistent form controls. Existing dirty-navigation/discard confirmation, duplicate-submit guard, recalculation confirmation, archived stored-reference retention, server validation, save failures and safe return routes must remain intact.

Progress: /progress/trends currently renders only the shell's planned-section placeholder. No Progress component, periods, metrics, trends, charts, personal-record model/API, record grouping or record source links are implemented. Goal progress is implemented within Goals. Phase 6C will align the Progress placeholder honestly; it will not invent analytics, records or unsupported period controls.

Reuse: Phase 6A semantic tokens and managementStyles controls, journalStyles dialog/field foundations, journal date/duration/exact-number formatting, existing goal presentation helpers and focus trap. A compact always-visible form is preferable to an accordion for these related fields; no changes to the activity editor or journal are needed.

Existing coverage: goals.test.ts, goal-detail.test.ts and goal-edit.test.ts cover lifecycle routes, calculations/presentation, pagination, stale responses, failures, archived references and confirmations. No dedicated Goals browser suite currently exists. The Phase 6A/6B browser suites cover shared navigation, editor and journal.
