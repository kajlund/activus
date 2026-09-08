import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import {
  CreateActivityRequestSchema,
  UpdateActivityRequestSchema,
  measurementUnits,
  type Activity,
  type ActivityKind,
  type ActivityVariant,
  type MeasurementDefinition,
  type Tag,
  type ActivityMeasurementInput,
  type UpdateActivityRequest,
} from '@activus/contracts';
import {
  configurationApi,
  clientMessage,
  ClientError,
  type ConfigurationApi,
  type MeasurementApi,
  type TagApi,
  type ActivityApi,
} from '../../services/configuration-api.js';
import { navigate } from '../../routes/navigation.js';
import { activityIcon } from '../activity-kinds/icons.js';
import { managementStyles } from '../activity-kinds/styles.js';
import {
  durationSeconds,
  splitDuration,
  localDate,
  localInstant,
  startInstant,
  measurementInput,
} from './values.js';
import './tag-picker.js';
import { safeReturn, withReturn, withNotice } from '../journal/state.js';

export type EditorApi = Pick<ConfigurationApi, 'listKinds' | 'listVariants'> &
  Pick<MeasurementApi, 'listMeasurements'> &
  Pick<TagApi, 'listTags'> &
  ActivityApi;
type Draft = {
  activityKindId: string;
  activityVariantId: string;
  activityDate: string;
  start: string;
  occurrence: 'earlier' | 'later';
  hours: string;
  minutes: string;
  seconds: string;
  name: string;
  notes: string;
  effort: string;
  feeling: string;
  tagIds: string[];
};
const fresh = (): Draft => ({
  activityKindId: '',
  activityVariantId: '',
  activityDate: localDate(),
  start: '',
  occurrence: 'earlier',
  hours: '',
  minutes: '',
  seconds: '',
  name: '',
  notes: '',
  effort: '',
  feeling: '',
  tagIds: [],
});
export class ActivityEditorPage extends LitElement {
  static override properties = {
    route: { type: String },
    api: { attribute: false },
    draft: { state: true },
    values: { state: true },
    loading: { state: true },
    resolving: { state: true },
    busy: { state: true },
    error: { state: true },
    configurationError: { state: true },
    saveError: { state: true },
    errors: { state: true },
    definitions: { state: true },
    variants: { state: true },
    status: { state: true },
  };
  route = location.pathname + location.search;
  api: EditorApi = configurationApi;
  private draft = fresh();
  private values: Record<string, string> = {};
  private initialValues: Record<string, string> = {};
  private initialDraft = fresh();
  private original: Activity | undefined;
  private kinds: ActivityKind[] = [];
  private variants: ActivityVariant[] = [];
  private tags: Tag[] = [];
  private definitions: MeasurementDefinition[] = [];
  private knownDefinitions = new Map<string, MeasurementDefinition>();
  private loading = true;
  private resolving = false;
  private busy = false;
  private error: unknown;
  private configurationError: unknown;
  private saveError: unknown;
  private errors: Record<string, string> = {};
  private status = '';
  private generation = 0;
  private selectionGeneration = 0;
  private reads: AbortController | undefined;
  private selection: AbortController | undefined;
  private mutation: AbortController | undefined;
  private get activityId() {
    return new URL(this.route, location.origin).pathname.match(
      /^\/activities\/([^/]+)\/edit$/,
    )?.[1];
  }
  private get sameScope() {
    return (
      this.original?.activityKindId === this.draft.activityKindId &&
      (this.original.activityVariantId ?? '') === this.draft.activityVariantId
    );
  }
  get dirty() {
    return (
      !this.loading &&
      (JSON.stringify(this.draft) !== JSON.stringify(this.initialDraft) ||
        JSON.stringify(this.values) !== JSON.stringify(this.initialValues))
    );
  }
  private beforeRoute = (e: Event) => {
    if (
      this.busy ||
      (this.dirty &&
        !window.confirm(
          'Discard your unsaved activity changes and leave this view?',
        ))
    )
      e.preventDefault();
  };
  private beforeUnload = (e: BeforeUnloadEvent) => {
    if (this.dirty || this.busy) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('before-route-change', this.beforeRoute);
    window.addEventListener('beforeunload', this.beforeUnload);
  }
  override disconnectedCallback() {
    this.reads?.abort();
    this.selection?.abort();
    this.mutation?.abort();
    this.generation++;
    this.selectionGeneration++;
    window.removeEventListener('before-route-change', this.beforeRoute);
    window.removeEventListener('beforeunload', this.beforeUnload);
    super.disconnectedCallback();
  }
  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('route') || changed.has('api')) void this.load();
  }
  async load() {
    this.reads?.abort();
    this.selection?.abort();
    this.selectionGeneration++;
    const controller = (this.reads = new AbortController());
    const generation = ++this.generation;
    this.loading = true;
    this.error = undefined;
    this.saveError = undefined;
    this.errors = {};
    this.configurationError = undefined;
    this.status = '';
    try {
      const [kinds, tags, activity] = await Promise.all([
        this.api.listKinds(!!this.activityId, controller.signal),
        this.api.listTags(false, undefined, controller.signal),
        this.activityId
          ? this.api.getActivity(this.activityId, controller.signal)
          : Promise.resolve(undefined),
      ]);
      if (generation !== this.generation) return;
      this.original = activity;
      this.kinds = kinds.items.filter(
        (k) => !k.isArchived || k.id === activity?.activityKindId,
      );
      this.tags = tags.items.filter((t) => !t.isArchived);
      this.draft = fresh();
      this.values = {};
      this.knownDefinitions.clear();
      this.definitions = [];
      this.variants = [];
      if (activity) {
        const [hours, minutes, seconds] = splitDuration(
          activity.durationSeconds,
        );
        this.draft = {
          activityKindId: activity.activityKindId,
          activityVariantId: activity.activityVariantId ?? '',
          activityDate: activity.activityDate,
          start: localInstant(activity.startedAt),
          occurrence: 'earlier',
          hours,
          minutes,
          seconds,
          name: activity.name ?? '',
          notes: activity.notes ?? '',
          effort: activity.effort === null ? '' : String(activity.effort),
          feeling: activity.feeling === null ? '' : String(activity.feeling),
          tagIds: activity.tags.map((t) => t.id),
        };
        for (const m of activity.measurements)
          this.values[m.measurementDefinitionId] =
            m.valueType === 'duration' && m.displayUnit === 'hour-minute'
              ? splitDuration(m.canonicalValue)
                  .map((v, i) => (i ? v.padStart(2, '0') : v))
                  .join(':')
              : String(m.displayValue);
      }
      this.initialDraft = structuredClone(this.draft);
      this.initialValues = { ...this.values };
      this.loading = false;
      if (this.draft.activityKindId) await this.resolve(true);
      if (
        generation === this.generation &&
        new URL(this.route, location.origin).searchParams.get('saved') === '1'
      )
        this.status = 'Activity saved.';
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted)
        this.error = error;
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }
  private async resolve(loadVariants: boolean, applyDefault = false) {
    this.selection?.abort();
    const controller = (this.selection = new AbortController());
    const generation = ++this.selectionGeneration;
    this.resolving = true;
    this.configurationError = undefined;
    this.definitions = [];
    const kindId = this.draft.activityKindId;
    if (!kindId) {
      this.variants = [];
      this.resolving = false;
      return;
    }
    try {
      if (loadVariants) {
        const variants = await this.api.listVariants(
          kindId,
          !!this.original,
          controller.signal,
        );
        if (generation !== this.selectionGeneration) return;
        this.variants = variants.items.filter(
          (v) =>
            !v.isArchived ||
            (v.id === this.original?.activityVariantId &&
              kindId === this.original.activityKindId),
        );
        if (applyDefault)
          this.draft = {
            ...this.draft,
            activityVariantId:
              (kindId === this.original?.activityKindId
                ? this.original.activityVariantId
                : this.variants.find((v) => v.isDefault && !v.isArchived)
                    ?.id) ?? '',
          };
      }
      const result = await this.api.listMeasurements(
        kindId,
        !!this.original,
        this.draft.activityVariantId || undefined,
        controller.signal,
      );
      if (generation !== this.selectionGeneration) return;
      this.definitions = result.items.filter(
        (d) =>
          (d.activityVariantId === null ||
            d.activityVariantId === this.draft.activityVariantId) &&
          (!d.isArchived ||
            (this.sameScope &&
              this.original?.measurements.some(
                (m) => m.measurementDefinitionId === d.id,
              ))),
      );
      for (const d of this.definitions) this.knownDefinitions.set(d.id, d);
      if (
        this.sameScope &&
        this.original?.measurements.some(
          (m) =>
            !this.definitions.some((d) => d.id === m.measurementDefinitionId),
        )
      )
        throw new ClientError('unexpected', 'HISTORICAL_DEFINITION_MISSING');
    } catch (error) {
      if (generation === this.selectionGeneration && !controller.signal.aborted)
        this.configurationError = error;
    } finally {
      if (generation === this.selectionGeneration) this.resolving = false;
    }
  }
  private change(key: keyof Draft, value: string | string[]) {
    if (this.busy) return;
    this.draft = { ...this.draft, [key]: value };
    this.errors = {};
    this.saveError = undefined;
    this.status = '';
    if (key === 'activityKindId') {
      this.draft = { ...this.draft, activityVariantId: '' };
      this.variants = [];
      void this.resolve(true, true);
    }
    if (key === 'activityVariantId') void this.resolve(false);
  }
  private get hiddenValues() {
    return Object.entries(this.values).filter(
      ([id, value]) =>
        value.trim() && !this.definitions.some((d) => d.id === id),
    );
  }
  private originalInput(id: string): ActivityMeasurementInput | undefined {
    const m = this.original?.measurements.find(
      (m) => m.measurementDefinitionId === id,
    );
    if (!m) return;
    if (m.valueType === 'decimal')
      return {
        measurementDefinitionId: id,
        valueType: 'decimal',
        value: m.canonicalValue,
        ...(m.canonicalUnit ? { unitId: m.canonicalUnit } : {}),
      };
    if (m.valueType === 'integer')
      return {
        measurementDefinitionId: id,
        valueType: 'integer',
        value: m.canonicalValue,
        ...(m.canonicalUnit ? { unitId: m.canonicalUnit } : {}),
      };
    if (m.valueType === 'duration')
      return {
        measurementDefinitionId: id,
        valueType: 'duration',
        value: m.canonicalValue,
        unitId: 'second',
      };
    if (m.valueType === 'rating')
      return {
        measurementDefinitionId: id,
        valueType: 'rating',
        value: m.canonicalValue,
      };
    if (m.valueType === 'boolean')
      return {
        measurementDefinitionId: id,
        valueType: 'boolean',
        value: m.canonicalValue,
      };
    if (m.valueType === 'text')
      return {
        measurementDefinitionId: id,
        valueType: 'text',
        value: m.canonicalValue,
      };
    return;
  }
  private async focusError() {
    await this.updateComplete;
    const control = this.renderRoot.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    const details = control?.closest('details');
    if (details) details.open = true;
    control?.focus();
  }
  private async save(e: Event) {
    e.preventDefault();
    if (
      this.loading ||
      this.resolving ||
      this.configurationError ||
      this.error ||
      this.busy
    )
      return;
    this.errors = {};
    this.saveError = undefined;
    const errors: Record<string, string> = {};
    let duration: number | null = null;
    let startedAt: string | null = null;
    try {
      duration = durationSeconds(
        this.draft.hours,
        this.draft.minutes,
        this.draft.seconds,
      );
    } catch (error) {
      errors['hours'] = (error as Error).message;
    }
    try {
      startedAt =
        this.original &&
        this.draft.start === this.initialDraft.start &&
        this.draft.occurrence === this.initialDraft.occurrence
          ? this.original.startedAt
          : startInstant(this.draft.start, this.draft.occurrence);
    } catch (error) {
      errors['start'] = (error as Error).message;
    }
    if (!this.kinds.some((k) => k.id === this.draft.activityKindId))
      errors['activityKindId'] = 'Choose an activity kind.';
    if (
      this.draft.activityVariantId &&
      !this.variants.some((v) => v.id === this.draft.activityVariantId)
    )
      errors['activityVariantId'] = 'Choose a variant belonging to this kind.';
    const measurements: ActivityMeasurementInput[] = [];
    for (const d of this.definitions) {
      const value = this.values[d.id] ?? '';
      try {
        const input =
          this.original && value === this.initialValues[d.id]
            ? this.originalInput(d.id)
            : measurementInput(d, value);
        if (input) measurements.push(input);
        else if (d.isRequired && !d.isArchived && !this.original?.isPartial)
          errors[`m-${d.id}`] = 'Enter this required measurement.';
      } catch (error) {
        errors[`m-${d.id}`] =
          error instanceof Error && error.name !== 'ZodError'
            ? error.message
            : 'Check the value format and permitted length.';
      }
    }
    const parsed = CreateActivityRequestSchema.safeParse({
      activityKindId: this.draft.activityKindId,
      activityVariantId: this.draft.activityVariantId || null,
      activityDate: this.draft.activityDate,
      startedAt,
      durationSeconds: duration,
      name: this.draft.name,
      notes: this.draft.notes,
      effort: this.draft.effort ? Number(this.draft.effort) : null,
      feeling: this.draft.feeling ? Number(this.draft.feeling) : null,
      tagIds: this.draft.tagIds,
      isPartial: this.original?.isPartial ?? false,
      measurements,
    });
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const field =
          issue.path[0] === 'startedAt' ? 'start' : String(issue.path[0]);
        errors[field] ??=
          field === 'activityDate'
            ? 'Enter a valid calendar date.'
            : field === 'activityKindId'
              ? 'Choose an activity kind.'
              : 'Check this value and its permitted length.';
      }
    if (Object.keys(errors).length || !parsed.success) {
      this.errors = errors;
      void this.focusError();
      return;
    }
    if (
      this.hiddenValues.length &&
      !window.confirm(
        'Save without the measurements that do not apply to this selection? Their values will be discarded after saving.',
      )
    )
      return;
    this.busy = true;
    this.status = 'Saving activity…';
    const controller = (this.mutation = new AbortController());
    try {
      let saved: Activity;
      if (this.original) {
        const patch: UpdateActivityRequest = {};
        for (const key of [
          'activityKindId',
          'activityVariantId',
          'activityDate',
          'startedAt',
          'durationSeconds',
          'name',
          'notes',
          'effort',
          'feeling',
        ] as const)
          if (parsed.data[key] !== this.original[key])
            Object.assign(patch, { [key]: parsed.data[key] });
        if (
          !this.sameScope ||
          JSON.stringify(this.values) !== JSON.stringify(this.initialValues)
        )
          patch.measurements = measurements;
        if (
          JSON.stringify([...this.draft.tagIds].sort()) !==
          JSON.stringify(this.original.tags.map((t) => t.id).sort())
        )
          patch.tagIds = this.draft.tagIds;
        saved = Object.keys(patch).length
          ? await this.api.updateActivity(
              this.original.id,
              UpdateActivityRequestSchema.parse(patch),
              controller.signal,
            )
          : this.original;
      } else
        saved = await this.api.createActivity(parsed.data, controller.signal);
      this.initialDraft = structuredClone(this.draft);
      this.initialValues = { ...this.values };
      this.busy = false;
      const returnTo = safeReturn(
        new URL(this.route, location.origin).searchParams.get('returnTo'),
      );
      const target = this.original
        ? withNotice(
            new URL(this.route, location.origin).searchParams.has('returnTo')
              ? returnTo
              : `/activities/${saved.id}`,
            'saved',
            new URL(returnTo, location.origin).pathname === '/activities' &&
              new URL(this.route, location.origin).searchParams.has('returnTo')
              ? saved.id
              : '1',
          )
        : withNotice(
            withReturn(`/activities/${saved.id}`, returnTo),
            'saved',
            '1',
          );
      if (target === this.route) await this.load();
      else navigate(target);
    } catch (error) {
      this.saveError = error;
      this.status = '';
      if (error instanceof ClientError) {
        for (const id of error.details?.missingDefinitionIds ?? [])
          errors[`m-${id}`] =
            'This measurement is required by the current configuration.';
        for (const id of error.details?.incompatibleDefinitionIds ?? [])
          errors[`m-${id}`] =
            'This measurement no longer applies. Review the kind and variant.';
        if (error.code === 'ACTIVITY_KIND_ARCHIVED')
          errors['activityKindId'] =
            'This kind is archived. Choose an active kind.';
        if (
          error.code === 'ACTIVITY_VARIANT_ARCHIVED' ||
          error.code === 'ACTIVITY_VARIANT_KIND_MISMATCH'
        )
          errors['activityVariantId'] =
            'Review the selected variant; it is unavailable for this activity.';
      }
      this.errors = errors;
      void this.focusError();
    } finally {
      this.busy = false;
    }
  }
  private field(key: keyof Draft, label: string, type = 'text', help = '') {
    const value = this.draft[key];
    return html`<div class="field">
      <label for=${key}>${label}</label
      ><input
        id=${key}
        type=${type}
        inputmode=${['hours', 'minutes', 'seconds', 'effort', 'feeling'].includes(key) ? 'numeric' : 'text'}
        ?required=${key === 'activityDate'}
        .value=${typeof value === 'string' ? value : ''}
        step=${type === 'datetime-local' ? '0.001' : '1'}
        aria-invalid=${this.errors[key] ? 'true' : 'false'}
        aria-describedby=${`${key}-help ${key}-error`}
        @input=${(e: Event) => this.change(key, (e.target as HTMLInputElement).value)}
      /><span class="help" id=${`${key}-help`}>${help}</span
      >${this.fieldError(key)}
    </div>`;
  }
  private fieldError(key: string) {
    return html`<span class="error" id=${`${key}-error`}
      >${this.errors[key] ?? ''}</span
    >`;
  }
  private errorBox(error: unknown) {
    return html`<div class="error-box" role="alert">
      <p>${clientMessage(error)}</p>
      ${error instanceof ClientError && error.requestId ? html`<p class="help">Request ID: ${error.requestId}</p>` : nothing}
    </div>`;
  }
  private measurement(d: MeasurementDefinition) {
    const id = `m-${d.id}`;
    const unit = measurementUnits.find((u) => u.id === d.displayUnit);
    const raw = this.values[d.id] ?? '';
    const update = (e: Event) => {
      this.values = {
        ...this.values,
        [d.id]: (e.target as HTMLInputElement).value,
      };
      this.errors = {};
      this.saveError = undefined;
      this.status = '';
    };
    return html`<div class="field measurement">
      <label for=${id}
        >${d.name}
        ${d.isRequired && !d.isArchived && !this.original?.isPartial ? html`<span class="help">(required)</span>` : html`<span class="help">(optional)</span>`}${d.isArchived ? html`<span class="badge">Archived · stored value</span>` : nothing}</label
      >
      <div class="with-unit">
        ${
          d.valueType === 'boolean'
            ? html`<select
                id=${id}
                ?required=${d.isRequired && !d.isArchived && !this.original?.isPartial}
                .value=${raw}
                aria-invalid=${this.errors[id] ? 'true' : 'false'}
                aria-describedby=${`${id}-help ${id}-error`}
                @change=${update}
              >
                <option value="">Not recorded</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>`
            : html`<input
                id=${id}
                ?required=${d.isRequired && !d.isArchived && !this.original?.isPartial}
                type="text"
                inputmode=${d.valueType === 'text' || unit?.id === 'hour-minute' ? 'text' : d.valueType === 'rating' ? 'numeric' : 'decimal'}
                .value=${raw}
                aria-invalid=${this.errors[id] ? 'true' : 'false'}
                aria-describedby=${`${id}-help ${id}-error`}
                @input=${update}
              />`
        }${unit ? html`<span aria-hidden="true">${unit.symbol}</span>` : nothing}
      </div>
      <span class="help" id=${`${id}-help`}
        >${unit ? `Unit: ${unit.id === 'hour-minute' ? 'hours:minutes:seconds (1:25:00)' : unit.label}. ` : ''}${d.minimumValue !== null ? `Minimum ${d.minimumValue} ${d.canonicalUnit ?? ''}. ` : ''}${d.maximumValue !== null ? `Maximum ${d.maximumValue} ${d.canonicalUnit ?? ''}. ` : ''}${d.valueType === 'decimal' ? `Up to ${d.precision ?? 0} decimal places in ${d.canonicalUnit ?? 'canonical units'}.` : d.valueType === 'text' ? 'Up to 500 characters.' : ''}</span
      >${this.fieldError(id)}
    </div>`;
  }
  override render() {
    return html`<header>
        <p class="eyebrow">Activity entry</p>
        <h1>${this.activityId ? 'Edit activity' : 'New activity'}</h1>
        <p class="muted">
          Record what, when, and the details you want to keep.
        </p>
      </header>
      <p role="status" class="status">
        ${this.loading ? 'Loading activity and configuration…' : this.status}
      </p>
      ${
        this.error
          ? html`${this.errorBox(this.error)}<button
                @click=${() => this.load()}
              >
                Retry loading
              </button>`
          : this.loading
            ? html`<div class="loading" aria-hidden="true"></div>`
            : html` ${
                  !this.kinds.length
                    ? html`<p>
                          No active activity kinds are available. Configure a
                          kind before recording an activity.
                        </p>
                        <a class="button" href="/activity-kinds"
                          >Manage activity kinds</a
                        >`
                    : nothing
                }
                <form novalidate @submit=${this.save} aria-busy=${this.busy}>
                  <fieldset ?disabled=${this.busy}>
                    <legend class="sr-only">Activity details</legend>
                    <section aria-labelledby="what">
                      <h2 id="what">What</h2>
                      <div class="field">
                        <label for="activityKindId"
                          >Activity kind (required)</label
                        >
                        <div class="with-unit">
                          ${activityIcon(this.kinds.find((k) => k.id === this.draft.activityKindId)?.iconName ?? 'activity')}<select
                            id="activityKindId"
                            required
                            .value=${this.draft.activityKindId}
                            aria-invalid=${this.errors['activityKindId'] ? 'true' : 'false'}
                            aria-describedby="kind-help activityKindId-error"
                            @change=${(e: Event) => this.change('activityKindId', (e.target as HTMLSelectElement).value)}
                          >
                            <option value="">Choose an activity kind</option>
                            ${this.kinds.map((k) => html`<option value=${k.id} .selected=${k.id === this.draft.activityKindId}>${k.name}${k.isArchived ? ' (archived)' : ''}</option>`)}
                          </select>
                        </div>
                        <span class="help" id="kind-help"
                          >${this.kinds.find((k) => k.id === this.draft.activityKindId)?.isArchived ? 'This archived kind is retained for this historical activity. Keep its original variant or choose an active kind.' : 'The activity you performed.'}</span
                        >${this.fieldError('activityKindId')}
                      </div>
                      ${
                        this.variants.length
                          ? html`<div class="field">
                              <label for="activityVariantId"
                                >Variant (optional)</label
                              ><select
                                id="activityVariantId"
                                .value=${this.draft.activityVariantId}
                                ?disabled=${this.kinds.find((k) => k.id === this.draft.activityKindId)?.isArchived}
                                aria-invalid=${this.errors['activityVariantId'] ? 'true' : 'false'}
                                aria-describedby="variant-help activityVariantId-error"
                                @change=${(e: Event) => this.change('activityVariantId', (e.target as HTMLSelectElement).value)}
                              >
                                <option value="">No variant</option>
                                ${this.variants.map((v) => html`<option value=${v.id} .selected=${v.id === this.draft.activityVariantId}>${v.name}${v.isDefault ? ' (default)' : ''}${v.isArchived ? ' (archived)' : ''}</option>`)}</select
                              ><span class="help" id="variant-help"
                                >The form or environment of this
                                activity.${this.variants.find((v) => v.id === this.draft.activityVariantId)?.isArchived ? ' This archived variant is retained from the original entry.' : ''}</span
                              >${this.fieldError('activityVariantId')}
                            </div>`
                          : nothing
                      }
                    </section>
                    <section aria-labelledby="when">
                      <h2 id="when">When and how long</h2>
                      ${this.field('activityDate', 'Activity date (required)', 'date', 'The journal day stays as entered, even when you record a start time.')}
                      <fieldset class="duration">
                        <legend>Duration (optional)</legend>
                        <div class="columns">
                          ${this.field('hours', 'Hours', 'text')}${this.field('minutes', 'Minutes', 'text')}${this.field('seconds', 'Seconds', 'text')}
                        </div>
                        <p class="help">
                          Whole hours; minutes and seconds from 0 to 59. Leave
                          all three blank if unknown.
                        </p>
                      </fieldset>
                      <details>
                        <summary>Start time and name (optional)</summary>
                        ${this.field('start', 'Start date and time (optional)', 'datetime-local', `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Stored as a UTC instant; the journal day stays as entered.`)}<label
                          class="field"
                          >Repeated daylight-saving time<select
                            .value=${this.draft.occurrence}
                            @change=${(e: Event) => this.change('occurrence', (e.target as HTMLSelectElement).value)}
                          >
                            <option value="earlier">First occurrence</option>
                            <option value="later">
                              Second occurrence
                            </option></select
                          ><span class="help"
                            >Only affects a changed start time during a
                            clock-back overlap. Existing timestamps are kept
                            exactly until edited.</span
                          ></label
                        >${this.field('name', 'Activity name (optional)', 'text', 'Up to 200 characters.')}
                      </details>
                    </section>
                    <section aria-labelledby="measurements">
                      <h2 id="measurements">Measurements</h2>
                      <p class="help" role="status">
                        ${this.resolving ? 'Loading measurements…' : this.configurationError ? 'Measurement configuration could not be loaded.' : this.draft.activityKindId ? `${this.definitions.length} configured measurement${this.definitions.length === 1 ? '' : 's'}.` : 'Choose an activity kind to see its measurements.'}
                      </p>
                      ${
                        this.configurationError
                          ? html`${this.errorBox(this.configurationError)}<button
                                type="button"
                                @click=${() => this.resolve(true)}
                              >
                                Retry configuration
                              </button>`
                          : repeat(
                              this.definitions,
                              (d) => d.id,
                              (d) => this.measurement(d),
                            )
                      }
                      ${this.hiddenValues.length && !this.resolving ? html`<p class="retained">Kept while you edit, but excluded from this selection: ${this.hiddenValues.map(([id]) => this.knownDefinitions.get(id)?.name ?? this.original?.measurements.find((m) => m.measurementDefinitionId === id)?.name ?? 'Stored measurement').join(', ')}. Switch back to recover these values.</p>` : nothing}
                    </section>
                    <section aria-labelledby="context">
                      <h2 id="context">Optional context</h2>
                      <h3>Tags</h3>
                      <p class="help">
                        Reusable context across activity kinds. Archived
                        selections can be removed but cannot be added again.
                      </p>
                      <activity-tag-picker
                        .tags=${this.tags}
                        .selected=${this.draft.tagIds}
                        .historical=${this.original?.tags ?? []}
                        .disabled=${this.busy}
                        @tags-change=${(e: CustomEvent<string[]>) => this.change('tagIds', e.detail)}
                      ></activity-tag-picker
                      >${this.fieldError('tagIds')}
                      <div class="field">
                        <label for="notes">Notes (optional)</label
                        ><textarea
                          id="notes"
                          rows="4"
                          .value=${this.draft.notes}
                          aria-invalid=${this.errors['notes'] ? 'true' : 'false'}
                          aria-describedby="notes-help notes-error"
                          @input=${(e: Event) => this.change('notes', (e.target as HTMLTextAreaElement).value)}
                        ></textarea
                        ><span id="notes-help" class="help"
                          >${this.draft.notes.length > 9500 ? `${10000 - this.draft.notes.length} characters remaining.` : 'Plain text, up to 10,000 characters.'}</span
                        >${this.fieldError('notes')}
                      </div>
                      <details>
                        <summary>Effort and feeling (optional)</summary>
                        <div class="columns">
                          ${this.field('effort', 'Effort (1–5)', 'text')}${this.field('feeling', 'Feeling (1–5)', 'text')}
                        </div>
                      </details>
                      ${this.original?.isPartial ? html`<p class="help">This is a partial historical record. Missing required measurements may remain unrecorded.</p>` : nothing}
                    </section>
                  </fieldset>
                  ${Object.keys(this.errors).length ? html`<p class="error" role="alert">Review the marked fields. Your entries have been kept.</p>` : nothing}
                  ${
                    this.saveError
                      ? html`${this.errorBox(this.saveError)}
                          <p class="help">
                            Your entries have been kept. Review them before
                            explicitly saving again.
                          </p>`
                      : nothing
                  }
                  <footer class="actions">
                    <button
                      type="submit"
                      class="primary"
                      ?disabled=${this.busy || this.resolving || !!this.configurationError || !this.kinds.length}
                    >
                      ${this.busy ? 'Saving…' : 'Save activity'}</button
                    ><button
                      type="button"
                      ?disabled=${this.busy}
                      @click=${() => navigate(safeReturn(new URL(this.route, location.origin).searchParams.get('returnTo')))}
                    >
                      Cancel
                    </button>
                  </footer>
                </form>`
      }`;
  }
  static override styles = [
    managementStyles,
    css`
      :host {
        max-width: 760px;
        margin: 0 auto;
      }
      header {
        display: grid;
        gap: var(--space-3);
      }
      .eyebrow {
        color: var(--color-primary);
        font-size: var(--font-size-small);
        font-weight: 600;
      }
      .status {
        min-height: 24px;
        margin: var(--space-4) 0;
      }
      fieldset {
        border: 0;
        padding: 0;
        margin: 0;
        min-width: 0;
      }
      section {
        display: grid;
        gap: var(--space-5);
        padding: var(--space-6) 0;
        border-top: 1px solid var(--color-border);
      }
      .columns {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-3);
      }
      .duration legend {
        margin-bottom: var(--space-3);
      }
      select,
      textarea {
        font: inherit;
        width: 100%;
        min-width: 0;
        min-height: 44px;
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        color: var(--color-text);
      }
      textarea {
        resize: vertical;
      }
      select:focus-visible,
      textarea:focus-visible {
        outline: 3px solid var(--color-focus);
        outline-offset: 3px;
      }
      .with-unit {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        min-width: 0;
      }
      .with-unit input,
      .with-unit select {
        min-width: 0;
        flex: 1;
      }
      .with-unit svg {
        flex-shrink: 0;
      }
      label,
      .retained,
      .help {
        overflow-wrap: anywhere;
      }
      .retained {
        background: var(--color-primary-soft);
        padding: var(--space-4);
        border-radius: var(--radius-md);
      }
      summary {
        cursor: pointer;
        min-height: 44px;
        padding: var(--space-3) 0;
      }
      details > .field,
      details > .columns {
        margin-top: var(--space-4);
      }
      footer {
        padding: var(--space-5) 0;
        border-top: 1px solid var(--color-border);
        margin-top: var(--space-4);
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      .error-box + button {
        margin-top: var(--space-3);
      }
      .loading {
        min-height: 320px;
        background: var(--color-surface-subtle);
        border-radius: var(--radius-md);
      }
      @media (max-width: 480px) {
        .columns {
          grid-template-columns: 1fr;
        }
        footer button {
          flex: 1;
        }
      }
    `,
  ];
}
customElements.define('activity-editor-page', ActivityEditorPage);
