import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { measurementUnits } from '@activus/contracts';
import { goalStyles } from './styles.js';
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
import { goalReturn, goalsPath, safeGoalDetailReturn } from './state.js';

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
    targetType: { state: true },
    scheduleMode: { state: true },
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
  private loadFailed = false;
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
  private targetType: Goal['targetType'] = 'activity_count';
  private scheduleMode: Goal['scheduleMode'] = 'fixed';
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
    this.loadFailed = false;
    this.error = undefined;
    try {
      const id = this.goalId,
        goal = id ? await this.api.getGoal(id) : undefined;
      const [kinds, tags] = await Promise.all([
        this.api.listKinds(!!goal),
        this.api.listTags(!!goal),
      ]);
      this.goal = goal;
      this.targetType = goal?.targetType ?? 'activity_count';
      this.scheduleMode = goal?.scheduleMode ?? 'fixed';
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
      this.loadFailed = true;
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
              Number(fields.get('minutes') || 0) * 60 +
              Number(fields.get('seconds') || 0)
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
    const previous = this.original;
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
      let destination =
        safeGoalDetailReturn(
          new URL(this.route, location.origin).searchParams.get('returnTo'),
        ) ??
        (this.goal ? goalsPath(this.goal.lifecycle) : goalReturn(this.route));
      if (
        previous &&
        this.goal &&
        (previous.scheduleMode !== this.goal.scheduleMode ||
          previous.recurrencePeriod !== this.goal.recurrencePeriod ||
          previous.startDate !== this.goal.startDate ||
          previous.endDate !== this.goal.endDate)
      ) {
        // A formerly valid weekly/clipped period may not exist after editing
        // the schedule. Let detail choose the new server-provided default.
        const url = new URL(destination, location.origin);
        url.searchParams.delete('period');
        destination = url.pathname + url.search;
      }
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
    if (this.loadFailed)
      return html`${this.error instanceof ClientError && this.error.kind === 'not-found' ? html`<h1>Goal not found</h1>` : html`<h1>Goal unavailable</h1>`}
        <p role="alert">${clientMessage(this.error)}</p>
        <button @click=${this.load}>Retry goal</button>`;
    const measurement = this.measurements.find(
      (m) => m.id === this.selectedMeasurementId,
    );
    const unit = measurementUnits.find(
      (u) => u.id === measurement?.canonicalUnit,
    );
    const goal = this.goal,
      duration =
        goal?.targetType === 'total_duration' ? Number(goal.targetValue) : 0;
    return html`<header>
        <div>
          <h1>${this.editing ? 'Edit goal' : 'Create goal'}</h1>
          <p class="muted">Define what you want your journal to track.</p>
        </div>
      </header>
      <form
        @submit=${this.save}
        @input=${this.formChanged}
        @change=${this.formChanged}
      >
        <section>
          <h2>Goal</h2>
          <div class="fields">
            <label
              >Name *
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
          </div>
        </section>
        <section>
          <h2>What counts</h2>
          <div class="fields">
            <label
              >Activity kind *
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
            <fieldset class="tag-options">
              <legend>Required tags</legend>
              <p class="help">Activities must include every selected tag.</p>
              ${this.tags.map((item) => html`<label class="choice"><input type="checkbox" name="tag" value=${item.id} .checked=${this.selectedTagIds.has(item.id)} @change=${this.tagChanged} /> ${this.label(item)}</label>`)}
            </fieldset>
          </div>
        </section>
        <section>
          <h2>What to reach</h2>
          <div class="fields">
            <fieldset>
              <legend>Target type *</legend>
              ${[
                ['activity_count', 'Number of activities'],
                ['total_duration', 'Total duration'],
                ['measurement_total', 'Measurement total'],
              ].map(
                ([value, label]) =>
                  html`<label class="choice"
                    ><input
                      type="radio"
                      name="targetType"
                      @change=${async (event: Event) => {
                        this.targetType = (event.target as HTMLInputElement)
                          .value as Goal['targetType'];
                        await this.updateComplete;
                        this.updateDirty();
                      }}
                      value=${value}
                      .checked=${this.targetType === value}
                    />
                    ${label}</label
                  >`,
              )}
            </fieldset>
            <label
              class="number-field"
              ?hidden=${this.targetType === 'total_duration'}
              >Target value *
              <span class="value-unit"
                ><input
                  ?required=${this.targetType !== 'total_duration'}
                  ?disabled=${this.targetType === 'total_duration'}
                  aria-describedby="target-unit"
                  name="value"
                  inputmode="decimal"
                  .value=${goal?.targetType === 'total_duration' ? '' : this.value('targetValue')}
                /><span id="target-unit"
                  >${this.targetType === 'activity_count' ? 'activities' : (unit?.label ?? '')}</span
                ></span
              ></label
            >
            <div
              class="duration-fields"
              ?hidden=${this.targetType !== 'total_duration'}
            >
              <label
                >Hours
                <input
                  name="hours"
                  ?disabled=${this.targetType !== 'total_duration'}
                  type="number"
                  min="0"
                  .value=${String(Math.floor(duration / 3600))} /></label
              ><label
                >Minutes
                <input
                  name="minutes"
                  ?disabled=${this.targetType !== 'total_duration'}
                  type="number"
                  min="0"
                  max="59"
                  .value=${String(Math.floor((duration % 3600) / 60))}
              /></label>
              <label
                >Seconds<input
                  name="seconds"
                  type="number"
                  min="0"
                  max="59"
                  ?disabled=${this.targetType !== 'total_duration'}
                  .value=${String(duration % 60)}
              /></label>
            </div>
            <label ?hidden=${this.targetType !== 'measurement_total'}
              >Measurement *
              <select
                ?required=${this.targetType === 'measurement_total'}
                ?disabled=${this.targetType !== 'measurement_total'}
                name="measurement"
                @change=${this.measurementChanged}
              >
                <option value="" .selected=${!this.selectedMeasurementId}>
                  Choose a measurement
                </option>
                ${this.measurements.map((item) => html`<option value=${item.id} .selected=${item.id === this.selectedMeasurementId}>${this.label(item)} ${measurementUnits.find((u) => u.id === item.canonicalUnit)?.label ?? ''}</option>`)}
              </select></label
            >
          </div>
        </section>
        <section>
          <h2>When</h2>
          <div class="fields when-fields">
            <fieldset>
              <legend>Schedule *</legend>
              ${[
                ['fixed', 'Fixed total'],
                ['recurring', 'Recurring'],
              ].map(
                ([value, label]) =>
                  html`<label class="choice"
                    ><input
                      type="radio"
                      name="schedule"
                      @change=${async (event: Event) => {
                        this.scheduleMode = (event.target as HTMLInputElement)
                          .value as Goal['scheduleMode'];
                        await this.updateComplete;
                        this.updateDirty();
                      }}
                      value=${value}
                      .checked=${this.scheduleMode === value}
                    />
                    ${label}</label
                  >`,
              )}
            </fieldset>
            <label ?hidden=${this.scheduleMode !== 'recurring'}
              >Recurrence *
              <select
                name="recurrence"
                ?disabled=${this.scheduleMode !== 'recurring'}
                .value=${this.value('recurrencePeriod', 'week')}
              >
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select></label
            >
            <label
              >Start *
              <input
                required
                type="date"
                name="start"
                .value=${this.value('startDate')} /></label
            ><label
              >End *
              <input
                required
                type="date"
                name="end"
                .value=${this.value('endDate')}
            /></label>
            <p class="help full" ?hidden=${this.scheduleMode !== 'recurring'}>
              Targets reset each calendar period. Boundary periods include only
              dates within the goal range.
            </p>
          </div>
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
  static override styles = [
    goalStyles,
    css`
      :host {
        max-width: 880px;
      }
      section {
        display: grid;
        grid-template-columns: 150px minmax(0, 1fr);
        gap: var(--space-5);
        padding: var(--space-5) 0;
        border-top: 1px solid var(--color-border);
      }
      section h2 {
        padding-top: var(--space-2);
      }
      .fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-4);
        min-width: 0;
      }
      label {
        display: grid;
        align-content: start;
        gap: var(--space-2);
        min-width: 0;
        font-size: var(--font-size-small);
      }
      input,
      select,
      textarea {
        width: 100%;
        min-width: 0;
        font: inherit;
        min-height: 44px;
        background: var(--color-input);
        color: var(--color-text);
        border: 1px solid var(--color-control-border);
        border-radius: var(--radius-sm);
        padding: var(--space-2) var(--space-3);
      }
      textarea {
        min-height: 80px;
        resize: vertical;
      }
      input[type='radio'],
      input[type='checkbox'] {
        min-height: 18px;
        width: 18px;
        padding: 0;
      }
      fieldset {
        grid-column: 1 / -1;
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        border: 0;
        padding: 0;
        margin: 0;
        min-width: 0;
      }
      legend {
        font-size: var(--font-size-small);
        margin-bottom: var(--space-2);
      }
      .choice {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-height: 44px;
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        cursor: pointer;
      }
      .choice:has(:checked) {
        background: var(--color-primary-soft);
        border-color: var(--color-primary);
      }
      .tag-options p {
        flex-basis: 100%;
        margin: 0;
      }
      .value-unit {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .value-unit input {
        max-width: 150px;
      }
      .duration-fields {
        display: flex;
        gap: var(--space-3);
        grid-column: 1 / -1;
      }
      .duration-fields label {
        max-width: 100px;
      }
      .when-fields {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .full {
        grid-column: 1 / -1;
      }
      footer {
        display: flex;
        gap: var(--space-3);
        padding: var(--space-5) 0;
        border-top: 1px solid var(--color-border);
      }
      @media (max-width: 700px) {
        section {
          grid-template-columns: minmax(0, 1fr);
          gap: var(--space-4);
        }
      }
      @media (max-width: 440px) {
        .fields {
          grid-template-columns: minmax(0, 1fr);
        }
        .choice {
          width: 100%;
        }
      }
    `,
  ];
}
customElements.define('goal-form-page', GoalFormPage);
export class GoalCreatePage extends GoalFormPage {}
customElements.define('goal-create-page', GoalCreatePage);
