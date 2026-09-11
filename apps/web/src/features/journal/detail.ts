import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import type { Activity, ActivityGoalsResponse } from '@activus/contracts';
import {
  configurationApi,
  ClientError,
  type ActivityApi,
  type JournalApi,
  type ActivityGoalsApi,
} from '../../services/configuration-api.js';
import { navigate } from '../../routes/navigation.js';
import { onRestoredPage } from '../../routes/restored-page.js';
import { activityIcon } from '../activity-kinds/icons.js';
import { journalStyles } from './styles.js';
import {
  duration,
  journalDate,
  startDateTime,
  measurementText,
} from './format.js';
import { tagsView, referenceText, readError } from './presentation.js';
import { safeReturn, withReturn, withNotice } from './state.js';
import './delete-dialog.js';
import { goalDetailPath } from '../goals/state.js';
export class ActivityDetailPage extends LitElement {
  static override properties = {
    route: { type: String },
    api: { attribute: false },
    activity: { state: true },
    loading: { state: true },
    error: { state: true },
    deleting: { state: true },
    goals: { state: true },
    goalsLoading: { state: true },
    goalsError: { state: true },
  };
  route = location.pathname + location.search;
  api: Pick<ActivityApi, 'getActivity'> &
    JournalApi &
    Partial<ActivityGoalsApi> = configurationApi;
  private goals: ActivityGoalsResponse | undefined;
  private goalsLoading = false;
  private goalsError: unknown;
  private goalsController: AbortController | undefined;
  private activity: Activity | undefined;
  private loading = true;
  private error: unknown;
  private deleting = false;
  private generation = 0;
  private controller: AbortController | undefined;
  private stopRestoredPage: (() => void) | undefined;
  override connectedCallback() {
    super.connectedCallback();
    this.stopRestoredPage = onRestoredPage(() => void this.load());
  }
  private get url() {
    return new URL(this.route, location.origin);
  }
  private get back() {
    const target = safeReturn(this.url.searchParams.get('returnTo'));
    if (target.startsWith('/goals/')) return target;
    return new URL(target, location.origin).pathname === '/activities'
      ? target
      : '/activities';
  }
  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('route') || changed.has('api')) void this.load();
  }
  override disconnectedCallback() {
    this.stopRestoredPage?.();
    this.controller?.abort();
    this.goalsController?.abort();
    this.generation++;
    super.disconnectedCallback();
  }
  async load() {
    this.goalsController?.abort();
    this.goals = undefined;
    this.goalsError = undefined;
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    const generation = ++this.generation;
    this.loading = true;
    this.error = undefined;
    this.activity = undefined;
    this.deleting = false;
    try {
      const activity = await this.api.getActivity(
        this.url.pathname.split('/')[2] ?? '',
        controller.signal,
      );
      if (generation === this.generation) {
        this.activity = activity;
        void this.loadGoals();
      }
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted)
        this.error = error;
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }
  private async loadGoals(more = false) {
    if (!this.activity || !this.api.activityGoals) return;
    const offset = more ? this.goals?.pagination.nextOffset : 0;
    if (offset == null) return;
    this.goalsController?.abort();
    const controller = (this.goalsController = new AbortController());
    this.goalsLoading = true;
    this.goalsError = undefined;
    const trigger = this.shadowRoot?.activeElement;
    const previousCount = this.goals?.items.length ?? 0;
    try {
      const result = await this.api.activityGoals(
        this.activity.id,
        { limit: 25, offset },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.goals =
        more && this.goals
          ? { ...result, items: [...this.goals.items, ...result.items] }
          : result;
      await this.updateComplete;
      if (more && !result.pagination.hasMore && trigger && !trigger.isConnected)
        this.renderRoot
          .querySelectorAll<HTMLAnchorElement>('.matching-goal')
          [previousCount]?.focus();
    } catch (error) {
      if (!controller.signal.aborted) this.goalsError = error;
    } finally {
      if (!controller.signal.aborted) this.goalsLoading = false;
    }
  }
  private matchingGoals() {
    if (!this.goals?.items.length && !this.goalsLoading && !this.goalsError)
      return nothing;
    return html`<section aria-labelledby="matching-goals">
      <h2 id="matching-goals">Counts toward goals</h2>
      ${this.goals?.items.map(
        (goal) =>
          html`<div>
            <a
              class="matching-goal"
              href=${goalDetailPath(goal.id, goal.lifecycle, goal.period?.startDate)}
              >${goal.name}</a
            >
            <p class="muted">
              ${goal.scheduleMode === 'recurring' ? `Every ${goal.recurrencePeriod}` : 'Fixed goal'}
              · ${journalDate(goal.period?.startDate ?? goal.startDate)} –
              ${journalDate(goal.period?.endDate ?? goal.endDate)}
            </p>
          </div>`,
      )}
      ${this.goalsLoading ? html`<p role="status">Loading goals…</p>` : nothing}
      ${
        this.goalsError
          ? html`<p role="status">Matching goals unavailable.</p>
              <button
                @click=${() => this.loadGoals(!!this.goals?.items.length)}
              >
                Retry goals
              </button>`
          : nothing
      }
      ${this.goals?.pagination.hasMore && !this.goalsError ? html`<button ?disabled=${this.goalsLoading} @click=${() => this.loadGoals(true)}>Load more goals</button>` : nothing}
    </section>`;
  }
  override render() {
    const a = this.activity;
    return html`<a class="back" href=${this.back}
        >${this.back.startsWith('/goals/') ? 'Back to goal' : 'Back to journal'}</a
      >${
        this.loading
          ? html`<h1>Activity</h1>
              <p class="status" role="status">Loading activity…</p>`
          : this.error
            ? html`<h1>
                  ${this.error instanceof ClientError && this.error.kind === 'not-found' ? 'Activity not found' : 'Activity unavailable'}
                </h1>
                ${readError(this.error)}<button @click=${() => this.load()}>
                  Retry activity
                </button>`
            : a
              ? html` <header>
                    <div>
                      <h1>
                        ${activityIcon(a.kind.iconName)}
                        ${a.name ?? a.kind.name}
                      </h1>
                      <p class="muted">${referenceText(a)}</p>
                    </div>
                    <a
                      class="button primary"
                      href=${withReturn(`/activities/${a.id}/edit`, withReturn(`/activities/${a.id}`, this.back))}
                      >Edit activity</a
                    >
                  </header>
                  ${this.url.searchParams.get('saved') === '1' ? html`<p role="status">Activity saved. <a href=${this.back}>${this.back.startsWith('/goals/') ? 'Return to goal' : 'Return to your journal'}</a></p>` : nothing}
                  <section aria-label="Activity details">
                    <dl>
                      <dt>Activity date</dt>
                      <dd>
                        <time datetime=${a.activityDate}
                          >${journalDate(a.activityDate)}</time
                        >
                      </dd>
                      ${
                        a.startedAt
                          ? html`<dt>Start</dt>
                              <dd>
                                <time datetime=${a.startedAt}
                                  >${startDateTime(a.startedAt)}</time
                                >
                              </dd>`
                          : nothing
                      }${
                        a.durationSeconds !== null
                          ? html`<dt>Duration</dt>
                              <dd>${duration(a.durationSeconds)}</dd>`
                          : nothing
                      }${
                        a.effort !== null
                          ? html`<dt>Effort</dt>
                              <dd>${a.effort} / 5</dd>`
                          : nothing
                      }${
                        a.feeling !== null
                          ? html`<dt>Feeling</dt>
                              <dd>${a.feeling} / 5</dd>`
                          : nothing
                      }
                    </dl>
                    ${a.isPartial ? html`<p class="help">Partial historical record. Some measurements may not have been recorded.</p>` : nothing}
                  </section>
                  ${
                    a.measurements.length
                      ? html`<section aria-labelledby="measurements">
                          <h2 id="measurements">Measurements</h2>
                          <dl>
                            ${a.measurements.map((m) => {
                              const value = measurementText(m);
                              return html`<dt>
                                  ${m.name}${m.isArchived ? html`<span class="badge">Archived</span>` : nothing}
                                </dt>
                                <dd aria-label=${value.label}>
                                  ${value.text}
                                </dd>`;
                            })}
                          </dl>
                        </section>`
                      : nothing
                  }
                  ${
                    a.tags.length
                      ? html`<section aria-labelledby="tags">
                          <h2 id="tags">Tags</h2>
                          ${tagsView(a.tags)}
                        </section>`
                      : nothing
                  }
                  ${
                    a.notes !== null
                      ? html`<section aria-labelledby="notes">
                          <h2 id="notes">Notes</h2>
                          <p class="notes">${a.notes}</p>
                        </section>`
                      : nothing
                  }
                  ${this.matchingGoals()}
                  <footer>
                    <button
                      id="delete"
                      class="quiet danger"
                      @click=${() => {
                        this.deleting = true;
                      }}
                    >
                      Delete activity
                    </button>
                  </footer>
                  ${
                    this.deleting
                      ? html`<activity-delete-dialog
                          .activity=${a}
                          .api=${this.api}
                          @delete-cancel=${async () => {
                            this.deleting = false;
                            await this.updateComplete;
                            this.renderRoot
                              .querySelector<HTMLElement>('#delete')
                              ?.focus();
                          }}
                          @activity-deleted=${() => navigate(withNotice(this.back, 'deleted', '1'))}
                        ></activity-delete-dialog>`
                      : nothing
                  }`
              : nothing
      }`;
  }
  static override styles = [
    ...journalStyles,
    css`
      :host {
        max-width: 800px;
      }
      .back {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        margin-bottom: var(--space-5);
      }
      .matching-goal {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        overflow-wrap: anywhere;
      }
      h1 svg {
        vertical-align: middle;
      }
      section {
        border-top: 1px solid var(--color-border);
        padding: var(--space-5) 0;
      }
      h2 {
        margin-bottom: var(--space-4);
      }
      dl {
        display: grid;
        grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr);
        gap: var(--space-4);
      }
      dt {
        color: var(--color-text-muted);
        overflow-wrap: anywhere;
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .notes {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      footer {
        margin-top: var(--space-5);
      }
      @media (max-width: 480px) {
        dl {
          grid-template-columns: 1fr;
          gap: var(--space-2);
        }
        dd {
          margin-bottom: var(--space-4);
        }
      }
    `,
  ];
}
customElements.define('activity-detail-page', ActivityDetailPage);
