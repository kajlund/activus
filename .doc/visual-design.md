# Activus Visual Design

Status: Approved foundation; component details evolve during implementation  
Last updated: 2026-09-08

## Purpose

Activus is a personal training journal that records activities, supports user-defined goals, and makes long-term progress understandable.

The product should feel like a beautifully maintained training notebook with excellent charts. It may motivate through evidence of progress, but it is not a coaching tool and should not prescribe training.

## Product personality

Activus is:

- Calm and personal
- Structured without feeling administrative
- Motivating through visible evidence
- Useful across months and years
- Precise without feeling clinical

Activus is not:

- A coach
- A social fitness network
- A gamified streak tracker
- A source of guilt or pressure
- A dense business dashboard

## Design principles

### Journal first

Activities are personal records, not assignments. Recording and reviewing training history are the foundation of the experience.

### Progress without pressure

Show trends, consistency, milestones, and personal bests without streak anxiety or judgmental language. A missed goal is normally neutral information, not an error.

### Motivation through evidence

Use the user's own history to make improvement visible. Avoid generic encouragement, celebration effects, and invented performance scores.

### User-defined intent

Goals are reference points created and controlled by the user. Activus does not prescribe what the user should do next.

### Calm by default

Use warm neutral surfaces, generous spacing, restrained colour, and clear typography. Stronger colour is reserved for meaningful progress and actions.

### Historical continuity

Make older activities, periods, and comparisons pleasant to browse. The application should not over-focus on today.

## Voice and terminology

The interface voice is concise, factual, and non-judgmental.

| Prefer | Avoid |
| --- | --- |
| Goal | Plan or assignment |
| Progress | Performance score |
| Recent activity | Today's assignment |
| Personal best | Achievement challenge |
| Current pace | Expected pace |
| Record activity | Start workout |
| Notes or reflection | Coach feedback |

Avoid phrases such as "You should train today," "You're falling behind," and "Try increasing your distance." Prefer descriptions of recorded facts and user-selected targets.

## Brand identity

The Activus icon uses a deep-purple shield containing a sharp activity pulse. Its dominant peak forms the letter A, and the trace ends as an upward lime arrow. This preserves the original application's energetic shield identity while reducing it to one legible symbol. Do not add literal athletes, hearts, stopwatches, targets, charts, or other secondary pictograms inside the mark.

Use the full app icon for launchers, installable-app artwork, and prominent product identity. For very small UI placements, use the simplified mark and verify legibility at 16, 24, and 32 pixels.

Interface icons should use Lucide with a consistent stroke between 1.75 and 2 pixels. Use labels beside unfamiliar icons. Filled icons are reserved for selected navigation or important states.

## Colour system

### Light theme

| Token | Value | Purpose |
| --- | --- | --- |
| `--color-bg` | `#F7F5EF` | Warm application background |
| `--color-surface` | `#FFFFFF` | Forms, dialogs, and raised areas |
| `--color-surface-subtle` | `#EFF2EB` | Grouped sections and selected rows |
| `--color-text` | `#1C2723` | Primary text |
| `--color-text-muted` | `#66716C` | Metadata and secondary labels |
| `--color-border` | `#D9DED7` | Subtle content dividers |
| `--color-control-border` | `#858E88` | Form-control boundaries with at least 3:1 contrast |
| `--color-primary` | `#67318F` | Primary actions and active navigation |
| `--color-primary-hover` | `#512372` | Hover and pressed emphasis |
| `--color-primary-soft` | `#EEE7F4` | Selected states and subtle progress areas |
| `--color-progress` | `#9BCB3B` | Positive progress and completed targets |
| `--color-focus` | `#3182A8` | Keyboard focus ring |

The warm background establishes the journal character. Deep purple carries the Activus identity, while lime is reserved for measured energy and progress. Pure white is reserved for places where visual separation is useful rather than used across the entire interface.

### Dark theme

| Token | Value | Purpose |
| --- | --- | --- |
| `--color-bg` | `#17121C` | Main background |
| `--color-surface` | `#211A29` | Primary surface |
| `--color-surface-subtle` | `#2B2235` | Grouped and selected regions |
| `--color-text` | `#F3EFF5` | Primary text |
| `--color-text-muted` | `#B6ACBC` | Secondary text |
| `--color-border` | `#44384D` | Subtle content dividers |
| `--color-control-border` | `#8C7E98` | Form-control boundaries with at least 3:1 contrast |
| `--color-primary` | `#B88ADB` | Actions and active navigation |
| `--color-primary-hover` | `#CBA5E5` | Hover emphasis |
| `--color-primary-soft` | `#412D51` | Selected states |
| `--color-progress` | `#AED65A` | Progress and completed targets |
| `--color-focus` | `#75C8EC` | Keyboard focus ring |

Dark surfaces retain a subtle aubergine character rather than simply inverting the light theme.

### Semantic colours

| Meaning | Light | Dark | Example |
| --- | --- | --- | --- |
| Success | `#387E55` | `#76C793` | Successful system operation |
| Caution | `#A76A16` | `#E0A64D` | Goal period nearly over |
| Error | `#B34343` | `#ED8585` | Invalid activity entry |
| Information | `#39799C` | `#74B9DD` | Import or system message |

Semantic colour must be paired with an icon or text label. Red is reserved for genuine errors, destructive actions, and exceptional health-related flags. Missing a goal is not automatically an error.

### Chart palette

| Sequence | Light | Dark |
| --- | --- | --- |
| 1 | `#67318F` | `#B88ADB` |
| 2 | `#527FA5` | `#82B3DC` |
| 3 | `#A66B3F` | `#D79B70` |
| 4 | `#8069A5` | `#B19ADA` |
| 5 | `#9A7650` | `#CEAA80` |
| 6 | `#A15467` | `#D98BA0` |

Chart guidance:

- Use primary purple for the current or most important series.
- Use muted grey for historical comparisons.
- Limit a chart to four coloured series where possible.
- Use dots, line styles, or direct labels when series must remain distinguishable without colour.
- Render goals as dashed reference lines rather than normal data series.
- Avoid red-versus-green comparisons.
- Do not use decorative charts that do not answer a clear question.

## Typography

Use Manrope throughout the interface with system fonts as fallback.

```css
font-family:
  "Manrope",
  system-ui,
  -apple-system,
  "Segoe UI",
  sans-serif;
font-variant-numeric: tabular-nums;
```

| Style | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Display | `32px / 40px` | 650–700 | Major progress statement |
| Page title | `26px / 34px` | 650 | Screen headings |
| Section title | `20px / 28px` | 650 | Main sections |
| Component title | `16px / 24px` | 600 | Activity and goal names |
| Body | `15px / 23px` | 400 | Normal interface text |
| Small | `13px / 19px` | 500 | Dates, units, and metadata |
| Metric | `28px / 34px` | 650 | Important measured values |

Typography guidance:

- Use sentence case throughout.
- Avoid all-capital headings.
- Do not make every statistic oversized.
- Display units beside values.
- Use tabular numerals for duration, distance, repetitions, and chart axes.
- Prefer readable values such as `1 h 24 min` over compact forms such as `1:24h`.

## Shape and spacing

```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 16px;
--radius-pill: 999px;

--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 48px;
--space-8: 64px;
```

Use `10px` as the normal control radius and `16px` for substantial grouped surfaces. Pills are limited to tags, activity kinds, compact filters, and true status labels.

## Elevation

```css
--shadow-sm: 0 1px 2px rgb(20 35 29 / 7%);
--shadow-md: 0 8px 24px rgb(20 35 29 / 10%);
```

- Prefer spacing, grouping, alignment, and surface colour over shadows.
- Use separators for lists rather than turning each row into a card.
- Normal content regions require no shadow.
- Dialogs and floating menus may use `--shadow-md`.
- Hover states should change colour before adding elevation.
- Avoid cards nested inside other cards.

## Motion

```css
--duration-fast: 120ms;
--duration-normal: 200ms;
--duration-chart: 350ms;
--ease-standard: cubic-bezier(.2, 0, 0, 1);
```

Motion should confirm actions rather than manufacture excitement. Use subtle transitions for selection, navigation, and chart changes. Avoid celebration animations, bouncing controls, streak effects, or persistent pulsing. Respect `prefers-reduced-motion`.

## Accessibility requirements

- Target WCAG 2.2 AA contrast for text and controls.
- Provide a clearly visible keyboard focus state using `--color-focus`.
- Do not communicate status or chart meaning through colour alone.
- Provide textual summaries for meaningful charts.
- Keep pointer targets at least 44 by 44 pixels where practical.
- Associate units and validation messages programmatically with their fields.
- Preserve usable zoom and responsive reflow.
- Test both themes independently rather than assuming token symmetry.

## Implementation relationship

This document records the design intent and explains why decisions exist. Implementation tokens should live in the client code, for example:

```text
apps/web/src/styles/tokens.css
```

The executable tokens are the implementation source of truth. When a token changes, update both the CSS and this document in the same change.

The app icon should be stored with other public product assets, for example:

```text
apps/web/public/icons/activus.svg
```

## Information architecture

### Primary navigation

| Section | Purpose |
| --- | --- |
| Overview | Recent activity, current goals, and meaningful progress |
| Activities | Search, browse, record, view, and edit activities |
| Goals | Create goals and follow their progress |
| Progress | Explore trends, comparisons, totals, and personal bests |
| Activity kinds | Configure activity kinds, variants, and measurements |
| Settings | Theme, units, import/export, and application preferences |

`Record activity` is a persistent global action, not another navigation destination.

Desktop uses a restrained, optionally collapsible left sidebar. Do not default to icon-only navigation. Tablet and mobile use a compact top bar and navigation drawer. Charts must simplify, reflow, or scroll rather than shrink into illegibility.

The three main information roles remain distinct:

- Overview answers: What matters now?
- Activities answers: What did I record?
- Progress answers: What has changed over time?

## Overview

The Overview screen contains four ordered areas:

1. A coherent current-period summary: activity count, total duration, an appropriate primary measurement, and a neutral previous-period comparison.
2. Up to three current goals with links to all goals.
3. A compact, date-grouped recent-activity journal.
4. One factual progress observation or personal-best highlight when sufficient data exists.

Avoid a grid of unrelated metric cards. On mobile the same four areas stack in that order.

New-installation empty state:

> **Your training journal starts here**  
> Record your first activity to begin building your history.

Primary action: `Record activity`.

## Recording and editing activities

Activity entry uses a focused page-level form at `/activities/new` and `/activities/:id/edit`, as explicitly selected in Phase 3D. It reflows on mobile. All entry points open the same workflow.

Default form order:

1. Activity kind
2. Optional variant, when the kind defines variants
3. Date and optional start time
4. Optional activity name
5. Core measurements
6. Notes

Less frequently used fields may appear under `More details`, including exact time, effort, feeling, location, external reference, and additional measurements.

Activity kind and date are always required. Normal-entry requirements come from measurement definitions, but historical imports may contain partial records. Validate impossible values as errors and unusual values as warnings. Display validation beside the affected field.

Editing uses the same form. Changing activity kind retains compatible values and explicitly identifies incompatible values before removal. Never silently discard recorded data. Deletion is secondary and requires confirmation containing the activity date and name or kind.

## Activity kinds, variants, and tags

- **Activity kind:** What activity was performed, such as Walking or Cycling.
- **Variant:** In what meaningful form or environment it was performed, such as Treadmill or Outdoor.
- **Tag:** An optional cross-cutting label, such as Commute, Recovery, or With dog.

Use a separate kind when the activity itself changes. Use a variant when the same activity is performed in a meaningfully different form or environment. Use structured variants instead of tags for distinctions that must report reliably.

Examples:

| Activity kind | Variants |
| --- | --- |
| Walking | Outdoor, Treadmill, Indoor track |
| Running | Road, Trail, Treadmill |
| Cycling | Outdoor, Indoor trainer, Exercise bike |
| Swimming | Pool, Open water |

Each kind defines a name, icon, chart colour, display order, primary measurement, measurement definitions, and active or archived status. A variant may add or hide a small number of measurements, but normally inherits its parent kind's measurements. If variants require fundamentally different data, reconsider whether they are separate kinds.

Kinds and variants with historical activities are archived rather than deleted. Archived definitions remain visible in history but disappear from normal new-entry selectors.

## Measurements

Supported definition types are decimal, integer, duration, rating, Boolean, and short text. Numeric definitions include unit, precision, requirement level, valid range, aggregation method, and personal-best direction.

Aggregation methods are total, average, latest, minimum, and none. Personal-best behaviour is highest value, lowest value, or disabled.

Common activity fields include date, optional start time, optional duration, optional name, notes, effort, and feeling. Kind-specific measurements include distance, elevation, steps, laps, repetitions, and load.

Store numeric values in canonical units and convert for display. Never store formatted values such as `12.4 km`. Once historical values exist, lock a measurement's fundamental type and meaning; archive and replace it instead of reinterpreting data.

## Goals

A goal combines scope, target, and inclusive start/end dates. Phase 4 supports:

1. Cumulative measurement during a period
2. Matching activity count during a period
3. Total recorded duration

Goal scope requires one activity kind, with an optional exact variant and match-all required tags. Fixed goals apply one target across the range. Recurring goals apply the target to each ISO Monday-start week, calendar month or calendar year, clipping first and last periods to the goal dates.

Lifecycle is upcoming, active, ended or archived; achievement remains a separate fact. Lifecycle uses the UTC calendar date. Progress is calculated from activities rather than stored as mutable state. Correcting history therefore recalculates affected goals.

Show name, scope, current and target values, remaining amount, progress and dates. The accessible progress bar visually stops at 100 percent while the value may exceed the target. Recurring detail uses textual period rows and a qualifying-activity list. Avoid forecasts or labels such as `behind` or `off track`.

Non-archived goals remain editable. Material scope, target or schedule changes require recalculation confirmation; equivalent values and name/description-only changes do not. Archived references keep their real labels and are not offered as new selections. Archive preserves readable history; restore conflicts explain the unavailable reference.

Activity detail includes a compact **Counts toward goals** section with linked names and schedule/date context, selecting the activity's recurring period. Empty results omit the section. A secondary read failure leaves activity content available with a small retry. **Refresh goal** refreshes all derived detail sections; returning from edit or browser document restoration also obtains current data. Existing theme tokens, focus styles and native links/buttons are reused.

## Progress

Progress contains Trends, Compare, and Personal bests views.

Shared filters include date range, activity kind, variant, measurement, and grouping interval. Variant appears only when the selected kind defines variants. Represent filter state in the URL so views are bookmarkable.

| Period | Default grouping |
| --- | --- |
| Up to 31 days | Day |
| Up to 6 months | Week |
| Up to 2 years | Month |
| Longer | Year |

Trends include a factual summary, one primary chart, a period breakdown, and an optional equivalent-period comparison. Use bars for totals and counts, lines for averages and latest values, and points for individual-activity distributions. Avoid pie charts.

Compare supports aligned period comparisons and variant comparisons. Do not initially compare unrelated measurements with incompatible units.

Personal bests are useful records rather than trophies. Group them by activity kind and measurement and link each record to its source activity. Only calculate records for definitions explicitly configured for personal bests.

Every meaningful chart has an accessible textual summary and compact data table. Distinguish true zeroes from missing observations, visibly mark incomplete periods, and avoid drawing misleading trends from sparse data.

Factual observations must state the calculation, link to the relevant filtered view, require sufficient data, avoid causal claims, and never become training advice.

## Details to refine during implementation

- Exact responsive breakpoints
- Activity-list density and historical browsing controls
- Component states and form interaction details
- Chart-library-specific rendering details
- Empty, loading, validation, and error states
- Import and export interface after the core model is stable

## Decision log

### 2026-09-05

- Chose a calm personal training journal as the primary personality.
- Added a restrained motivating performance layer based on visible evidence.
- Explicitly rejected coaching language and prescriptive behaviour.
- Selected warm off-white, deep Activus purple, and restrained lime as the colour foundation.
- Selected Manrope as the interface typeface.
- Selected Lucide as the interface icon family.
- Established initial light theme, dark theme, semantic, chart, spacing, shape, elevation, and motion tokens.
- Selected the sharp pulse shield as the app icon: an activity trace forms the letter A and ends as upward progress.


### 2026-09-08 - Phase 3F hardening

- Added a separate control-border token after measuring insufficient non-text contrast when the subtle divider token was used for fields. The approved brand and surface palette is unchanged.
- Aligned the entry presentation with the explicitly accepted Phase 3D page-level form.
- Use the existing primary-hover colour for selected navigation and default badges on primary-soft backgrounds, and normal text for archived badges. The previous combinations failed automated text-contrast checks.
