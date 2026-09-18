import { LitElement, html, nothing, type PropertyValues } from 'lit';
import type { Activity, ActivityGoalsResponse } from '@activus/contracts';
import {
  configurationApi,
  type ActivityApi,
  type ActivityGoalsApi,
} from '../../services/configuration-api.js';
import {
  duration,
  journalDate,
  startDateTime,
  measurementText,
} from './format.js';
import { tagsView, readError } from './presentation.js';
import { withReturn } from './state.js';
import { goalDetailPath } from '../goals/state.js';
import { journalPageStyles } from './page-styles.js';

/** Mounted only for the open row. Disconnecting cancels its independent reads. */
export class JournalEntryDetails extends LitElement {
  static override properties = {
    activityId: { type: String },
    api: { attribute: false },
    context: { type: String },
    activity: { state: true },
    error: { state: true },
    loading: { state: true },
    goals: { state: true },
    goalsError: { state: true },
    goalsLoading: { state: true },
  };
  activityId = '';
  context = '/activities';
  api: Pick<ActivityApi, 'getActivity'> & Partial<ActivityGoalsApi> =
    configurationApi;
  private activity: Activity | undefined;
  private error: unknown;
  private loading = true;
  private controller: AbortController | undefined;
  private goalsController: AbortController | undefined;
  private goals: ActivityGoalsResponse | undefined;
  private goalsError: unknown;
  private goalsLoading = false;
  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('activityId') || changed.has('api')) void this.load();
  }
  override disconnectedCallback() {
    this.controller?.abort();
    this.goalsController?.abort();
    super.disconnectedCallback();
  }
  private async load() {
    this.controller?.abort();
    this.goalsController?.abort();
    const controller = (this.controller = new AbortController());
    this.loading = true;
    this.error = undefined;
    this.activity = undefined;
    this.goals = undefined;
    this.goalsLoading = false;
    this.goalsError = undefined;
    try {
      const activity = await this.api.getActivity(
        this.activityId,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.activity = activity;
      void this.loadGoals();
    } catch (error) {
      if (!controller.signal.aborted) this.error = error;
    } finally {
      if (!controller.signal.aborted) this.loading = false;
    }
  }
  private async loadGoals(more = false) {
    if (!this.api.activityGoals || this.goalsLoading) return;
    const offset = more ? this.goals?.pagination.nextOffset : 0;
    if (offset == null) return;
    this.goalsController?.abort();
    const controller = (this.goalsController = new AbortController());
    this.goalsLoading = true;
    this.goalsError = undefined;
    const previousCount = this.goals?.items.length ?? 0;
    try {
      const result = await this.api.activityGoals(
        this.activityId,
        { limit: 25, offset },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.goals =
        more && this.goals
          ? { ...result, items: [...this.goals.items, ...result.items] }
          : result;
      await this.updateComplete;
      if (more && !result.pagination.hasMore)
        this.renderRoot
          .querySelectorAll<HTMLElement>('.matching-goal')
          [previousCount]?.focus();
    } catch (error) {
      if (!controller.signal.aborted) this.goalsError = error;
    } finally {
      if (!controller.signal.aborted) this.goalsLoading = false;
    }
  }
  private fact(label: string, value: unknown) {
    return value === null || value === undefined || value === ''
      ? nothing
      : html`<div>
          <dt>${label}</dt>
          <dd>${value}</dd>
        </div>`;
  }
  override render() {
    const a = this.activity;
    return html`<div class="entry-details" aria-busy=${this.loading}>
      ${
        this.loading
          ? html`<p role="status">Loading activity details…</p>`
          : this.error
            ? html`${readError(this.error)}<button @click=${this.load}>
                  Retry activity details
                </button>`
            : a
              ? html`
                  <dl class="detail-grid">
                    ${this.fact('Activity kind', a.kind.name + (a.kind.isArchived ? ' (archived)' : ''))}
                    ${this.fact('Variant', a.variant ? a.variant.name + (a.variant.isArchived ? ' (archived)' : '') : null)}
                    ${this.fact('Journal date', journalDate(a.activityDate))}
                    ${this.fact('Start', a.startedAt ? startDateTime(a.startedAt) : null)}
                    ${this.fact('Duration', a.durationSeconds !== null ? duration(a.durationSeconds) : null)}
                    ${this.fact('Effort', a.effort !== null ? a.effort + ' / 5' : null)}
                    ${this.fact('Feeling', a.feeling !== null ? a.feeling + ' / 5' : null)}
                  </dl>
                  ${a.isPartial ? html`<p class="help">Partial historical record. Some measurements may not have been recorded.</p>` : nothing}
                  ${
                    a.measurements.length
                      ? html`<section aria-label="Measurements">
                          <h3>Measurements</h3>
                          <dl class="detail-grid measurements">
                            ${a.measurements.map((m) => {
                              const value = measurementText(m);
                              return html`<div>
                                <dt>
                                  ${m.name}${m.isArchived ? ' (archived)' : ''}
                                </dt>
                                <dd aria-label=${value.label}>${value.text}</dd>
                              </div>`;
                            })}
                          </dl>
                        </section>`
                      : nothing
                  }
                  ${
                    a.tags.length
                      ? html`<section aria-label="Tags">
                          <h3>Tags</h3>
                          ${tagsView(a.tags)}
                        </section>`
                      : nothing
                  }
                  ${
                    a.notes
                      ? html`<section aria-label="Notes">
                          <h3>Notes</h3>
                          <p class="notes">${a.notes}</p>
                        </section>`
                      : nothing
                  }
                  ${
                    this.goals?.items.length ||
                    this.goalsLoading ||
                    this.goalsError
                      ? html`<section aria-label="Counts toward goals">
                          <h3>Counts toward goals</h3>
                          ${this.goals?.items.map((g) => html`<a class="matching-goal" href=${goalDetailPath(g.id, g.lifecycle, g.period?.startDate)}>${g.name}</a>`)}
                          ${this.goalsLoading ? html`<p role="status">Loading goals…</p>` : nothing}
                          ${
                            this.goalsError
                              ? html`<p role="status">
                                    Matching goals unavailable.
                                  </p>
                                  <button
                                    @click=${() => this.loadGoals(!!this.goals?.items.length)}
                                  >
                                    Retry goals
                                  </button>`
                              : nothing
                          }
                          ${this.goals?.pagination.hasMore && !this.goalsError ? html`<button ?disabled=${this.goalsLoading} @click=${() => this.loadGoals(true)}>Load more goals</button>` : nothing}
                        </section>`
                      : nothing
                  }
                  <footer class="entry-actions">
                    <a
                      class="button primary"
                      href=${withReturn('/activities/' + a.id + '/edit', this.context)}
                      >Edit activity</a
                    >
                    <button
                      class="quiet danger"
                      @click=${(event: Event) => this.dispatchEvent(new CustomEvent('request-delete', { detail: { opener: event.currentTarget }, bubbles: true, composed: true }))}
                    >
                      Delete activity
                    </button>
                  </footer>
                `
              : nothing
      }
    </div>`;
  }
  static override styles = journalPageStyles;
}
customElements.define('journal-entry-details', JournalEntryDetails);
