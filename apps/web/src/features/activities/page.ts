import {
  accordionHeader,
  accordionStyles,
} from '../../components/accordion.js';
import { Clock, Ruler, NotebookPen, createElement } from 'lucide';
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
  activityStartTime,
  activityStartInstant,
  isOverallDuration,
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
    openSection: { state: true },
    kindSearch: { state: true },
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
  private openSection = 'activity';
  private kindSearch = '';
  private get visibleDefinitions() {
    return this.definitions.filter((d) => !isOverallDuration(d));
  }
  private get durationChanged() {
    return ['hours', 'minutes', 'seconds'].some(
      (key) =>
        this.draft[key as keyof Draft] !==
        this.initialDraft[key as keyof Draft],
    );
  }
  private get durationRequired() {
    return (
      this.definitions.some(
        (d) => isOverallDuration(d) && d.isRequired && !d.isArchived,
      ) && !this.original?.isPartial
    );
  }
  private generation = 0;
  private selectionGeneration = 0;
  private reads: AbortController | undefined;
  private selection: AbortController | undefined;
  private mutation: AbortController | undefined;
  private historicalDuration(activity: Activity): number | null {
    const stored = activity.measurements.find(isOverallDuration);
    return stored?.valueType === 'duration' ? stored.canonicalValue : null;
  }
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
      const target = new URL(this.route, location.origin).searchParams.get(
        'section',
      );
      this.openSection =
        target &&
        ['activity', 'timing', 'measurements', 'context'].includes(target)
          ? target
          : activity
            ? ''
            : 'activity';
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
          activity.durationSeconds ?? this.historicalDuration(activity),
        );
        this.draft = {
          activityKindId: activity.activityKindId,
          activityVariantId: activity.activityVariantId ?? '',
          activityDate: activity.activityDate,
          start: activityStartTime(activity.startedAt),
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
    const firstSection = ['activity', 'timing', 'measurements', 'context'].find(
      (id) => this.sectionError(id),
    );
    if (firstSection) {
      this.openSection = firstSection;
      await this.updateComplete;
    }
    const control = this.renderRoot.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    const section = control?.closest<HTMLElement>('section[data-section]');
    if (section) {
      this.openSection = section.dataset.section!;
      await this.updateComplete;
    }
    const details = control?.closest('details');
    if (details) details.open = true;
    if (control) control.focus();
    else if (firstSection)
      this.renderRoot
        .querySelector<HTMLElement>(`#${firstSection}-trigger`)
        ?.focus();
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
        this.draft.activityDate === this.initialDraft.activityDate
          ? this.original.startedAt
          : activityStartInstant(this.draft.activityDate, this.draft.start);
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
      if (isOverallDuration(d)) {
        const stored = this.originalInput(d.id);
        if (this.sameScope && !this.durationChanged && stored)
          measurements.push(stored);
        else if (duration !== null) {
          if (
            (d.minimumValue !== null && duration < d.minimumValue) ||
            (d.maximumValue !== null && duration > d.maximumValue)
          )
            errors.hours =
              'Duration is outside the configured permitted range.';
          measurements.push({
            measurementDefinitionId: d.id,
            valueType: 'duration',
            value: duration,
            unitId: 'second',
          });
        } else if (d.isRequired && !d.isArchived && !this.original?.isPartial)
          errors.hours = 'Enter the required duration.';
        continue;
      }
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
          (this.durationChanged && this.definitions.some(isOverallDuration)) ||
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
      if (
        controller.signal.aborted ||
        !this.isConnected ||
        this.mutation !== controller
      )
        return;
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
      if (
        controller.signal.aborted ||
        !this.isConnected ||
        this.mutation !== controller
      )
        return;
      this.saveError = error;
      this.status = '';
      if (error instanceof ClientError) {
        for (const id of error.details?.missingDefinitionIds ?? [])
          errors[
            this.definitions.some((d) => d.id === id && isOverallDuration(d))
              ? 'hours'
              : `m-${id}`
          ] = 'This measurement is required by the current configuration.';
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
      if (this.isConnected && this.mutation === controller) this.busy = false;
    }
  }
  private field(key: keyof Draft, label: string, type = 'text', help = '') {
    const value = this.draft[key];
    return html`<div class="field">
      <label for=${key}
        >${['hours', 'minutes', 'seconds'].includes(key) ? html`<span class="sr-only">${label}</span><span aria-hidden="true">${key === 'hours' ? 'h' : key === 'minutes' ? 'min' : 'sec'}</span>` : label}</label
      ><input
        id=${key}
        type=${type}
        aria-label=${['hours', 'minutes', 'seconds'].includes(key) ? label : nothing}
        inputmode=${['hours', 'minutes', 'seconds', 'effort', 'feeling'].includes(key) ? 'numeric' : 'text'}
        ?required=${key === 'activityDate'}
        .value=${typeof value === 'string' ? value : ''}
        step=${type === 'time' ? '60' : '1'}
        aria-invalid=${this.errors[key] ? 'true' : 'false'}
        aria-describedby=${`${key}-help ${key}-error`}
        @input=${(e: Event) => this.change(key, (e.target as HTMLInputElement).value)}
      /><span class="help" id=${`${key}-help`}>${help}</span
      >${key === 'hours' ? nothing : this.fieldError(key)}
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
    return html`<div
      class="field measurement"
      style=${`--input-width: ${d.valueType === 'text' ? 22 : d.valueType === 'duration' ? 12 : Math.max(8, Math.min(15, 5 + (d.precision ?? 0)))}ch`}
    >
      <label for=${id}
        >${d.name}
        ${d.isRequired && !d.isArchived && !this.original?.isPartial ? html`<span aria-hidden="true">*</span>` : nothing}${d.isArchived ? html`<span class="badge">Archived · stored value</span>` : nothing}</label
      >
      <div class="with-unit">
        ${
          d.valueType === 'boolean'
            ? html`<select
                id=${id}
                ?required=${d.isRequired && !d.isArchived && !this.original?.isPartial}
                .value=${raw}
                aria-invalid=${this.errors[id] ? 'true' : 'false'}
                aria-describedby=${`${id}-unit ${id}-help ${id}-error`}
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
        }${unit ? html`<span id=${`${id}-unit`}>${unit.symbol}</span>` : nothing}
      </div>
      <span class="help" id=${`${id}-help`}
        >${unit?.id === 'hour-minute' ? 'Use h:mm:ss. ' : ''}${d.minimumValue !== null && d.minimumValue !== 0 ? `Minimum ${d.minimumValue} ${d.canonicalUnit ?? ''}. ` : ''}${d.maximumValue !== null ? `Maximum ${d.maximumValue} ${d.canonicalUnit ?? ''}. ` : ''}</span
      >${this.fieldError(id)}
    </div>`;
  }
  private sectionError(id: string) {
    const keys =
      id === 'activity'
        ? ['activityKindId', 'activityVariantId', 'name']
        : id === 'timing'
          ? [
              'activityDate',
              'start',
              'hours',
              'minutes',
              'seconds',
              'durationSeconds',
            ]
          : id === 'context'
            ? ['notes', 'tagIds', 'effort', 'feeling']
            : ['measurements', ...this.definitions.map((d) => 'm-' + d.id)];
    return keys.some((key) => !!this.errors[key]);
  }
  private get summaries() {
    const kind = this.kinds.find((k) => k.id === this.draft.activityKindId);
    const variant = this.variants.find(
      (v) => v.id === this.draft.activityVariantId,
    );
    const populated = this.visibleDefinitions.filter((d) =>
      (this.values[d.id] ?? '').trim(),
    );
    const first =
      populated.find((d) => d.id === kind?.primaryMeasurementDefinitionId) ??
      populated[0];
    const measurement = first
      ? [
          first.name,
          this.values[first.id],
          measurementUnits.find((u) => u.id === first.displayUnit)?.symbol,
        ]
          .filter(Boolean)
          .join(' ') +
        (populated.length > 1
          ? ' \u00b7 ' + (populated.length - 1) + ' more'
          : '')
      : 'No measurements recorded';
    const duration = [
      [this.draft.hours, 'h'],
      [this.draft.minutes, 'min'],
      [this.draft.seconds, 's'],
    ]
      .filter(([value]) => value && Number(value))
      .map(([value, unit]) => value + ' ' + unit)
      .join(' ');
    return {
      activity:
        [kind?.name, variant?.name, this.draft.name]
          .filter(Boolean)
          .join(' \u00b7 ') || 'Choose an activity kind',
      timing: [
        /^\d{4}-\d{2}-\d{2}$/.test(this.draft.activityDate)
          ? new Intl.DateTimeFormat('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(this.draft.activityDate))
          : this.draft.activityDate,
        this.draft.start,
        duration ||
          ([this.draft.hours, this.draft.minutes, this.draft.seconds].some(
            (value) => value.trim(),
          )
            ? '0 s'
            : ''),
      ]
        .filter(Boolean)
        .join(' \u00b7 '),
      measurements: measurement,
      context:
        [
          this.draft.notes.trim().split('\n')[0],
          this.draft.tagIds.length
            ? this.draft.tagIds.length +
              (this.draft.tagIds.length === 1 ? ' tag' : ' tags')
            : '',
          this.draft.effort ? 'Effort ' + this.draft.effort + '/5' : '',
          this.draft.feeling ? 'Feeling ' + this.draft.feeling + '/5' : '',
        ]
          .filter(Boolean)
          .join(' \u00b7 ') || 'No notes or context',
    };
  }
  private sectionHeader(
    id: 'activity' | 'timing' | 'measurements' | 'context',
    title: string,
  ) {
    const icon =
      id === 'activity'
        ? activityIcon(
            this.kinds.find((k) => k.id === this.draft.activityKindId)
              ?.iconName ?? 'activity',
          )
        : createElement(
            id === 'timing'
              ? Clock
              : id === 'measurements'
                ? Ruler
                : NotebookPen,
            { width: '22', height: '22', 'aria-hidden': 'true' },
          );
    if (id === 'activity') {
      const color = this.kinds.find(
        (k) => k.id === this.draft.activityKindId,
      )?.color;
      if (color)
        icon.setAttribute('style', `border-bottom: 2px solid ${color}`);
    }
    return accordionHeader(
      id,
      title,
      this.summaries[id],
      icon,
      this.openSection === id,
      this.sectionError(id),
      () => {
        this.openSection = this.openSection === id ? '' : id;
      },
    );
  }
  override render() {
    return html`<header>
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
                    <section
                      data-section="activity"
                      class=${this.openSection === 'activity' ? 'expanded' : ''}
                    >
                      ${this.sectionHeader('activity', 'Activity')}
                      <div
                        class="accordion-panel activity-panel"
                        id="activity-panel"
                        role="region"
                        aria-labelledby="activity-trigger"
                        ?hidden=${this.openSection !== 'activity'}
                      >
                        <fieldset
                          id="activityKindId"
                          tabindex="-1"
                          aria-invalid=${this.errors.activityKindId ? 'true' : 'false'}
                          aria-describedby="activityKindId-error"
                          class="kind-picker"
                        >
                          <legend>Activity kind *</legend>
                          ${
                            this.kinds.length > 12
                              ? html`<label class="kind-search"
                                  >Find activity kind<input
                                    type="search"
                                    .value=${this.kindSearch}
                                    @input=${(e: Event) => {
                                      this.kindSearch = (
                                        e.target as HTMLInputElement
                                      ).value;
                                    }}
                                /></label>`
                              : nothing
                          }
                          <div class="kind-grid">
                            ${this.kinds.filter((k) => !this.kindSearch || k.name.toLowerCase().includes(this.kindSearch.toLowerCase())).map((k) => html`<label class="kind-tile"><input type="radio" name="activityKind" .value=${k.id} .checked=${k.id === this.draft.activityKindId} required @change=${() => this.change('activityKindId', k.id)} /><span class="kind-icon" style=${'--kind-color: ' + k.color}>${activityIcon(k.iconName)}</span><span>${k.name}${k.isArchived ? ' (archived)' : ''}</span><span class="selection-mark" aria-hidden="true">✓</span></label>`)}
                          </div>
                          ${this.kindSearch && !this.kinds.some((k) => k.name.toLowerCase().includes(this.kindSearch.toLowerCase())) ? html`<p role="status">No matching activity kinds.</p>` : nothing}
                          ${this.fieldError('activityKindId')}
                        </fieldset>
                        ${
                          this.variants.length
                            ? html`<fieldset
                                id="activityVariantId"
                                class="variant-picker"
                                ?disabled=${this.kinds.find((k) => k.id === this.draft.activityKindId)?.isArchived}
                                aria-invalid=${this.errors.activityVariantId ? 'true' : 'false'}
                                aria-describedby="activityVariantId-error"
                              >
                                <legend>Variant</legend>
                                <div class="variant-chips">
                                  ${[{ id: '', name: 'No variant', isArchived: false }, ...this.variants].map((v) => html`<label class="variant-chip"><input type="radio" name="activityVariant" .value=${v.id} .checked=${v.id === this.draft.activityVariantId} @change=${() => this.change('activityVariantId', v.id)} /><span>${v.name}${v.isArchived ? ' (archived)' : ''}</span><span class="selection-mark" aria-hidden="true">✓</span></label>`)}
                                </div>
                                ${this.fieldError('activityVariantId')}
                              </fieldset>`
                            : nothing
                        }
                        ${this.field('name', 'Activity name')}
                      </div>
                    </section>
                    <section
                      data-section="timing"
                      class=${this.openSection === 'timing' ? 'expanded' : ''}
                    >
                      ${this.sectionHeader('timing', 'Timing')}
                      <div
                        class="accordion-panel timing-panel"
                        id="timing-panel"
                        role="region"
                        aria-labelledby="timing-trigger"
                        ?hidden=${this.openSection !== 'timing'}
                      >
                        ${this.field('activityDate', 'Activity date *', 'date')}
                        ${this.field('start', 'Start time', 'time', 'Europe/Helsinki')}
                        <fieldset class="duration">
                          <legend>
                            Duration${this.durationRequired ? ' *' : ''}
                          </legend>
                          <div class="duration-inputs">
                            ${this.field('hours', 'Hours', 'text')}${this.field('minutes', 'Minutes', 'text')}${this.field('seconds', 'Seconds', 'text')}
                          </div>
                          ${this.fieldError('hours')}
                        </fieldset>
                      </div>
                    </section>
                    <section
                      data-section="measurements"
                      class=${this.openSection === 'measurements' ? 'expanded' : ''}
                    >
                      ${this.sectionHeader('measurements', 'Measurements')}
                      <div
                        class="accordion-panel measurements-panel"
                        id="measurements-panel"
                        role="region"
                        aria-labelledby="measurements-trigger"
                        ?hidden=${this.openSection !== 'measurements'}
                      >
                        <p class="help" role="status">
                          ${this.resolving ? 'Loading measurements…' : this.configurationError ? 'Measurement configuration could not be loaded.' : this.draft.activityKindId ? (this.visibleDefinitions.length ? '' : 'No additional measurements for this activity.') : 'Choose an activity kind to see its measurements.'}
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
                                this.visibleDefinitions,
                                (d) => d.id,
                                (d) => this.measurement(d),
                              )
                        }
                        ${this.hiddenValues.length && !this.resolving ? html`<p class="retained">Kept while you edit, but excluded from this selection: ${this.hiddenValues.map(([id]) => this.knownDefinitions.get(id)?.name ?? this.original?.measurements.find((m) => m.measurementDefinitionId === id)?.name ?? 'Stored measurement').join(', ')}. Switch back to recover these values.</p>` : nothing}
                      </div>
                    </section>
                    <section
                      data-section="context"
                      class=${this.openSection === 'context' ? 'expanded' : ''}
                    >
                      ${this.sectionHeader('context', 'Notes & context')}
                      <div
                        class="accordion-panel context-panel"
                        id="context-panel"
                        role="region"
                        aria-labelledby="context-trigger"
                        ?hidden=${this.openSection !== 'context'}
                      >
                        <div class="tag-context">
                          <h3>Tags</h3>
                          <activity-tag-picker
                            .tags=${this.tags}
                            .selected=${this.draft.tagIds}
                            .historical=${this.original?.tags ?? []}
                            .disabled=${this.busy}
                            @tags-change=${(e: CustomEvent<string[]>) => this.change('tagIds', e.detail)}
                          ></activity-tag-picker
                          >${this.fieldError('tagIds')}
                        </div>
                        <div class="context-fields">
                          <div class="field">
                            <label for="notes">Notes</label
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
                            <summary>Effort and feeling</summary>
                            <div class="columns">
                              ${this.field('effort', 'Effort (1–5)', 'text')}${this.field('feeling', 'Feeling (1–5)', 'text')}
                            </div>
                          </details>
                          ${this.original?.isPartial ? html`<p class="help">This is a partial historical record. Missing required measurements may remain unrecorded.</p>` : nothing}
                        </div>
                      </div>
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
                    <p class="save-summary">
                      <strong>${this.summaries.activity}</strong
                      ><span
                        >${this.summaries.timing} &middot;
                        ${this.summaries.measurements}</span
                      >
                    </p>
                    <button
                      type="submit"
                      class="primary"
                      ?disabled=${this.busy || this.resolving || !!this.configurationError || !this.kinds.length}
                    >
                      ${this.busy ? 'Saving…' : this.activityId ? 'Save changes' : 'Save activity'}</button
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
    accordionStyles,
    css`
      :host {
        max-width: var(--editor-width);
        margin: 0 auto;
      }
      header {
        display: grid;
        gap: 4px;
      }
      .status {
        min-height: 0;
        margin: 8px 0;
      }
      fieldset {
        border: 0;
        padding: 0;
        margin: 0;
        min-width: 0;
      }
      .columns {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-3);
      }
      select,
      textarea {
        font: inherit;
        width: 100%;
        min-width: 0;
        min-height: 44px;
        padding: var(--space-3);
        border: 1px solid var(--color-control-border);
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

      .status:empty {
        display: none;
      }
      section {
        border-top: 1px solid var(--color-divider);
        display: flex;
        flex-direction: column;
        padding: 0;
        gap: 0;
        min-height: 0;
      }
      .accordion-heading {
        flex-shrink: 0;
      }
      .accordion-panel {
        display: grid;
        gap: 12px;
        align-content: start;
      }
      .tag-context {
        display: grid;
        gap: 12px;
        align-content: start;
      }
      .context-fields {
        display: grid;
        align-content: start;
        gap: 12px;
      }
      .context-panel > .field {
        align-content: start;
      }
      .context-panel textarea {
        min-height: 100px;
      }
      .measurements-panel {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .measurements-panel > p,
      .measurements-panel > .error-box {
        grid-column: 1 / -1;
      }
      .field {
        gap: 4px;
      }
      .error:empty,
      .help:empty {
        display: none;
      }
      .save-summary {
        flex: 1;
        min-width: 0;
        display: grid;
        font-size: 13px;
      }
      .save-summary span,
      .save-summary strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .save-summary span {
        color: var(--color-text-muted);
      }
      footer {
        border-top: 1px solid var(--color-divider);
        background: var(--color-bg);
        margin: 0;
        padding: 16px 0;
        flex-shrink: 0;
        position: sticky;
        bottom: 0;
      }

      .activity-panel {
        gap: 16px;
      }
      .kind-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 8px;
      }
      .kind-picker legend,
      .variant-picker legend {
        margin-bottom: 8px;
      }
      .kind-tile,
      .variant-chip {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 48px;
        padding: 8px 12px;
        border: 1px solid var(--color-control-border);
        border-radius: var(--radius-sm);
        cursor: pointer;
        background: var(--color-input);
      }
      .kind-tile input,
      .variant-chip input {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
        min-height: 0;
      }
      .kind-tile:has(:checked),
      .variant-chip:has(:checked) {
        border-color: var(--color-primary);
        background: var(--color-primary-soft);
        box-shadow: inset 0 0 0 1px var(--color-primary);
        font-weight: 650;
      }
      .selection-mark {
        display: none;
        margin-left: auto;
        color: var(--color-primary);
      }
      .kind-tile:has(:checked) .selection-mark,
      .variant-chip:has(:checked) .selection-mark {
        display: inline;
      }
      .kind-tile:has(:focus-visible),
      .variant-chip:has(:focus-visible) {
        outline: 3px solid var(--color-focus);
        outline-offset: 3px;
      }
      .kind-tile:hover,
      .variant-chip:hover {
        border-color: var(--color-control-hover);
      }
      .kind-icon {
        display: flex;
        border-bottom: 3px solid var(--kind-color);
        padding-bottom: 3px;
        color: var(--color-text);
      }
      .kind-icon svg {
        width: 20px;
        height: 20px;
      }
      .variant-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .variant-chip {
        border-radius: var(--radius-pill);
      }
      .variant-picker:disabled {
        opacity: 0.6;
      }
      .kind-search {
        display: grid;
        gap: 4px;
        margin-bottom: 12px;
        max-width: 320px;
      }
      .activity-panel > .field {
        max-width: 400px;
      }
      .duration-inputs {
        display: flex;
        gap: 8px;
      }
      .duration-inputs .field {
        width: auto;
        display: grid;
        grid-template-columns: 54px auto;
        align-items: center;
        gap: 6px;
      }
      .duration-inputs label {
        white-space: nowrap;
        grid-column: 2;
        grid-row: 1;
      }
      .duration-inputs input {
        grid-column: 1;
        grid-row: 1;
      }
      .duration-inputs .error {
        grid-column: 1 / -1;
      }
      .duration-inputs input {
        width: 100%;
      }
      .duration legend {
        margin-bottom: 4px;
      }
      .duration-inputs label {
        font-size: 13px;
        color: var(--color-text-secondary);
      }

      .timing-panel input {
        min-width: 0;
      }
      .measurement .with-unit input {
        flex: 0 1 auto;
        width: var(--input-width);
        max-width: 100%;
      }
      .measurement .with-unit select {
        flex: 0 1 auto;
        width: 140px;
      }
      .measurement .with-unit span {
        white-space: nowrap;
      }
      .context-fields .columns {
        grid-template-columns: repeat(2, minmax(0, 100px));
      }
      @media (min-width: 1200px) {
        .measurements-panel {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      @media (min-width: 769px) and (max-width: 1000px) {
        .measurements-panel {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (min-width: 769px) {
        .timing-panel {
          grid-template-columns: minmax(160px, 1fr) minmax(130px, 1fr) minmax(
              300px,
              1.5fr
            );
          align-items: start;
        }
        .context-panel {
          grid-template-columns: 1fr 1.5fr;
        }
        :host {
          height: calc(100dvh - 120px);
          display: flex;
          flex-direction: column;
        }
        form {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }
        form > fieldset {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1;
        }
        section {
          flex-shrink: 0;
        }
        section.expanded {
          flex: 1;
          flex-shrink: 1;
        }
      }
      @media (max-width: 768px) {
        .measurements-panel {
          grid-template-columns: 1fr;
        }
        .save-summary {
          flex-basis: 100%;
        }
      }
      @media (max-width: 480px) {
        footer button {
          flex: 1;
        }
      }
    `,
  ];
}
customElements.define('activity-editor-page', ActivityEditorPage);
