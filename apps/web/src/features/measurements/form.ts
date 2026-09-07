import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import {
  type MeasurementDefinition,
  type MeasurementFields,
  type MeasurementUnit,
} from '@activus/contracts';
import {
  ClientError,
  clientMessage,
} from '../../services/configuration-api.js';
import { managementStyles } from '../activity-kinds/styles.js';
import {
  defaults,
  typeLabels,
  typeHelp,
  aggregationLabels,
  bestLabels,
  compatibleUnits,
  validateFields,
  canonicalBound,
  displayBound,
} from './fields.js';

export class MeasurementForm extends LitElement {
  static override properties = {
    definition: { attribute: false },
    owner: { type: String },
    units: { attribute: false },
    busy: { type: Boolean },
    error: { attribute: false },
    fields: { state: true },
    errors: { state: true },
    dismissWarning: { state: true },
    pendingType: { state: true },
    historyLocked: { state: true },
  };
  definition: MeasurementDefinition | undefined;
  owner = '';
  units: MeasurementUnit[] = [];
  busy = false;
  error: unknown;
  private fields = defaults('decimal');
  private initial = '';
  private errors: Record<string, string> = {};
  private dismissWarning = false;
  private pendingType: MeasurementFields['valueType'] | undefined;
  private historyLocked = false;
  private boundText: Partial<Record<'minimumValue' | 'maximumValue', string>> =
    {};
  static override styles = [
    managementStyles,
    css`
      form,
      .stack {
        display: grid;
        gap: var(--space-5);
      }
      fieldset {
        min-width: 0;
        border: 0;
        padding: 0;
        margin: 0;
        display: grid;
        gap: var(--space-4);
      }
      legend {
        font-weight: 600;
        margin-bottom: var(--space-3);
      }
      select {
        font: inherit;
        width: 100%;
        min-width: 0;
        min-height: 44px;
        padding: var(--space-2);
        color: var(--color-text);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      select:focus-visible {
        outline: 3px solid var(--color-focus);
        outline-offset: 3px;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-4);
      }
      .grid > * {
        min-width: 0;
      }
      details {
        border-top: 1px solid var(--color-border);
      }
      summary {
        cursor: pointer;
        padding: var(--space-4) 0;
        font-weight: 600;
        min-height: 44px;
      }
      .notice {
        background: var(--color-primary-soft);
        padding: var(--space-4);
        border-radius: var(--radius-md);
        display: grid;
        gap: var(--space-3);
      }
      .actions {
        justify-content: flex-end;
      }
      @media (max-width: 600px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ];
  protected override willUpdate(changed: PropertyValues) {
    if (!this.initial || changed.has('definition')) {
      const source = this.definition;
      this.fields = source
        ? (Object.fromEntries(
            Object.keys(defaults(source.valueType)).map((key) => [
              key,
              source[key as keyof MeasurementFields],
            ]),
          ) as MeasurementFields)
        : defaults('decimal');
      this.initial = JSON.stringify(this.fields);
      this.boundText = {};
    }
    if (changed.has('error') && this.error instanceof ClientError) {
      if (this.error.code === 'MEASUREMENT_DEFINITION_NAME_CONFLICT')
        this.errors = { name: clientMessage(this.error) };
      if (this.error.code === 'MEASUREMENT_DEFINITION_HAS_HISTORY')
        this.historyLocked = true;
      if (this.error.code === 'MEASUREMENT_DEFINITION_INVALID')
        this.errors = { settings: clientMessage(this.error) };
    }
  }
  protected override firstUpdated() {
    this.renderRoot.querySelector<HTMLInputElement>('#name')?.focus();
  }
  protected override updated(changed: PropertyValues) {
    // Conditional option groups are committed after select properties by Lit.
    // Reconcile selection after the options exist so displayed and submitted values agree.
    for (const select of this.renderRoot.querySelectorAll('select'))
      select.value = String(
        this.fields[select.id as keyof MeasurementFields] ?? '',
      );
    if (changed.has('error') && this.error) void this.focusError();
  }
  get dirty() {
    return JSON.stringify(this.fields) !== this.initial;
  }
  requestDismiss() {
    if (this.busy) return;
    if (this.dirty) {
      this.dismissWarning = true;
      void this.updateComplete.then(() =>
        this.renderRoot
          .querySelector<HTMLButtonElement>('#keep-editing')
          ?.focus(),
      );
    } else this.dismiss();
  }
  private dismiss() {
    this.dispatchEvent(
      new CustomEvent('dismiss-measurement', { bubbles: true, composed: true }),
    );
  }
  private change<K extends keyof MeasurementFields>(
    key: K,
    value: MeasurementFields[K],
  ) {
    this.fields = { ...this.fields, [key]: value };
  }
  private async focusError() {
    await this.updateComplete;
    if (
      this.errors.settings ||
      Object.keys(this.errors).some((key) =>
        ['precision', 'minimumValue', 'maximumValue', 'aggregation'].includes(
          key,
        ),
      )
    ) {
      const details = this.renderRoot.querySelector('details');
      if (details) details.open = true;
    }
    const key = Object.keys(this.errors)[0];
    this.renderRoot
      .querySelector<HTMLElement>(key ? `#${key}` : '#form-error')
      ?.focus();
  }
  private changeType(event: Event) {
    const control = event.target as HTMLSelectElement;
    const type = control.value as MeasurementFields['valueType'];
    const baseline = defaults(this.fields.valueType);
    const hasSettings = (
      [
        'displayUnit',
        'precision',
        'minimumValue',
        'maximumValue',
        'aggregation',
        'personalBestDirection',
      ] as const
    ).some((key) => this.fields[key] !== baseline[key]);
    if (hasSettings) {
      this.pendingType = type;
      control.value = this.fields.valueType;
    } else this.applyType(type);
  }
  private applyType(type: MeasurementFields['valueType']) {
    this.boundText = {};
    this.fields = {
      ...defaults(type),
      name: this.fields.name,
      isRequired: this.fields.isRequired,
      sortOrder: this.fields.sortOrder,
    };
    this.errors = {};
    this.pendingType = undefined;
  }
  private changeUnit(event: Event) {
    this.boundText = {};
    const unit = this.units.find(
      (u) => u.id === (event.target as HTMLSelectElement).value,
    );
    this.fields = {
      ...this.fields,
      displayUnit: unit?.id ?? null,
      canonicalUnit: unit?.canonicalUnit ?? null,
      precision:
        this.fields.valueType === 'decimal' && !this.historyLocked
          ? (unit?.defaultPrecision ?? 2)
          : this.fields.precision,
    };
  }
  private restoreLocked() {
    if (!this.definition) return;
    const d = this.definition;
    this.boundText = {};
    this.fields = {
      ...this.fields,
      valueType: d.valueType,
      canonicalUnit: d.canonicalUnit,
      displayUnit: d.displayUnit,
      precision: d.precision,
      minimumValue: d.minimumValue,
      maximumValue: d.maximumValue,
    };
    this.errors = {};
  }
  private submit(event: Event) {
    event.preventDefault();
    if (this.busy) return;
    this.errors = validateFields(this.fields, this.units);
    if (Object.keys(this.errors).length) {
      void this.focusError();
      return;
    }
    this.dispatchEvent(
      new CustomEvent<MeasurementFields>('save-measurement', {
        detail: { ...this.fields, name: this.fields.name.trim() },
        bubbles: true,
        composed: true,
      }),
    );
  }
  private errorFor(key: string) {
    return this.errors[key]
      ? html`<span class="error" id=${`${key}-error`}
          >${this.errors[key]}</span
        >`
      : nothing;
  }
  private bound(key: 'minimumValue' | 'maximumValue', label: string) {
    const duration = this.fields.valueType === 'duration';
    const unit = this.units.find((u) => u.id === this.fields.displayUnit);
    const input = (e: Event) => {
      const value = (e.target as HTMLInputElement).value;
      this.boundText[key] = value;
      this.change(key, canonicalBound(value, unit, duration));
    };
    return html`<div class="field">
      <label for=${key}
        >${label}${duration ? ' (h:mm:ss)' : unit ? ` (${unit.symbol})` : ''}</label
      ><input
        id=${key}
        type="text"
        inputmode=${duration ? 'text' : 'decimal'}
        .value=${this.boundText[key] ?? displayBound(this.fields[key], unit, duration)}
        ?disabled=${this.historyLocked}
        aria-invalid=${Boolean(this.errors[key])}
        aria-describedby=${`${key}-error bounds-help history-help`}
        @input=${input}
        @change=${input}
      />${this.errorFor(key)}
    </div>`;
  }
  override render() {
    const f = this.fields;
    const numeric = !['boolean', 'text'].includes(f.valueType);
    const units = compatibleUnits(f.valueType, this.units).filter(
      (u) =>
        !this.historyLocked ||
        u.canonicalUnit === this.definition?.canonicalUnit,
    );
    return html`<form novalidate @submit=${this.submit}>
      <p class="help">${this.owner}</p>
      ${this.error ? html`<div id="form-error" tabindex="-1" class="error-box" role="alert">${clientMessage(this.error)}${this.error instanceof ClientError && this.error.requestId ? html`<small>Request ID: ${this.error.requestId}</small>` : nothing}</div>` : nothing}
      ${
        this.historyLocked
          ? html`<div class="notice" id="history-help">
              <p>
                This setting cannot be changed because activities already use
                this measurement. Type, unit dimension, precision and bounds are
                locked.
              </p>
              <button
                type="button"
                ?disabled=${this.busy}
                @click=${this.restoreLocked}
              >
                Keep recorded settings
              </button>
              <p class="help">
                This restores the saved settings while retaining your name,
                requirement and reporting changes.
              </p>
            </div>`
          : nothing
      }
      <fieldset ?disabled=${this.busy}>
        <legend>Measurement details</legend>
        <div class="field">
          <label for="name">Name</label
          ><input
            id="name"
            maxlength="120"
            .value=${f.name}
            aria-invalid=${Boolean(this.errors.name)}
            aria-describedby="name-error"
            @input=${(e: Event) => this.change('name', (e.target as HTMLInputElement).value)}
          />${this.errorFor('name')}
        </div>
        <div class="field">
          <label for="valueType">Value type</label
          ><select
            id="valueType"
            .value=${f.valueType}
            ?disabled=${this.historyLocked}
            aria-describedby="type-help history-help"
            @change=${this.changeType}
          >
            ${Object.entries(typeLabels).map(([value, label]) => html`<option value=${value}>${label}</option>`)}
          </select>
          <p class="help" id="type-help" aria-live="polite">
            ${typeHelp[f.valueType]}
          </p>
        </div>
        ${
          this.pendingType
            ? html`<div class="notice" role="alert">
                <p>
                  Changing value type clears the current unit, bounds and
                  reporting settings.
                </p>
                <div class="actions">
                  <button
                    type="button"
                    @click=${() => {
                      this.pendingType = undefined;
                    }}
                  >
                    Keep current type</button
                  ><button
                    type="button"
                    @click=${() => this.applyType(this.pendingType!)}
                  >
                    Change value type
                  </button>
                </div>
              </div>`
            : nothing
        }
        ${
          ['decimal', 'integer', 'duration'].includes(f.valueType)
            ? html`<div class="field">
                <label for="displayUnit"
                  >${f.valueType === 'duration' ? 'Display format' : 'Display unit'}</label
                ><select
                  id="displayUnit"
                  .value=${f.displayUnit ?? ''}
                  aria-invalid=${Boolean(this.errors.displayUnit)}
                  aria-describedby="displayUnit-error history-help"
                  @change=${this.changeUnit}
                >
                  ${f.valueType !== 'duration' && (!this.historyLocked || this.definition?.canonicalUnit === null) ? html`<option value="">No unit</option>` : nothing}${[...new Set(units.map((u) => u.dimension))].map((dimension) => html`<optgroup label=${dimension[0]!.toUpperCase() + dimension.slice(1)}>${units.filter((u) => u.dimension === dimension).map((u) => html`<option value=${u.id}>${u.label} (${u.symbol})</option>`)}</optgroup>`)}</select
                >${this.errorFor('displayUnit')}
              </div>`
            : nothing
        }
        <label class="check"
          ><input
            type="checkbox"
            .checked=${f.isRequired}
            @change=${(e: Event) => this.change('isRequired', (e.target as HTMLInputElement).checked)}
          />Required for normal entries</label
        >
      </fieldset>
      <details>
        <summary>Advanced settings</summary>
        <fieldset ?disabled=${this.busy}>
          <legend>Display and reporting</legend>
          ${this.errors.settings ? html`<p id="settings" tabindex="-1" class="error" role="alert">${this.errors.settings}</p>` : nothing}
          ${
            numeric
              ? html` ${f.valueType === 'decimal' ? html`<div class="field"><label for="precision">Precision (0–6 decimal places)</label><input id="precision" type="number" min="0" max="6" step="1" ?disabled=${this.historyLocked} .value=${String(f.precision ?? '')} aria-describedby="precision-error history-help" aria-invalid=${Boolean(this.errors.precision)} @input=${(e: Event) => this.change('precision', (e.target as HTMLInputElement).valueAsNumber)} />${this.errorFor('precision')}</div>` : nothing}
                  ${
                    f.valueType === 'rating'
                      ? html`<div class="grid">
                            <div class="field">
                              <label for="minimumValue">Minimum</label
                              ><input
                                id="minimumValue"
                                value="1"
                                readonly
                                aria-describedby="bounds-help"
                              />
                            </div>
                            <div class="field">
                              <label for="maximumValue">Maximum</label
                              ><select
                                id="maximumValue"
                                ?disabled=${this.historyLocked}
                                .value=${String(f.maximumValue)}
                                @change=${(e: Event) => this.change('maximumValue', Number((e.target as HTMLSelectElement).value))}
                              >
                                <option value="5">5</option>
                                <option value="10">10</option>
                              </select>
                            </div>
                          </div>
                          <p class="help" id="bounds-help">
                            Rating values will be selected from 1 to this
                            maximum.
                          </p>`
                      : html`<div class="grid">
                            ${this.bound('minimumValue', 'Minimum')}${this.bound('maximumValue', 'Maximum')}
                          </div>
                          <p class="help" id="bounds-help">
                            Optional
                            limits.${f.valueType === 'duration' ? ' Use hours:minutes:seconds, for example 0:05:00.' : ' Values use the selected display unit.'}
                          </p>`
                  }
                  <div class="field">
                    <label for="aggregation">Aggregation</label
                    ><select
                      id="aggregation"
                      .value=${f.aggregation}
                      aria-describedby="aggregation-error aggregation-help"
                      @change=${(e: Event) => this.change('aggregation', (e.target as HTMLSelectElement).value as MeasurementFields['aggregation'])}
                    >
                      ${Object.entries(aggregationLabels)
                        .filter(
                          ([v]) => f.valueType !== 'rating' || v !== 'total',
                        )
                        .map(
                          ([v, label]) =>
                            html`<option value=${v}>${label}</option>`,
                        )}
                    </select>
                    <p class="help" id="aggregation-help">
                      How recorded values may be summarized across activities.
                    </p>
                    ${this.errorFor('aggregation')}
                  </div>
                  <div class="field">
                    <label for="personalBestDirection">Personal bests</label
                    ><select
                      id="personalBestDirection"
                      .value=${f.personalBestDirection}
                      @change=${(e: Event) => this.change('personalBestDirection', (e.target as HTMLSelectElement).value as MeasurementFields['personalBestDirection'])}
                    >
                      ${Object.entries(bestLabels).map(([v, label]) => html`<option value=${v}>${label}</option>`)}
                    </select>
                  </div>`
              : html`<p class="help">
                  This value type has no numeric settings.
                </p>`
          }
          <div class="field">
            <label for="sortOrder">Display order</label
            ><input
              id="sortOrder"
              type="number"
              min="0"
              max="2147483647"
              step="1"
              .value=${String(f.sortOrder)}
              aria-invalid=${Boolean(this.errors.sortOrder)}
              aria-describedby="sortOrder-error"
              @input=${(e: Event) => this.change('sortOrder', (e.target as HTMLInputElement).valueAsNumber)}
            />${this.errorFor('sortOrder')}
          </div>
        </fieldset>
      </details>
      ${
        this.dismissWarning
          ? html`<div class="notice" role="alert">
              <p>Discard your unsaved measurement changes?</p>
              <div class="actions">
                <button
                  id="keep-editing"
                  type="button"
                  @click=${() => {
                    this.dismissWarning = false;
                  }}
                >
                  Keep editing</button
                ><button type="button" @click=${this.dismiss}>
                  Discard changes
                </button>
              </div>
            </div>`
          : nothing
      }
      <div class="actions">
        <button
          type="button"
          ?disabled=${this.busy}
          @click=${() => this.requestDismiss()}
        >
          Cancel</button
        ><button
          class="primary"
          ?disabled=${this.busy || Boolean(this.pendingType)}
        >
          ${this.busy ? 'Saving…' : this.definition ? 'Save measurement' : 'Add measurement'}
        </button>
      </div>
    </form>`;
  }
}
customElements.define('measurement-form', MeasurementForm);
