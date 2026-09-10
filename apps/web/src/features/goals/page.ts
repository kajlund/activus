import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
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
import { trapDialogFocus } from '../../components/dialog-focus.js';
import { navigate } from '../../routes/navigation.js';
import { activityIcon } from '../activity-kinds/icons.js';
import { duration, exactNumber, journalDate } from '../journal/format.js';
import { goalsPath, goalView, goalViews } from './state.js';

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
  private get view() {
    return goalView(this.route);
  }
  override disconnectedCallback() {
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
    return html`<li>
      <div class="row-head">
        <div class="definition">
          <h2>${g.name}</h2>
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
      <div class="progress">${this.progress(item)}</div>
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
        <a class="primary" href=${`/goals/new?view=${this.view}`}>New goal</a>
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
          ? html`<dialog
              aria-labelledby="archive-title"
              @keydown=${trapDialogFocus}
              @cancel=${(e: Event) => {
                e.preventDefault();
                this.close();
              }}
            >
              <h2 id="archive-title">Archive this goal?</h2>
              <p>${this.pending.goal.name}</p>
              <p>Its definition and historical progress will be preserved.</p>
              ${this.actionError ? html`<p role="alert">${clientMessage(this.actionError)}</p>` : nothing}
              <div class="actions">
                <button
                  class="cancel"
                  ?disabled=${this.busy}
                  @click=${this.close}
                >
                  Cancel</button
                ><button
                  ?disabled=${this.busy}
                  @click=${() => this.change(this.pending!, false)}
                >
                  ${this.busy ? 'Archiving…' : 'Archive goal'}
                </button>
              </div>
            </dialog>`
          : nothing
      }`;
  }
  static override styles = css`
    :host {
      display: block;
      max-width: 960px;
      margin: auto;
    }
    * {
      box-sizing: border-box;
    }
    h1 {
      font-size: var(--font-size-page-title);
      margin: 0 0 8px;
    }
    h2 {
      font-size: var(--font-size-component-title, 16px);
      margin: 0 0 12px;
      overflow-wrap: anywhere;
    }
    p {
      margin: 8px 0;
      overflow-wrap: anywhere;
    }
    header,
    .row-head {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
    }
    header {
      align-items: center;
      margin-bottom: 24px;
    }
    .definition {
      min-width: 0;
    }
    .muted,
    .announcement {
      color: var(--color-text-muted);
      font-size: 13px;
    }
    a,
    button {
      color: var(--color-primary);
      font: inherit;
      min-height: 44px;
      padding: 10px 14px;
      border-radius: var(--radius-md);
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    button {
      background: var(--color-surface);
      border: 1px solid var(--color-control-border);
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.65;
      cursor: wait;
    }
    a:focus-visible,
    button:focus-visible,
    h1:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 3px;
    }
    .primary {
      background: var(--color-primary);
      color: var(--color-surface);
      text-decoration: none;
      white-space: nowrap;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      border-bottom: 1px solid var(--color-border);
      padding-bottom: 12px;
    }
    nav a {
      text-decoration: none;
    }
    nav a[aria-current='page'] {
      background: var(--color-primary-soft);
      color: var(--color-primary-hover);
      font-weight: 600;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    li {
      padding: 24px 0;
      border-bottom: 1px solid var(--color-border);
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }
    .scope {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .scope svg {
      flex-shrink: 0;
    }
    .tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tags span,
    .achieved {
      background: var(--color-surface-subtle);
      border-radius: var(--radius-pill);
      padding: 3px 8px;
      font-size: 13px;
    }
    .progress {
      margin-top: 16px;
      max-width: 640px;
    }
    .numeric {
      font-weight: 600;
    }
    progress {
      display: block;
      width: 100%;
      height: 6px;
      appearance: none;
      border: 0;
      border-radius: 6px;
      overflow: hidden;
      background: var(--color-border);
    }
    progress::-webkit-progress-bar {
      background: var(--color-border);
    }
    progress::-webkit-progress-value {
      background: var(--color-primary);
    }
    progress::-moz-progress-bar {
      background: var(--color-primary);
    }
    .empty {
      padding: 32px 0;
    }
    dialog {
      background: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 24px;
      width: min(460px, calc(100vw - 32px));
      max-height: calc(100dvh - 32px);
      overflow: auto;
    }
    dialog::backdrop {
      background: #0008;
    }
    dialog .actions {
      margin-top: 24px;
      justify-content: flex-end;
    }
    .sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    @media (max-width: 600px) {
      header,
      .row-head {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }
      .actions {
        width: 100%;
      }
      header .primary {
        align-self: flex-start;
      }
      nav a {
        flex: 1;
        padding: 10px 8px;
      }
      .scope {
        align-items: flex-start;
      }
    }
  `;
}
customElements.define('goals-page', GoalsPage);
