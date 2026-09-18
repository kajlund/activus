import { LitElement, html, nothing, type PropertyValues } from 'lit';
import { ChevronRight, createElement } from 'lucide';
import { goalStyles } from './styles.js';
import { repeat } from 'lit/directives/repeat.js';
import type {
  GoalOverviewItem,
  GoalOverviewResponse,
} from '@activus/contracts';
import {
  configurationApi,
  clientMessage,
  type GoalOverviewApi,
} from '../../services/configuration-api.js';
import { archiveConfirmation } from './presentation.js';
import { navigate } from '../../routes/navigation.js';
import { onRestoredPage } from '../../routes/restored-page.js';
import { activityIcon } from '../activity-kinds/icons.js';
import { duration, exactNumber, journalDate } from '../journal/format.js';
import { goalDetailPath, goalsPath, goalView, goalViews } from './state.js';

const title = (s: string) => s[0]!.toUpperCase() + s.slice(1);
export class GoalsPage extends LitElement {
  static override properties = {
    route: { type: String },
    api: { attribute: false },
    data: { state: true },
    loading: { state: true },
    error: { state: true },
    actionError: { state: true },
    busy: { state: true },
    pending: { state: true },
    status: { state: true },
  };
  route = '/goals';
  api: GoalOverviewApi = configurationApi;
  private data: GoalOverviewResponse | undefined;
  private loading = true;
  private error: unknown;
  private actionError: unknown;
  private busy = false;
  private pending: GoalOverviewItem | undefined;
  private status = '';
  private controller: AbortController | undefined;
  private trigger: HTMLElement | undefined;
  private stopRestoredPage: (() => void) | undefined;
  override connectedCallback() {
    super.connectedCallback();
    this.stopRestoredPage = onRestoredPage(() => void this.load());
  }
  private get view() {
    return goalView(this.route);
  }
  override disconnectedCallback() {
    this.stopRestoredPage?.();
    this.controller?.abort();
    super.disconnectedCallback();
  }
  protected override updated(changed: PropertyValues) {
    if (changed.has('route') || changed.has('api')) {
      this.actionError = undefined;
      void this.load();
    }
    if (changed.has('pending') && this.pending) {
      this.renderRoot.querySelector<HTMLDialogElement>('dialog')?.showModal();
      this.renderRoot
        .querySelector<HTMLButtonElement>('dialog .cancel')
        ?.focus();
    }
  }
  private async load() {
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    this.loading = true;
    this.error = undefined;
    this.data = undefined;
    try {
      const data = await this.api.overviewGoals(
        { lifecycle: this.view },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.data = data;
    } catch (error) {
      if (!controller.signal.aborted) this.error = error;
    } finally {
      if (!controller.signal.aborted) this.loading = false;
    }
  }
  private close() {
    if (this.busy) return;
    this.renderRoot.querySelector<HTMLDialogElement>('dialog')?.close();
    this.pending = undefined;
    this.actionError = undefined;
    this.trigger?.focus();
  }
  private async change(item: GoalOverviewItem, restore: boolean) {
    if (this.busy) return;
    this.busy = true;
    this.actionError = undefined;
    const route = this.route;
    try {
      const goal = await (restore
        ? this.api.restoreGoal(item.goal.id)
        : this.api.archiveGoal(item.goal.id));
      this.busy = false;
      this.close();
      if (!this.isConnected || this.route !== route) return;
      this.data = this.data && {
        ...this.data,
        items: this.data.items.filter((i) => i.goal.id !== goal.id),
      };
      this.status = restore
        ? `Goal restored to ${goal.lifecycle} goals.`
        : 'Goal archived. Its definition and historical progress are preserved.';
      if (restore) navigate(goalsPath(goal.lifecycle));
      await this.updateComplete;
      this.renderRoot.querySelector<HTMLElement>('h1')?.focus();
    } catch (error) {
      if (this.isConnected && this.route === route) this.actionError = error;
    } finally {
      this.busy = false;
    }
  }
  private progress(item: GoalOverviewItem) {
    const { goal, progress } = item;
    if (!progress)
      return html`<p>
        Progress unavailable.
        <button @click=${this.load}>Refresh progress</button>
      </p>`;
    const current =
      progress.scheduleMode === 'fixed' ? progress : progress.currentPeriod;
    const showCurrent =
      current &&
      (progress.scheduleMode === 'fixed' || goal.lifecycle === 'active');
    const durationValue =
      goal.targetType === 'total_duration' || item.unitSymbol === 'h / min';
    const value = (v: string) =>
      durationValue
        ? duration(Number(v))
        : exactNumber(v.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));
    const unit =
      goal.targetType === 'activity_count'
        ? 'activities'
        : durationValue
          ? ''
          : (item.unitSymbol ?? '');
    const target = html`<p>
      Target: ${value(item.displayTarget)} ${unit} per ${goal.recurrencePeriod}
    </p>`;
    if (progress.scheduleMode === 'recurring' && goal.lifecycle === 'upcoming')
      return html`${target}
        <p>Begins ${journalDate(goal.startDate)}</p>`;
    const label =
      showCurrent && item.displayCurrent !== null
        ? `${value(item.displayCurrent)} of ${value(item.displayTarget)} ${unit}`.trim()
        : '';
    return html`${
      showCurrent
        ? html`
            <p class="numeric">
              ${progress.scheduleMode === 'recurring' ? `This ${goal.recurrencePeriod}: ` : ''}${label}${current.achieved ? html` <span class="achieved">${progress.scheduleMode === 'recurring' ? 'Period reached' : 'Reached'}</span>` : nothing}
            </p>
            <progress
              aria-label=${`${goal.name}: ${label}`}
              aria-valuetext=${label}
              max="100"
              value=${Math.max(0, Math.min(100, (Number(current.currentValue) / Number(current.targetValue)) * 100))}
            ></progress>
            ${progress.scheduleMode === 'recurring' ? html`<p class="muted">${journalDate(current.startDate)} – ${journalDate(current.endDate)}</p>` : nothing}
          `
        : target
    }
    ${progress.scheduleMode === 'recurring' ? html`<p>${progress.completedPeriodsAchieved} of ${progress.completedPeriods} completed ${goal.recurrencePeriod}s reached</p>` : nothing}`;
  }
  private row(item: GoalOverviewItem) {
    const g = item.goal;
    return html`<li class="goal-row">
      <div class="row-head">
        <div class="definition">
          <h2>
            <a class="goal-link" href=${goalDetailPath(g.id, this.view)}
              >${g.name}${createElement(ChevronRight, { width: '18', height: '18', 'aria-hidden': 'true' })}</a
            >
          </h2>
          <p class="scope">
            ${activityIcon(item.iconName)}
            ${item.kindName}${item.variantName ? ` · ${item.variantName}` : ''}
          </p>
          <p>
            ${g.targetType === 'activity_count' ? 'Activity count' : g.targetType === 'total_duration' ? 'Total duration' : `Total ${item.measurementName ?? 'measurement'}`}
            ·
            ${g.scheduleMode === 'fixed' ? 'Fixed goal' : `Every calendar ${g.recurrencePeriod}`}
          </p>
          ${item.tagNames.length ? html`<p class="tags" aria-label="All required tags">${item.tagNames.map((t) => html`<span>${t}</span>`)}</p>` : nothing}
          <p class="muted">
            ${journalDate(g.startDate)} – ${journalDate(g.endDate)} ·
            ${title(g.lifecycle)}
          </p>
        </div>
        <div class="progress">${this.progress(item)}</div>
        <div class="actions">
          ${
            !g.isArchived
              ? html`<a href=${`/goals/${g.id}/edit?view=${this.view}`}
                    >Edit<span class="sr"> ${g.name}</span></a
                  ><button
                    ?disabled=${this.busy}
                    @click=${(e: Event) => {
                      this.trigger = e.currentTarget as HTMLElement;
                      this.actionError = undefined;
                      this.pending = item;
                    }}
                  >
                    Archive<span class="sr"> ${g.name}</span>
                  </button>`
              : html`<button
                  ?disabled=${this.busy}
                  @click=${() => this.change(item, true)}
                >
                  Restore<span class="sr"> ${g.name}</span>
                </button>`
          }
        </div>
      </div>
    </li>`;
  }
  override render() {
    const saved = new URL(this.route, location.origin).searchParams.get(
      'saved',
    );
    return html`<header>
        <div>
          <h1 tabindex="-1">Goals</h1>
          <p class="muted">Keep track of what you want to work toward.</p>
        </div>
        <a class="primary" href=${`/goals/new?view=${this.view}`}
          >Create goal</a
        >
      </header>
      <nav aria-label="Goal lifecycle">
        ${goalViews.map((v) => html`<a href=${goalsPath(v)} aria-current=${this.view === v ? 'page' : 'false'}>${title(v)}</a>`)}
      </nav>
      <p class="announcement" role="status">
        ${this.status || (saved ? 'Goal saved.' : '')}
        ${this.loading ? 'Loading goals…' : this.data ? `${this.data.items.length} ${this.view} goals` : ''}
      </p>
      ${this.error ? html`<p role="alert">${clientMessage(this.error)} <button @click=${this.load}>Retry</button></p>` : nothing}
      ${this.actionError && !this.pending ? html`<p role="alert">${clientMessage(this.actionError)}</p>` : nothing}
      ${
        !this.loading && this.data
          ? this.data.items.length
            ? html`<ul>
                ${repeat(
                  this.data.items,
                  (i) => i.goal.id,
                  (i) => this.row(i),
                )}
              </ul>`
            : html`<section class="empty">
                <h2>
                  ${this.data.hasGoals ? `No ${this.view} goals` : 'No goals yet'}
                </h2>
                <p>
                  ${this.data.hasGoals ? 'Choose another view or add a new goal.' : 'Goals connect your recorded activities to a target and date range.'}
                </p>
                ${!this.data.hasGoals ? html`<a href="/goals/new">Create your first goal</a>` : nothing}
              </section>`
          : nothing
      }
      ${
        this.pending
          ? archiveConfirmation(
              this.pending.goal.name,
              this.busy,
              this.actionError,
              () => this.close(),
              () => {
                void this.change(this.pending!, false);
              },
            )
          : nothing
      }`;
  }
  static override styles = goalStyles;
}
customElements.define('goals-page', GoalsPage);
