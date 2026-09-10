import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import {
  GoalIdSchema,
  type GoalDetail,
  type GoalPeriodsResponse,
  type GoalContributionsResponse,
} from '@activus/contracts';
import {
  configurationApi,
  ClientError,
  clientMessage,
  type GoalDetailApi,
  type GoalOverviewApi,
} from '../../services/configuration-api.js';
import { navigate } from '../../routes/navigation.js';
import { activityIcon } from '../activity-kinds/icons.js';
import { journalDate, startTime } from '../journal/format.js';
import { referenceText, tagsView } from '../journal/presentation.js';
import { journalStyles } from '../journal/styles.js';
import { GoalsPage } from './page.js';
import {
  archiveConfirmation,
  goalValue,
  goalProgressBar,
} from './presentation.js';
import {
  goalView,
  goalsPath,
  goalDetailPath,
  selectedGoalPeriod,
} from './state.js';

const title = (value: string) => value[0]!.toUpperCase() + value.slice(1);
export class GoalDetailPage extends LitElement {
  static override properties = {
    route: { type: String },
    api: { attribute: false },
    data: { state: true },
    loading: { state: true },
    error: { state: true },
    progressError: { state: true },
    periods: { state: true },
    periodLoading: { state: true },
    periodError: { state: true },
    nextBefore: { state: true },
    contributions: { state: true },
    contributionLoading: { state: true },
    contributionError: { state: true },
    selected: { state: true },
    confirming: { state: true },
    busy: { state: true },
    actionError: { state: true },
    status: { state: true },
  };
  route = location.pathname + location.search;
  api: GoalDetailApi & Pick<GoalOverviewApi, 'archiveGoal' | 'restoreGoal'> =
    configurationApi;
  private data: GoalDetail | undefined;
  private loading = true;
  private error: unknown;
  private progressError: unknown;
  private periods: GoalPeriodsResponse['items'] = [];
  private nextBefore: string | null = null;
  private periodLoading = false;
  private periodError: unknown;
  private contributions: GoalContributionsResponse | undefined;
  private contributionLoading = false;
  private contributionError: unknown;
  private selected: string | undefined;
  private confirming = false;
  private busy = false;
  private actionError: unknown;
  private status = '';
  private definitionRequest: AbortController | undefined;
  private periodRequest: AbortController | undefined;
  private contributionRequest: AbortController | undefined;
  private trigger: HTMLElement | undefined;
  private get goalId() {
    return new URL(this.route, location.origin).pathname.split('/')[2] ?? '';
  }
  private get back() {
    return goalsPath(goalView(this.route));
  }
  private get detailPath() {
    return goalDetailPath(this.goalId, goalView(this.route), this.selected);
  }
  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('api') || changed.has('route')) {
      const old = changed.get('route') as string | undefined;
      const previous = old ? new URL(old, location.origin) : undefined;
      const url = new URL(this.route, location.origin);
      if (
        !this.data ||
        changed.has('api') ||
        previous?.pathname !== url.pathname ||
        previous?.searchParams.get('saved') !== url.searchParams.get('saved')
      )
        void this.load();
      else {
        this.selected = this.resolveSelection();
        void this.loadContributions();
      }
    }
  }
  protected override updated(changed: PropertyValues) {
    if (changed.has('confirming') && this.confirming) {
      this.renderRoot.querySelector<HTMLDialogElement>('dialog')?.showModal();
      this.renderRoot
        .querySelector<HTMLButtonElement>('dialog .cancel')
        ?.focus();
    }
  }
  override disconnectedCallback() {
    this.definitionRequest?.abort();
    this.periodRequest?.abort();
    this.contributionRequest?.abort();
    super.disconnectedCallback();
  }
  private resolveSelection() {
    if (!this.data?.defaultPeriod) return undefined;
    const period = selectedGoalPeriod(this.route);
    return period &&
      period >= this.data.goal.startDate &&
      period <= this.data.goal.endDate
      ? period
      : this.data.defaultPeriod.startDate;
  }
  private async load() {
    this.definitionRequest?.abort();
    this.periodRequest?.abort();
    this.contributionRequest?.abort();
    const controller = (this.definitionRequest = new AbortController());
    this.data = undefined;
    this.periods = [];
    this.contributions = undefined;
    this.error = undefined;
    this.progressError = undefined;
    this.loading = true;
    this.confirming = false;
    this.actionError = undefined;
    this.status = '';
    try {
      if (!GoalIdSchema.safeParse(this.goalId).success)
        throw new ClientError('not-found', 'GOAL_NOT_FOUND');
      const data = await this.api.goalDetail(this.goalId, controller.signal);
      if (controller.signal.aborted) return;
      this.data = data;
      this.selected = this.resolveSelection();
      if (data.goal.scheduleMode === 'recurring') void this.loadPeriods();
      void this.loadContributions();
    } catch (error) {
      if (!controller.signal.aborted) this.error = error;
    } finally {
      if (!controller.signal.aborted) this.loading = false;
    }
  }
  private async refreshProgress() {
    this.definitionRequest?.abort();
    const controller = (this.definitionRequest = new AbortController());
    this.progressError = undefined;
    try {
      const data = await this.api.goalDetail(this.goalId, controller.signal);
      if (!controller.signal.aborted) this.data = data;
    } catch (error) {
      if (!controller.signal.aborted) this.progressError = error;
    }
  }
  private async loadPeriods(more = false) {
    if (more && (this.periodLoading || !this.nextBefore)) return;
    this.periodRequest?.abort();
    const previousCount = this.periods.length;
    const trigger = this.shadowRoot?.activeElement;
    const controller = (this.periodRequest = new AbortController());
    this.periodLoading = true;
    this.periodError = undefined;
    try {
      const result = await this.api.goalPeriods(
        this.goalId,
        {
          limit: 12,
          ...(more && this.nextBefore ? { before: this.nextBefore } : {}),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.periods = more ? [...this.periods, ...result.items] : result.items;
      this.nextBefore = result.nextBefore;
      if (more && !result.nextBefore) {
        await this.updateComplete;
        if (!controller.signal.aborted && trigger && !trigger.isConnected)
          this.renderRoot
            .querySelectorAll<HTMLButtonElement>('.period-choice')
            [Math.min(previousCount, this.periods.length - 1)]?.focus();
      }
    } catch (error) {
      if (!controller.signal.aborted) this.periodError = error;
    } finally {
      if (!controller.signal.aborted) this.periodLoading = false;
    }
  }
  private async loadContributions(more = false) {
    const offset = more ? this.contributions?.pagination.nextOffset : 0;
    if (offset == null || (more && this.contributionLoading)) return;
    this.contributionRequest?.abort();
    const previousCount = this.contributions?.items.length ?? 0;
    const trigger = this.shadowRoot?.activeElement;
    const controller = (this.contributionRequest = new AbortController());
    if (!more) this.contributions = undefined;
    this.contributionError = undefined;
    this.contributionLoading = true;
    try {
      const result = await this.api.goalContributions(
        this.goalId,
        {
          limit: 25,
          offset,
          ...(this.selected ? { period: this.selected } : {}),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.contributions =
        more && this.contributions
          ? { ...result, items: [...this.contributions.items, ...result.items] }
          : result;
      if (more && !result.pagination.hasMore) {
        await this.updateComplete;
        if (!controller.signal.aborted && trigger && !trigger.isConnected)
          this.renderRoot
            .querySelectorAll<HTMLAnchorElement>('.row .title')
            [
              Math.min(previousCount, this.contributions.items.length - 1)
            ]?.focus();
      }
    } catch (error) {
      if (!controller.signal.aborted) this.contributionError = error;
    } finally {
      if (!controller.signal.aborted) this.contributionLoading = false;
    }
  }
  private selectPeriod(period?: string) {
    navigate(goalDetailPath(this.goalId, goalView(this.route), period));
  }
  private closeArchive() {
    if (this.busy) return;
    this.renderRoot.querySelector<HTMLDialogElement>('dialog')?.close();
    this.confirming = false;
    this.actionError = undefined;
    this.trigger?.focus();
  }
  private async changeArchive() {
    if (this.busy || !this.data) return;
    this.busy = true;
    this.actionError = undefined;
    const id = this.goalId,
      restore = this.data.goal.isArchived;
    try {
      const goal = await (restore
        ? this.api.restoreGoal(id)
        : this.api.archiveGoal(id));
      if (!this.isConnected || id !== this.goalId || !this.data) return;
      this.data = { ...this.data, goal };
      this.busy = false;
      this.closeArchive();
      this.status = restore
        ? 'Goal restored.'
        : 'Goal archived. Its definition and historical progress are preserved.';
      void this.refreshProgress();
      await this.updateComplete;
      this.renderRoot.querySelector<HTMLElement>('.lifecycle-action')?.focus();
    } catch (error) {
      if (this.isConnected && id === this.goalId) this.actionError = error;
    } finally {
      this.busy = false;
    }
  }
  private currentProgress(d: GoalDetail) {
    const p = d.progress;
    if (!p)
      return html`<p>Progress unavailable.</p>
        <button @click=${this.refreshProgress}>Retry progress</button>`;
    const current = p.scheduleMode === 'fixed' ? p : p.currentPeriod;
    const summary =
      p.scheduleMode === 'recurring'
        ? html`<p>
            ${p.completedPeriodsAchieved} of ${p.completedPeriods} completed
            ${d.goal.recurrencePeriod}s reached
          </p>`
        : nothing;
    if (!current || d.displayCurrent === null)
      return html`${d.goal.lifecycle === 'upcoming' ? html`<p>First period begins ${journalDate(d.goal.startDate)}.</p>` : nothing}${summary}`;
    const label = `${goalValue(d, d.displayCurrent)} of ${goalValue(d, d.displayTarget)}`;
    return html`<p class="numeric">${label}</p>
      ${goalProgressBar(d.goal.name, current.currentValue, current.targetValue, label)}
      <p>
        ${current.achieved ? (p.scheduleMode === 'fixed' ? 'Goal reached' : 'Period target reached') : d.displayRemaining === null ? 'Remaining progress unavailable' : `${goalValue(d, d.displayRemaining)} remaining`}
      </p>
      <p class="muted">
        ${p.scheduleMode === 'recurring' ? `Current ${d.goal.recurrencePeriod}: ` : ''}${journalDate(current.startDate)}
        – ${journalDate(current.endDate)} (inclusive)
      </p>
      ${summary}`;
  }
  private history(d: GoalDetail) {
    return html`<section aria-labelledby="history-title">
      <h2 id="history-title">Period history</h2>
      <p class="muted">
        Newest periods first. Select a period to see its qualifying activities.
      </p>
      <p role="status">
        ${this.periodLoading ? 'Loading periods…' : `${this.periods.length} periods loaded`}
      </p>
      <ul>
        ${repeat(
          this.periods,
          (p) => p.startDate,
          (p) =>
            html`<li class="period">
              <button
                class="period-choice"
                aria-pressed=${this.selected === p.startDate}
                @click=${() => this.selectPeriod(p.startDate)}
              >
                <span
                  >${journalDate(p.startDate)} – ${journalDate(p.endDate)}</span
                ><span
                  >${goalValue(d, p.displayCurrent)} of
                  ${goalValue(d, p.displayTarget)}</span
                ><span class="muted"
                  >${title(p.temporalState)} ·
                  ${p.achieved ? 'Target reached' : 'Target not reached'}</span
                >
              </button>
            </li>`,
        )}
      </ul>
      ${!this.periodLoading && !this.periodError && !this.periods.length ? html`<p>No periods in this range.</p>` : nothing}
      ${
        this.periodError
          ? html`<p role="alert">${clientMessage(this.periodError)}</p>
              <button @click=${() => this.loadPeriods(this.periods.length > 0)}>
                Retry periods
              </button>`
          : nothing
      }
      ${this.nextBefore ? html`<button ?disabled=${this.periodLoading} @click=${() => this.loadPeriods(true)}>Load older periods</button>` : nothing}
    </section>`;
  }
  private activities(d: GoalDetail) {
    const result = this.contributions;
    return html`<section aria-labelledby="contributions-title">
      <h2 id="contributions-title">Qualifying activities</h2>
      <p>
        Activities matching every part of this goal's scope, including records
        without a target contribution.
      </p>
      <p class="muted">
        ${result ? `${journalDate(result.startDate)} – ${journalDate(result.endDate)} (inclusive)` : this.selected ? `Period beginning ${journalDate(this.selected)}` : `${journalDate(d.goal.startDate)} – ${journalDate(d.goal.endDate)}`}
      </p>
      ${d.defaultPeriod ? html`<button @click=${() => this.selectPeriod(d.defaultPeriod!.startDate)}>Show ${d.progress?.scheduleMode === 'recurring' && d.progress.currentPeriod ? 'current' : d.goal.lifecycle === 'upcoming' ? 'first' : 'latest'} period</button>` : nothing}
      <p role="status">
        ${this.contributionLoading ? 'Loading activities…' : result ? `${result.items.length} qualifying activities loaded` : ''}
      </p>
      <ul>
        ${repeat(
          result?.items ?? [],
          (item) => item.activity.id,
          (item) =>
            html`<li class="row">
              <span class="kind-icon"
                >${activityIcon(item.activity.kind.iconName)}</span
              >
              <div class="identity">
                <a
                  class="title"
                  href=${`/activities/${item.activity.id}?returnTo=${encodeURIComponent(this.detailPath)}`}
                  >${item.activity.name ?? item.activity.kind.name}</a
                >
                <p class="muted">
                  ${journalDate(item.activity.activityDate)}${item.activity.startedAt ? ` · ${startTime(item.activity.startedAt)}` : ''}
                </p>
                <p>${referenceText(item.activity)}</p>
                <p>
                  ${item.displayContribution === null ? 'No recorded contribution' : goalValue(d, item.displayContribution)}
                </p>
                ${tagsView(item.activity.tags)}
              </div>
            </li>`,
        )}
      </ul>
      ${result && !result.items.length && !this.contributionLoading ? html`<p>No qualifying activities in this period.</p>` : nothing}
      ${
        this.contributionError
          ? html`<p role="alert">${clientMessage(this.contributionError)}</p>
              <button @click=${() => this.loadContributions(!!result)}>
                Retry activities
              </button>`
          : nothing
      }
      ${result?.pagination.hasMore ? html`<button ?disabled=${this.contributionLoading} @click=${() => this.loadContributions(true)}>Load more activities</button>` : nothing}
    </section>`;
  }
  override render() {
    const d = this.data;
    return html`<a class="back" href=${this.back}>Back to goals</a> ${
        this.loading
          ? html`<h1>Goal</h1>
              <p role="status">Loading goal…</p>`
          : this.error
            ? html`<h1>
                  ${this.error instanceof ClientError && this.error.kind === 'not-found' ? 'Goal not found' : 'Goal unavailable'}
                </h1>
                <p role="alert">${clientMessage(this.error)}</p>
                <button @click=${this.load}>Retry goal</button>`
            : d
              ? html` <header>
                    <div class="heading">
                      <h1>${d.goal.name}</h1>
                      <p class="muted">${title(d.goal.lifecycle)}</p>
                      ${d.goal.description ? html`<p class="description">${d.goal.description}</p>` : nothing}
                    </div>
                    <div class="actions">
                      ${!d.goal.isArchived ? html`<a class="primary" href=${`/goals/${d.goal.id}/edit?returnTo=${encodeURIComponent(this.detailPath)}`}>Edit goal</a>` : nothing}<button
                        class="lifecycle-action"
                        ?disabled=${this.busy}
                        @click=${(e: Event) => {
                          this.trigger = e.currentTarget as HTMLElement;
                          if (d.goal.isArchived) void this.changeArchive();
                          else {
                            this.actionError = undefined;
                            this.confirming = true;
                          }
                        }}
                      >
                        ${d.goal.isArchived ? 'Restore goal' : 'Archive goal'}
                      </button>
                    </div>
                  </header>
                  <p role="status">
                    ${this.status || (new URL(this.route, location.origin).searchParams.get('saved') === '1' ? 'Goal saved.' : '')}
                  </p>
                  ${this.actionError && !this.confirming ? html`<p role="alert">${clientMessage(this.actionError)}</p>` : nothing}
                  <section aria-labelledby="progress-title">
                    <h2 id="progress-title">
                      ${d.goal.scheduleMode === 'recurring' ? 'Current progress' : 'Progress'}
                    </h2>
                    ${this.currentProgress(d)}${
                      this.progressError
                        ? html`<p role="alert">
                              ${clientMessage(this.progressError)}
                            </p>
                            <button @click=${this.refreshProgress}>
                              Retry progress
                            </button>`
                        : nothing
                    }
                  </section>
                  <section aria-labelledby="definition-title">
                    <h2 id="definition-title">What counts and when</h2>
                    <p class="scope">
                      ${activityIcon(d.iconName)}
                      ${d.kindName}${d.variantName ? ` · ${d.variantName}` : ''}
                    </p>
                    <p>
                      ${d.goal.targetType === 'activity_count' ? 'Complete' : 'Record a total of'}
                      ${goalValue(d, d.displayTarget)}${d.measurementName ? ` of ${d.measurementName}` : ''}
                      ${d.goal.scheduleMode === 'recurring' ? `each calendar ${d.goal.recurrencePeriod}` : 'over the full goal range'}.
                    </p>
                    <p>
                      ${d.tagNames.length ? `Every activity must have all of these tags: ${d.tagNames.join(', ')}.` : 'No tags are required.'}
                    </p>
                    <p>
                      ${journalDate(d.goal.startDate)} through
                      ${journalDate(d.goal.endDate)}, including both dates.
                    </p>
                    ${d.goal.scheduleMode === 'recurring' ? html`<p class="muted">Boundary periods use only the dates inside the goal range.</p>` : nothing}
                    ${d.archivedReferences.length ? html`<p class="muted">Archived configuration retained: ${d.archivedReferences.join(', ')}.</p>` : nothing}
                  </section>
                  ${d.goal.scheduleMode === 'recurring' ? this.history(d) : nothing}${this.activities(d)}
                  ${
                    this.confirming
                      ? archiveConfirmation(
                          d.goal.name,
                          this.busy,
                          this.actionError,
                          () => this.closeArchive(),
                          () => {
                            void this.changeArchive();
                          },
                        )
                      : nothing
                  }`
              : nothing
      }`;
  }
  static override styles = [
    journalStyles,
    GoalsPage.styles,
    css`
      .back {
        padding-left: 0;
        margin-bottom: 16px;
      }
      .heading {
        min-width: 0;
        flex: 1;
      }
      h1 {
        overflow-wrap: anywhere;
      }
      h2 {
        font-size: var(--font-size-section-title);
      }
      header {
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .description {
        white-space: pre-wrap;
      }
      section {
        padding: 24px 0;
        border-top: 1px solid var(--color-border);
      }
      section p {
        max-width: 72ch;
      }
      .numeric {
        font-size: 20px;
      }
      progress {
        max-width: 640px;
      }
      .period {
        padding: 4px 0;
        border: 0;
      }
      .period-choice {
        width: 100%;
        display: grid;
        gap: 6px;
        justify-content: stretch;
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .period-choice[aria-pressed='true'] {
        background: var(--color-primary-soft);
        border-color: var(--color-primary);
      }
      .identity p {
        margin: 0;
      }
      .title {
        padding: 0;
        justify-content: flex-start;
      }
      .row {
        border-top: 0;
        border-bottom: 1px solid var(--color-border);
      }
      button {
        white-space: normal;
      }
      .scope svg {
        flex-shrink: 0;
      }
      .period-choice span {
        min-width: 0;
      }
      section > button {
        margin-top: 12px;
      }
      dialog p {
        overflow-wrap: anywhere;
      }
    `,
  ];
}
customElements.define('goal-detail-page', GoalDetailPage);
