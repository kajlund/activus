import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import type {
  ActivityKind,
  ActivityVariant,
  CreateGoalRequest,
  Goal,
  MeasurementDefinition,
  Tag,
} from '@activus/contracts';
import { trapDialogFocus } from '../../components/dialog-focus.js';
import {
  ClientError,
  configurationApi,
  clientMessage,
  type ConfigurationApi,
  type GoalApi,
  type MeasurementApi,
  type TagApi,
} from '../../services/configuration-api.js';
import { navigate, navigationRequest } from '../../routes/navigation.js';
import { sameGoalDefinition, sameProgressCriteria } from './comparison.js';
import { goalReturn, goalsPath } from './state.js';

type GoalFormApi = ConfigurationApi & GoalApi & MeasurementApi & TagApi;
const newGoalBaseline = (): CreateGoalRequest => ({
  name: '',
  description: null,
  activityKindId: '',
  activityVariantId: null,
  tagIds: [],
  targetType: 'activity_count',
  targetValue: 0,
  measurementDefinitionId: null,
  scheduleMode: 'fixed',
  recurrencePeriod: null,
  startDate: '',
  endDate: '',
});
export class GoalFormPage extends LitElement {
  static override properties = {
    route: { type: String },
    api: { attribute: false },
    goal: { state: true },
    kinds: { state: true },
    variants: { state: true },
    measurements: { state: true },
    tags: { state: true },
    busy: { state: true },
    loading: { state: true },
    error: { state: true },
    confirming: { state: true },
    leaving: { state: true },
  };
  route = '/goals/new';
  api: GoalFormApi = configurationApi;
  goal: Goal | undefined;
  kinds: ActivityKind[] = [];
  variants: ActivityVariant[] = [];
  measurements: MeasurementDefinition[] = [];
  tags: Tag[] = [];
  busy = false;
  loading = true;
  error: unknown;
  confirming = false;
  leaving = false;
  private original: Goal | undefined;
  private baseline: CreateGoalRequest | Goal | undefined;
  private dirtyState = false;
  private guardsRegistered = false;
  private pending: CreateGoalRequest | undefined;
  private confirmationTrigger: HTMLElement | undefined;
  private pendingNavigation: (() => void) | undefined;
  private navigationTrigger: HTMLElement | undefined;
  private selectedKindId = '';
  private selectedVariantId = '';
  private selectedMeasurementId = '';
  private selectedTagIds = new Set<string>();

  get dirty() {
    return this.dirtyState;
  }

  private get goalId() {
    return /^\/goals\/([^/]+)\/edit$/.exec(
      new URL(this.route, location.origin).pathname,
    )?.[1];
  }
  private get editing() {
    return !!this.goalId;
  }
  override connectedCallback() {
    super.connectedCallback();
    this.syncGuards();
    void this.load();
  }
  override disconnectedCallback() {
    this.removeGuards();
    this.pendingNavigation = undefined;
    super.disconnectedCallback();
  }
  protected override updated(changed: PropertyValues) {
    if (
      (changed.has('confirming') && this.confirming) ||
      (changed.has('leaving') && this.leaving)
    ) {
      const dialog = this.renderRoot.querySelector<HTMLDialogElement>(
        this.confirming
          ? 'dialog[data-confirmation="recalculation"]'
          : 'dialog[data-confirmation="discard"]',
      );
      if (dialog && !dialog.open) dialog.showModal();
    }
  }

  private beforeRoute = (event: Event) => {
    if (this.busy || this.confirming || !this.dirty) return;
    if (this.leaving) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const request = navigationRequest(event);
    this.pendingNavigation = request?.resume;
    this.navigationTrigger = request?.trigger;
    this.leaving = true;
  };
  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (!this.dirty || this.busy || this.confirming) return;
    event.preventDefault();
    event.returnValue = '';
  };
  private syncGuards() {
    if (!this.isConnected || !this.dirtyState || this.guardsRegistered) return;
    window.addEventListener('before-route-change', this.beforeRoute);
    window.addEventListener('beforeunload', this.beforeUnload);
    this.guardsRegistered = true;
  }
  private removeGuards() {
    if (!this.guardsRegistered) return;
    window.removeEventListener('before-route-change', this.beforeRoute);
    window.removeEventListener('beforeunload', this.beforeUnload);
    this.guardsRegistered = false;
  }
  private setDirty(value: boolean) {
    if (this.dirtyState === value) return;
    this.dirtyState = value;
    if (value) this.syncGuards();
    else this.removeGuards();
  }
  private updateDirty() {
    const form = this.renderRoot.querySelector<HTMLFormElement>('form');
    this.setDirty(
      !!form &&
        !!this.baseline &&
        !sameGoalDefinition(this.baseline, this.request(form)),
    );
  }
  private formChanged = () => this.updateDirty();

  async load() {
    this.loading = true;
    this.error = undefined;
    try {
      const id = this.goalId,
        goal = id ? await this.api.getGoal(id) : undefined;
      const [kinds, tags] = await Promise.all([
        this.api.listKinds(!!goal),
        this.api.listTags(!!goal),
      ]);
      this.goal = goal;
      this.original = goal;
      this.baseline = goal ?? newGoalBaseline();
      this.setDirty(false);
      this.selectedKindId = goal?.activityKindId ?? '';
      this.selectedVariantId = goal?.activityVariantId ?? '';
      this.selectedMeasurementId = goal?.measurementDefinitionId ?? '';
      this.selectedTagIds = new Set(goal?.tagIds ?? []);
      this.kinds = kinds.items.filter(
        (item) => !item.isArchived || item.id === goal?.activityKindId,
      );
      this.tags = tags.items.filter(
        (item) => !item.isArchived || goal?.tagIds.includes(item.id),
      );
      if (goal) await this.loadKindReferences(goal.activityKindId, goal);
    } catch (error) {
      this.error = error;
    } finally {
      this.loading = false;
    }
  }
  private async loadKindReferences(id: string, stored?: Goal) {
    const [variants, result] = await Promise.all([
      this.api.listVariants(id, !!stored),
      this.api.listMeasurements(
        id,
        !!stored,
        stored?.activityVariantId ?? undefined,
      ),
    ]);
    this.variants = variants.items.filter(
      (item) => !item.isArchived || item.id === stored?.activityVariantId,
    );
    this.measurements = result.items.filter(
      (item) =>
        ['decimal', 'integer'].includes(item.valueType) &&
        item.aggregation === 'total' &&
        (stored?.activityVariantId ? true : item.activityVariantId == null) &&
        (!item.isArchived || item.id === stored?.measurementDefinitionId),
    );
  }
  async kindChanged(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedKindId = id;
    this.selectedVariantId = '';
    this.selectedMeasurementId = '';
    this.kinds = this.kinds.filter(
      (item) => !item.isArchived || item.id === id,
    );
    this.variants = [];
    this.measurements = [];
    if (id) await this.loadKindReferences(id);
    this.updateDirty();
  }
  async variantChanged(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedVariantId = select.value;
    this.selectedMeasurementId = '';
    const kind =
      this.renderRoot.querySelector<HTMLSelectElement>('[name=kind]');
    this.variants = this.variants.filter(
      (item) => !item.isArchived || item.id === select.value,
    );
    if (!kind?.value) return;
    const result = await this.api.listMeasurements(
      kind.value,
      false,
      select.value || undefined,
    );
    this.measurements = result.items.filter(
      (item) =>
        ['decimal', 'integer'].includes(item.valueType) &&
        item.aggregation === 'total' &&
        (select.value ? true : item.activityVariantId == null) &&
        !item.isArchived,
    );
    this.updateDirty();
  }
  private measurementChanged(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedMeasurementId = id;
    this.measurements = this.measurements.filter(
      (item) => !item.isArchived || item.id === id,
    );
  }
  private tagChanged(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.checked) this.selectedTagIds.add(input.value);
    else this.selectedTagIds.delete(input.value);
    if (!input.checked)
      this.tags = this.tags.filter(
        (item) => !item.isArchived || item.id !== input.value,
      );
  }

  private request(form: HTMLFormElement): CreateGoalRequest {
    const fields = new FormData(form),
      targetType = String(fields.get('targetType'));
    return {
      name: String(fields.get('name')).trim(),
      description: String(fields.get('description')).trim() || null,
      activityKindId: String(fields.get('kind')),
      activityVariantId: String(fields.get('variant')) || null,
      tagIds: fields.getAll('tag').map(String),
      targetType,
      targetValue:
        targetType === 'measurement_total'
          ? String(fields.get('value'))
          : targetType === 'total_duration'
            ? Number(fields.get('hours') || 0) * 3600 +
              Number(fields.get('minutes') || 0) * 60
            : Number(fields.get('value')),
      measurementDefinitionId:
        targetType === 'measurement_total'
          ? String(fields.get('measurement'))
          : null,
      scheduleMode: String(fields.get('schedule')),
      recurrencePeriod:
        fields.get('schedule') === 'recurring'
          ? String(fields.get('recurrence'))
          : null,
      startDate: String(fields.get('start')),
      endDate: String(fields.get('end')),
    } as CreateGoalRequest;
  }
  async save(event: SubmitEvent) {
    event.preventDefault();
    if (this.busy || this.loading || this.leaving) return;
    const input = this.request(event.currentTarget as HTMLFormElement);
    if (this.original && !sameProgressCriteria(this.original, input)) {
      this.pending = input;
      this.confirmationTrigger = event.submitter as HTMLElement | undefined;
      this.leaving = false;
      this.confirming = true;
      return;
    }
    await this.submit(input);
  }
  private async confirmSave() {
    if (this.busy || !this.pending) return;
    const input = this.pending;
    this.pending = undefined;
    this.confirming = false;
    await this.submit(input);
  }
  private async reviewChanges() {
    if (this.busy) return;
    this.pending = undefined;
    this.renderRoot.querySelector<HTMLDialogElement>('dialog')?.close();
    this.confirming = false;
    await this.updateComplete;
    this.confirmationTrigger?.focus();
  }
  private async keepEditing() {
    this.pendingNavigation = undefined;
    this.renderRoot
      .querySelector<HTMLDialogElement>('dialog[data-confirmation="discard"]')
      ?.close();
    this.leaving = false;
    await this.updateComplete;
    this.navigationTrigger?.focus();
    this.navigationTrigger = undefined;
  }
  private discardChanges() {
    const resume = this.pendingNavigation;
    this.pendingNavigation = undefined;
    this.navigationTrigger = undefined;
    this.leaving = false;
    this.setDirty(false);
    resume?.();
  }
  private async submit(input: CreateGoalRequest) {
    if (this.busy) return;
    this.busy = true;
    this.error = undefined;
    try {
      if (this.goalId) {
        const saved = await this.api.updateGoal(this.goalId, input);
        this.goal = saved;
        this.original = saved;
        this.baseline = saved;
        this.selectedKindId = saved.activityKindId;
        this.selectedVariantId = saved.activityVariantId ?? '';
        this.selectedMeasurementId = saved.measurementDefinitionId ?? '';
        this.selectedTagIds = new Set(saved.tagIds);
      } else {
        this.goal = await this.api.createGoal(input);
        this.baseline = input;
      }
      this.setDirty(false);
      const destination = this.goal
        ? goalsPath(this.goal.lifecycle)
        : goalReturn(this.route);
      navigate(`${destination}${destination.includes('?') ? '&' : '?'}saved=1`);
    } catch (error) {
      this.error = error;
    } finally {
      this.busy = false;
      this.updateDirty();
    }
  }
  private value(name: keyof Goal, fallback = '') {
    return this.goal ? String(this.goal[name] ?? fallback) : fallback;
  }
  private label(item: { name: string; isArchived?: boolean }) {
    return `${item.name}${item.isArchived ? ' (Archived)' : ''}`;
  }

  override render() {
    if (this.loading) return html`<p role="status">Loading goal…</p>`;
    if (this.error && !this.goal)
      return html`${this.error instanceof ClientError && this.error.kind === 'not-found' ? html`<h1>Goal not found</h1>` : html`<h1>Goal unavailable</h1>`}
        <p role="alert">${clientMessage(this.error)}</p>
        <button @click=${this.load}>Retry goal</button>`;
    const goal = this.goal,
      duration =
        goal?.targetType === 'total_duration' ? Number(goal.targetValue) : 0;
    return html`<header>
        <h1>${this.editing ? 'Edit goal' : 'New goal'}</h1>
        <p>Define what you want your journal to track.</p>
      </header>
      <form
        @submit=${this.save}
        @input=${this.formChanged}
        @change=${this.formChanged}
      >
        <section>
          <h2>Goal</h2>
          <label
            >Name
            <input
              required
              name="name"
              maxlength="120"
              .value=${this.value('name')} /></label
          ><label
            >Description
            <textarea
              name="description"
              maxlength="10000"
              .value=${this.value('description')}
            ></textarea>
          </label>
        </section>
        <section>
          <h2>What counts</h2>
          <label
            >Activity kind
            <select required name="kind" @change=${this.kindChanged}>
              <option value="" .selected=${!this.selectedKindId}>
                Choose a kind
              </option>
              ${this.kinds.map((item) => html`<option value=${item.id} .selected=${item.id === this.selectedKindId}>${this.label(item)}</option>`)}
            </select></label
          >
          <label
            >Variant
            <select name="variant" @change=${this.variantChanged}>
              <option value="" .selected=${!this.selectedVariantId}>
                Any variant
              </option>
              ${this.variants.map((item) => html`<option value=${item.id} .selected=${item.id === this.selectedVariantId}>${this.label(item)}</option>`)}
            </select></label
          >
          <p>Several selected tags must all be present.</p>
          ${this.tags.map((item) => html`<label><input type="checkbox" name="tag" value=${item.id} .checked=${this.selectedTagIds.has(item.id)} @change=${this.tagChanged} /> ${this.label(item)}</label>`)}
        </section>
        <section>
          <h2>What to reach</h2>
          <fieldset>
            <legend>Target type</legend>
            ${[
              ['activity_count', 'Number of activities'],
              ['total_duration', 'Total duration'],
              ['measurement_total', 'Measurement total'],
            ].map(
              ([value, label]) =>
                html`<label
                  ><input
                    type="radio"
                    name="targetType"
                    value=${value}
                    .checked=${(goal?.targetType ?? 'activity_count') === value}
                  />
                  ${label}</label
                >`,
            )}
          </fieldset>
          <label
            >Target value
            <input
              required
              name="value"
              inputmode="decimal"
              .value=${goal?.targetType === 'total_duration' ? '' : this.value('targetValue')}
          /></label>
          <label
            >Hours
            <input
              name="hours"
              type="number"
              min="0"
              .value=${String(Math.floor(duration / 3600))} /></label
          ><label
            >Minutes
            <input
              name="minutes"
              type="number"
              min="0"
              max="59"
              .value=${String(Math.floor((duration % 3600) / 60))}
          /></label>
          <label
            >Measurement
            <select name="measurement" @change=${this.measurementChanged}>
              <option value="" .selected=${!this.selectedMeasurementId}>
                Choose a measurement
              </option>
              ${this.measurements.map((item) => html`<option value=${item.id} .selected=${item.id === this.selectedMeasurementId}>${this.label(item)} ${item.displayUnit ?? item.canonicalUnit ?? ''}</option>`)}
            </select></label
          >
        </section>
        <section>
          <h2>When</h2>
          <fieldset>
            <legend>Schedule</legend>
            ${[
              ['fixed', 'Fixed total'],
              ['recurring', 'Recurring'],
            ].map(
              ([value, label]) =>
                html`<label
                  ><input
                    type="radio"
                    name="schedule"
                    value=${value}
                    .checked=${(goal?.scheduleMode ?? 'fixed') === value}
                  />
                  ${label}</label
                >`,
            )}
          </fieldset>
          <label
            >Recurrence
            <select
              name="recurrence"
              .value=${this.value('recurrencePeriod', 'week')}
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select></label
          >
          <label
            >Start
            <input
              required
              type="date"
              name="start"
              .value=${this.value('startDate')} /></label
          ><label
            >End
            <input
              required
              type="date"
              name="end"
              .value=${this.value('endDate')}
          /></label>
          <p>Recurring targets reset in every selected calendar period.</p>
        </section>
        ${this.error ? html`<p role="alert">${clientMessage(this.error)}</p>` : nothing}
        <footer>
          <button class="primary" ?disabled=${this.busy || this.loading}>
            ${this.busy ? 'Saving…' : this.editing ? 'Save changes' : 'Create goal'}</button
          ><button
            type="button"
            @click=${(event: Event) => navigate(goalReturn(this.route), event.currentTarget as HTMLElement)}
          >
            Cancel
          </button>
        </footer>
      </form>
      ${
        this.confirming
          ? html`<dialog
              data-confirmation="recalculation"
              aria-labelledby="recalculation-title"
              @keydown=${trapDialogFocus}
              @cancel=${(event: Event) => {
                event.preventDefault();
                void this.reviewChanges();
              }}
            >
              <h2 id="recalculation-title">Recalculate past progress?</h2>
              <p>
                This changes which activities count or how progress is measured.
                Past progress will be recalculated using the updated goal.
              </p>
              <div class="actions">
                <button
                  autofocus
                  ?disabled=${this.busy}
                  @click=${this.reviewChanges}
                >
                  Review changes</button
                ><button
                  class="primary"
                  ?disabled=${this.busy}
                  @click=${this.confirmSave}
                >
                  ${this.busy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </dialog>`
          : nothing
      }
      ${
        this.leaving
          ? html`<dialog
              data-confirmation="discard"
              aria-labelledby="discard-title"
              @keydown=${trapDialogFocus}
              @cancel=${(event: Event) => {
                event.preventDefault();
                void this.keepEditing();
              }}
            >
              <h2 id="discard-title">Discard unsaved changes?</h2>
              <p>You have unsaved changes. Leave this page and discard them?</p>
              <div class="actions">
                <button autofocus @click=${this.keepEditing}>
                  Keep editing
                </button>
                <button class="danger" @click=${this.discardChanges}>
                  Discard changes
                </button>
              </div>
            </dialog>`
          : nothing
      }`;
  }
  static override styles = css`
    :host {
      display: block;
      max-width: 760px;
      margin: auto;
    }
    section {
      display: grid;
      gap: 12px;
      padding: 24px 0;
      border-top: 1px solid var(--color-border);
    }
    label {
      display: grid;
      gap: 4px;
    }
    input,
    select,
    textarea {
      min-height: 44px;
      padding: 8px;
      font: inherit;
      background: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-control-border);
      border-radius: var(--radius-md);
    }
    fieldset {
      display: grid;
      gap: 8px;
      border: 0;
      padding: 0;
    }
    footer,
    .actions {
      display: flex;
      gap: 12px;
      padding: 24px 0;
    }
    .primary {
      background: var(--color-primary);
      color: white;
    }
    dialog {
      max-width: 520px;
      color: var(--color-text);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 24px;
    }
    dialog::backdrop {
      background: rgb(0 0 0 / 45%);
    }
  `;
}
customElements.define('goal-form-page', GoalFormPage);
export class GoalCreatePage extends GoalFormPage {}
customElements.define('goal-create-page', GoalCreatePage);
