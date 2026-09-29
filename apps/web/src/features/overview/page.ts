import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import type {
  ActivityListResponse,
  GoalOverviewResponse,
  GoalOverviewItem,
} from '@activus/contracts';
import {
  configurationApi,
  type JournalApi,
  type ActivityApi,
  type GoalOverviewApi,
} from '../../services/configuration-api.js';
import { onRestoredPage } from '../../routes/restored-page.js';
import { goalStyles } from '../goals/styles.js';
import {
  duration,
  exactNumber,
  journalDate,
  measurementText,
} from '../journal/format.js';
import { readError } from '../journal/presentation.js';
import { journalPath } from '../journal/state.js';
import { activityIcon } from '../activity-kinds/icons.js';
import { currentMonth, previousMonth, monthSummary } from './data.js';

type Section<T> = { data?: T; error?: unknown; loading: boolean };
export class OverviewPage extends LitElement {
  static override properties = {
    api: { attribute: false },
    recent: { state: true },
    goals: { state: true },
    month: { state: true },
    priorMonth: { state: true },
    period: { state: true },
  };
  api: Pick<JournalApi, 'listActivities'> &
    Pick<ActivityApi, 'getActivity'> &
    Pick<GoalOverviewApi, 'overviewGoals'> = configurationApi;
  private recent: Section<ActivityListResponse> = { loading: true };
  private goals: Section<GoalOverviewResponse> = { loading: true };
  private month: Section<Awaited<ReturnType<typeof monthSummary>>> = {
    loading: true,
  };
  private priorMonth: Section<Awaited<ReturnType<typeof monthSummary>>> = {
    loading: true,
  };
  private priorPeriod = previousMonth();
  private period = currentMonth();
  private controller?: AbortController;
  private stopRestored?: () => void;

  override connectedCallback() {
    super.connectedCallback();
    this.stopRestored = onRestoredPage(() => void this.load());
  }
  override disconnectedCallback() {
    this.controller?.abort();
    this.stopRestored?.();
    super.disconnectedCallback();
  }
  protected override updated(changed: PropertyValues) {
    if (changed.has('api')) void this.load();
  }
  private async load() {
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    const now = new Date();
    this.period = currentMonth(now);
    this.priorPeriod = previousMonth(now);
    this.priorMonth = { loading: true };
    this.recent = { loading: true };
    this.goals = { loading: true };
    this.month = { loading: true };
    const read = async <T>(
      request: () => Promise<T>,
      set: (value: Section<T>) => void,
    ) => {
      try {
        const data = await request();
        if (!controller.signal.aborted) set({ data, loading: false });
      } catch (error) {
        if (!controller.signal.aborted) set({ error, loading: false });
      }
    };
    await Promise.all([
      read(
        () => monthSummary(this.api, this.priorPeriod, controller.signal),
        (value) => {
          this.priorMonth = value;
        },
      ),
      read(
        () =>
          this.api.listActivities({ limit: 5, offset: 0 }, controller.signal),
        (value) => {
          this.recent = value;
        },
      ),
      read(
        () =>
          this.api.overviewGoals({ lifecycle: 'active' }, controller.signal),
        (value) => {
          this.goals = value;
        },
      ),
      read(
        () => monthSummary(this.api, this.period, controller.signal),
        (value) => {
          this.month = value;
        },
      ),
    ]);
  }
  private status(section: Section<unknown>, name: string) {
    return section.loading
      ? html`<p role="status">Loading ${name}…</p>`
      : section.error
        ? html`${readError(section.error)}<button @click=${this.load}>
              Retry ${name}
            </button>`
        : nothing;
  }
  private goalProgress(item: GoalOverviewItem) {
    const progress =
      item.progress?.scheduleMode === 'fixed'
        ? item.progress
        : item.progress?.currentPeriod;
    if (!progress || item.displayCurrent === null)
      return html`<p class="muted">Progress unavailable</p>`;
    const isDuration =
      item.goal.targetType === 'total_duration' ||
      item.unitSymbol === 'h / min';
    const format = (value: string) =>
      isDuration
        ? duration(Number(value))
        : exactNumber(value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));
    const unit =
      item.goal.targetType === 'activity_count'
        ? 'activities'
        : isDuration
          ? ''
          : (item.unitSymbol ?? '');
    return html`<p class="numeric">
        ${format(item.displayCurrent)} of ${format(item.displayTarget)}
        ${unit}${progress.achieved ? ' · Reached' : ''}
      </p>
      ${item.goal.scheduleMode === 'recurring' ? html`<p class="muted">This ${item.goal.recurrencePeriod}</p>` : nothing}`;
  }
  private monthCard(
    section: Section<Awaited<ReturnType<typeof monthSummary>>>,
    period: ReturnType<typeof currentMonth>,
    prior: boolean,
  ) {
    const summary = section.data;
    const headingId = prior ? 'prior-month-heading' : 'month-heading';
    return html`
      <section class="month-card" aria-labelledby=${headingId}>
        <div class="section-heading">
          <div>
            <p class="eyebrow">${prior ? 'Previous month' : 'Month so far'}</p>
            <h2 id=${headingId}>${period.label}</h2>
          </div>
          <a href=${journalPath(period)}>View month</a>
        </div>
        ${this.status(section, 'month summary')}
        ${
          summary
            ? html`
                <dl class="highlights">
                  <div>
                    <dt>${activityIcon('footprints')} Walking</dt>
                    <dd>
                      ${summary.walkingCount && summary.missingWalkingDistance === summary.walkingCount ? 'Not recorded' : `${(summary.walkingMetres / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km`}
                    </dd>
                  </div>
                  <div>
                    <dt>${activityIcon('dumbbell')} Strength training</dt>
                    <dd>
                      ${summary.strengthCount && summary.missingStrengthDuration === summary.strengthCount ? 'Not recorded' : duration(summary.strengthSeconds)}
                    </dd>
                  </div>
                </dl>
                ${summary.missingWalkingDistance ? html`<p class="muted">${summary.missingWalkingDistance} walking activities have no recorded distance.</p>` : nothing}
                <dl class="totals">
                  <div>
                    <dt>Activities</dt>
                    <dd>${summary.count.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Recorded duration</dt>
                    <dd>
                      ${summary.count > 0 && summary.missingDuration === summary.count ? 'Not recorded' : duration(summary.durationSeconds)}
                    </dd>
                  </div>
                </dl>
                ${!summary.count ? html`<p class="muted">No activities recorded for this month.</p>` : nothing}
                ${summary.missingDuration ? html`<p class="muted">${summary.missingDuration} ${summary.missingDuration === 1 ? 'activity has' : 'activities have'} no recorded duration.</p>` : nothing}
                ${summary.partial ? html`<p class="muted">Includes ${summary.partial} ${summary.partial === 1 ? 'partial activity' : 'partial activities'}.</p>` : nothing}
                <ul class="breakdown" aria-label="Activities by kind">
                  ${summary.kinds.map(
                    (kind) =>
                      html`<li>
                        <a
                          href=${journalPath({ ...period, activityKindId: kind.id })}
                          ><span
                            class="kind-icon"
                            style=${`color: ${kind.color}`}
                            >${activityIcon(kind.iconName)}</span
                          >${kind.name}</a
                        ><span class="numeric">${kind.count}</span>
                      </li>`,
                  )}
                </ul>
              `
            : nothing
        }
      </section>
    `;
  }
  override render() {
    return html`
      <header>
        <div>
          <h1>Overview</h1>
          <p class="muted">
            Your recent activity and what you’re working toward.
          </p>
        </div>
        <a class="primary" href="/activities/new">New activity</a>
      </header>
      <div class="month-panels">
        ${this.monthCard(this.month, this.period, false)}${this.monthCard(this.priorMonth, this.priorPeriod, true)}
      </div>
      <div class="columns">
        <section aria-labelledby="recent-heading">
          <div class="section-heading">
            <h2 id="recent-heading">Recent activities</h2>
            <a href="/activities">View journal</a>
          </div>
          ${this.status(this.recent, 'recent activities')}
          ${
            this.recent.data
              ? this.recent.data.items.length
                ? html`<ul>
                    ${this.recent.data.items.map(
                      (item) =>
                        html`<li class="entry">
                          <a class="title" href=${`/activities/${item.id}`}
                            ><span
                              class="kind-icon"
                              style=${`color: ${item.kind.color}`}
                              >${activityIcon(item.kind.iconName)}</span
                            >${item.name ?? item.kind.name}</a
                          >
                          <p class="muted">
                            ${journalDate(item.activityDate)} ·
                            ${item.kind.name}${item.variant ? ` · ${item.variant.name}` : ''}
                          </p>
                          <p>
                            ${item.durationSeconds === null ? 'Duration not recorded' : duration(item.durationSeconds)}${item.isPartial ? ' · Partial' : ''}
                          </p>
                          ${item.primaryMeasurement ? html`<p>${item.primaryMeasurement.name}: ${measurementText(item.primaryMeasurement).text}</p>` : nothing}
                        </li>`,
                    )}
                  </ul>`
                : html`<p>
                      No activities yet. Record an activity to start your
                      journal.
                    </p>
                    <a href="/activity-kinds">Manage activity kinds</a>`
              : nothing
          }
        </section>
        <section aria-labelledby="goals-heading">
          <div class="section-heading">
            <h2 id="goals-heading">Active goals</h2>
            <a href="/goals">View goals</a>
          </div>
          ${this.status(this.goals, 'active goals')}
          ${
            this.goals.data
              ? this.goals.data.items.length
                ? html`<ul>
                      ${this.goals.data.items.slice(0, 5).map(
                        (item) =>
                          html`<li class="entry">
                            <a
                              class="title"
                              href=${`/goals/${item.goal.id}?view=active`}
                              >${item.goal.name}</a
                            >
                            <p class="muted">
                              ${item.kindName}${item.variantName ? ` · ${item.variantName}` : ''}
                            </p>
                            ${this.goalProgress(item)}
                          </li>`,
                      )}
                    </ul>
                    ${this.goals.data.items.length > 5 ? html`<p class="muted">Showing 5 of ${this.goals.data.items.length} active goals.</p>` : nothing}`
                : html`<p>No active goals right now.</p>
                    <a href="/goals/new">Create goal</a>`
              : nothing
          }
        </section>
      </div>
      <section aria-labelledby="records-heading">
        <h2 id="records-heading">Personal records</h2>
        <p class="muted">
          Personal records are not available yet. Your recorded measurements are
          available in the journal.
        </p>
      </section>
    `;
  }
  static override styles = [
    ...goalStyles,
    css`
      .month-panels {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-5);
        margin-bottom: var(--space-6);
      }
      .month-card {
        padding: var(--space-5);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background: var(--color-surface);
      }
      .month-card:first-child {
        border-top: 3px solid var(--color-primary);
      }
      .eyebrow {
        margin: 0 0 var(--space-2);
        color: var(--color-text-muted);
        font-size: var(--font-size-small);
      }
      .highlights {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-4);
        padding-block: var(--space-4);
      }
      .highlights dt,
      .breakdown a {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .highlights dt svg {
        flex-shrink: 0;
        color: var(--color-primary);
      }
      .highlights dd {
        font-size: var(--font-size-page-title);
        font-weight: 650;
        overflow-wrap: anywhere;
      }
      .kind-icon {
        display: inline-flex;
        flex-shrink: 0;
        margin-right: var(--space-2);
      }
      section {
        padding-block: var(--space-5);
        border-top: 1px solid var(--color-border);
        min-width: 0;
      }
      .section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      h2 {
        margin: 0;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .columns {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
        gap: var(--space-7);
      }
      .entry {
        padding-block: var(--space-4);
        border-bottom: 1px solid var(--color-border);
      }
      .entry:last-child {
        border-bottom: 0;
      }
      .title {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .totals {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-5) var(--space-7);
        margin-block: var(--space-5);
      }
      dt {
        color: var(--color-text-muted);
      }
      dd {
        margin: var(--space-2) 0 0;
        font-size: var(--font-size-component-title);
        font-variant-numeric: tabular-nums;
      }
      .breakdown {
        max-width: 520px;
      }
      .breakdown li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .breakdown a {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      @media (max-width: 700px) {
        .month-panels,
        .columns {
          grid-template-columns: minmax(0, 1fr);
          gap: 0;
        }
      }
    `,
  ];
}
customElements.define('overview-page', OverviewPage);
