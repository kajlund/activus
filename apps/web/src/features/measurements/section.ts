import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type {
  ActivityKind,
  ActivityVariant,
  MeasurementDefinition,
  MeasurementDefinitionListResponse,
  MeasurementFields,
  MeasurementUnit,
} from '@activus/contracts';
import {
  configurationApi,
  ClientError,
  clientMessage,
  type ConfigurationApi,
  type MeasurementApi,
} from '../../services/configuration-api.js';
import { managementStyles } from '../activity-kinds/styles.js';
import { trapDialogFocus } from '../../components/dialog-focus.js';
import { navigate } from '../../routes/navigation.js';
import { typeLabels, aggregationLabels, bestLabels } from './fields.js';
import { MeasurementForm } from './form.js';

type Editor =
  | { action: 'edit'; value?: MeasurementDefinition }
  | { action: 'archive' | 'restore'; value: MeasurementDefinition };
export class MeasurementSection extends LitElement {
  static override properties = {
    kind: { attribute: false },
    variant: { attribute: false },
    variantUnavailable: { type: Boolean },
    route: { type: String },
    api: { attribute: false },
    kindApi: { attribute: false },
    result: { state: true },
    units: { state: true },
    loading: { state: true },
    error: { state: true },
    unitError: { state: true },
    editor: { state: true },
    mutationError: { state: true },
    busy: { state: true },
  };
  kind!: ActivityKind;
  variant: ActivityVariant | undefined;
  variantUnavailable = false;
  route = '';
  api: MeasurementApi = configurationApi;
  kindApi: ConfigurationApi = configurationApi;
  private result: MeasurementDefinitionListResponse | undefined;
  private units: MeasurementUnit[] | undefined;
  private loading = false;
  private error: unknown;
  private unitError: unknown;
  private mutationError: unknown;
  private editor: Editor | undefined;
  private busy = '';
  private controller: AbortController | undefined;
  private mutation: AbortController | undefined;
  private generation = 0;
  private context = '';
  private opener: HTMLElement | undefined;
  private get archived() {
    return (
      new URL(this.route || location.href, location.origin).searchParams.get(
        'measurementsArchived',
      ) === 'true'
    );
  }
  static override styles = [
    managementStyles,
    css`
      :host {
        margin-top: var(--space-7);
      }
      header,
      .toolbar {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }
      header > div {
        flex: 1;
        min-width: 0;
      }
      header p {
        margin-top: var(--space-2);
        max-width: 64ch;
      }
      h3 {
        margin: var(--space-5) 0 var(--space-3);
        overflow-wrap: anywhere;
      }
      .list {
        padding: 0;
        list-style: none;
        background: var(--color-surface);
        border-top: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-4);
        border-bottom: 1px solid var(--color-border);
      }
      .copy {
        flex: 1;
        min-width: 180px;
        overflow-wrap: anywhere;
      }
      .metadata {
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
        margin-top: var(--space-2);
        font-size: var(--font-size-small);
        color: var(--color-text-muted);
      }
      .archived {
        background: var(--color-surface-subtle);
      }
      .empty {
        padding: var(--space-5) 0;
        border-top: 1px solid var(--color-border);
      }
      .empty p {
        margin-top: var(--space-2);
      }
      .primary-note {
        margin: var(--space-3) 0;
      }
      .toolbar {
        align-items: center;
      }
      .status {
        min-height: 1.5em;
      }
      details {
        position: relative;
      }
      summary {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        cursor: pointer;
        list-style: none;
        border-radius: var(--radius-md);
      }
      summary::-webkit-details-marker {
        display: none;
      }
      .menu {
        position: absolute;
        right: 0;
        top: 44px;
        z-index: 4;
        width: 190px;
        display: grid;
        padding: var(--space-2);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-md);
      }
      .menu button {
        text-align: left;
        justify-content: flex-start;
        border: 0;
      }
      dialog {
        width: min(680px, calc(100% - 32px));
        max-height: calc(100dvh - 48px);
        padding: var(--space-6);
        overflow-y: auto;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        color: var(--color-text);
        background: var(--color-surface);
        box-shadow: var(--shadow-md);
      }
      dialog::backdrop {
        background: rgb(23 18 28 / 0.5);
      }
      dialog h2 {
        margin-bottom: var(--space-5);
      }
      .confirmation {
        display: grid;
        gap: var(--space-5);
      }
      .confirmation strong {
        overflow-wrap: anywhere;
      }
      @media (max-width: 600px) {
        .row {
          padding: var(--space-3);
        }
        .copy {
          min-width: 0;
          flex-basis: calc(100% - 64px);
        }
        header > button {
          width: 100%;
        }
        dialog {
          width: 100%;
          max-width: 100%;
          height: 100dvh;
          max-height: 100dvh;
          margin: 0;
          border: 0;
          border-radius: 0;
          padding: var(--space-5);
        }
      }
    `,
  ];
  protected override willUpdate(changed: PropertyValues) {
    if (
      changed.has('route') ||
      changed.has('api') ||
      changed.has('variant') ||
      (changed.has('kind') && this.kind.id !== this.context.split(':')[0])
    ) {
      const context = `${this.kind.id}:${this.variant?.id ?? ''}`;
      if (context !== this.context) {
        this.result = undefined;
        this.context = context;
      }
      this.mutation?.abort();
      this.busy = '';
      this.close(false);
      void this.load();
    }
  }
  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (
      this.busy ||
      this.renderRoot.querySelector<MeasurementForm>('measurement-form')?.dirty
    ) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  private beforeRouteChange = (event: Event) => {
    if (
      this.busy ||
      (this.renderRoot.querySelector<MeasurementForm>('measurement-form')
        ?.dirty &&
        !window.confirm(
          'Discard your unsaved measurement changes and leave this view?',
        ))
    )
      event.preventDefault();
  };
  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('beforeunload', this.beforeUnload);
    window.addEventListener('before-route-change', this.beforeRouteChange);
  }
  override disconnectedCallback() {
    this.controller?.abort();
    this.mutation?.abort();
    this.generation++;
    window.removeEventListener('beforeunload', this.beforeUnload);
    window.removeEventListener('before-route-change', this.beforeRouteChange);
    super.disconnectedCallback();
  }
  async load() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;
    if (this.variantUnavailable) {
      this.result = undefined;
      this.loading = false;
      return;
    }
    this.loading = true;
    this.error = undefined;
    this.unitError = undefined;
    const [result, units] = await Promise.allSettled([
      this.api.listMeasurements(
        this.kind.id,
        this.archived,
        this.variant?.id,
        controller.signal,
      ),
      this.api.units(),
    ]);
    if (generation !== this.generation || controller.signal.aborted) return;
    if (result.status === 'fulfilled') this.result = result.value;
    else this.error = result.reason;
    if (units.status === 'fulfilled') this.units = units.value.items;
    else {
      this.units = undefined;
      this.unitError = units.reason;
    }
    this.loading = false;
  }
  private url(parent = false) {
    const url = new URL(this.route || location.href, location.origin);
    if (parent) url.searchParams.delete('measurementVariant');
    return url;
  }
  private toggle(event: Event) {
    const url = this.url();
    if ((event.target as HTMLInputElement).checked)
      url.searchParams.set('measurementsArchived', 'true');
    else url.searchParams.delete('measurementsArchived');
    navigate(url.pathname + url.search);
  }
  private async open(editor: Editor, event: Event) {
    const target = event.currentTarget as HTMLElement;
    this.opener = target.closest('details')?.querySelector('summary') ?? target;
    this.renderRoot
      .querySelectorAll('details')
      .forEach((d) => (d.open = false));
    this.editor = editor;
    this.mutationError = undefined;
    await this.updateComplete;
    this.renderRoot.querySelector('dialog')?.showModal();
    const form =
      this.renderRoot.querySelector<MeasurementForm>('measurement-form');
    if (form) {
      await form.updateComplete;
      form.shadowRoot?.querySelector<HTMLInputElement>('#name')?.focus();
    } else
      this.renderRoot
        .querySelector<HTMLButtonElement>('dialog button')
        ?.focus();
  }
  private dismiss() {
    if (this.busy) return;
    const form =
      this.renderRoot.querySelector<MeasurementForm>('measurement-form');
    if (form) form.requestDismiss();
    else this.close();
  }
  private close(restore = true) {
    this.renderRoot.querySelector('dialog')?.close();
    this.editor = undefined;
    this.mutationError = undefined;
    if (restore)
      (this.opener?.isConnected
        ? this.opener
        : this.renderRoot.querySelector<HTMLElement>('h2')
      )?.focus();
  }
  private async run(
    id: string,
    action: (signal: AbortSignal) => Promise<unknown>,
    refresh = true,
  ) {
    if (this.busy) return;
    const controller = new AbortController();
    this.mutation = controller;
    this.busy = id;
    this.mutationError = undefined;
    try {
      await action(controller.signal);
      if (controller.signal.aborted || !this.isConnected) return;
      this.close();
      if (refresh) await this.load();
      await this.updateComplete;
      if (!controller.signal.aborted && !this.opener?.isConnected)
        this.renderRoot.querySelector<HTMLElement>('h2')?.focus();
    } catch (error) {
      if (!controller.signal.aborted) this.mutationError = error;
    } finally {
      if (this.mutation === controller) this.busy = '';
    }
  }
  private save(event: CustomEvent<MeasurementFields>) {
    const value =
      this.editor?.action === 'edit' ? this.editor.value : undefined;
    // PATCH only changed fields; never overwrite unrelated concurrent changes.
    const input = value
      ? Object.fromEntries(
          Object.entries(event.detail).filter(
            ([key, v]) => value[key as keyof MeasurementFields] !== v,
          ),
        )
      : event.detail;
    if (value && !Object.keys(input).length) {
      this.close();
      return;
    }
    void this.run(value?.id ?? 'create', (signal) =>
      value
        ? this.api.updateMeasurement(value.id, input, signal)
        : this.api.createMeasurement(
            this.kind.id,
            { ...event.detail, activityVariantId: this.variant?.id ?? null },
            signal,
          ),
    );
  }
  private primary(id: string | null) {
    const active = this.shadowRoot?.activeElement;
    this.opener =
      active instanceof HTMLElement
        ? (active.closest('details')?.querySelector('summary') ?? active)
        : undefined;
    this.renderRoot
      .querySelectorAll('details')
      .forEach((d) => (d.open = false));
    void this.run(
      id ?? 'primary',
      async (signal) => {
        const kind = await this.kindApi.updateKind(
          this.kind.id,
          { primaryMeasurementDefinitionId: id },
          signal,
        );
        if (!signal.aborted) {
          this.kind = kind;
          this.dispatchEvent(
            new CustomEvent('kind-updated', {
              detail: kind,
              bubbles: true,
              composed: true,
            }),
          );
        }
      },
      false,
    );
  }
  private confirm() {
    const editor = this.editor;
    if (!editor || editor.action === 'edit') return;
    void this.run(editor.value.id, (signal) =>
      editor.action === 'archive'
        ? this.api.archiveMeasurement(editor.value.id, signal)
        : this.api.restoreMeasurement(editor.value.id, signal),
    );
  }
  private errorBox(error: unknown) {
    return html`<div class="error-box" role="alert">
      ${clientMessage(error)}${error instanceof ClientError && error.requestId ? html`<small>Request ID: ${error.requestId}</small>` : nothing}
    </div>`;
  }
  private rows(items: MeasurementDefinition[], inherited = false) {
    return items.length
      ? html`<ul
          class="list"
          aria-label=${inherited ? 'Inherited measurements' : 'Measurement definitions'}
        >
          ${repeat(
            items,
            (m) => m.id,
            (m) => {
              const unit = this.units?.find((u) => u.id === m.displayUnit);
              const primary = this.kind.primaryMeasurementDefinitionId === m.id;
              const eligible =
                !m.isArchived &&
                m.activityVariantId === null &&
                !['boolean', 'text'].includes(m.valueType);
              const parent = this.url(true);
              return html`<li class=${`row ${m.isArchived ? 'archived' : ''}`}>
                <div class="copy">
                  <strong>${m.name}</strong>
                  <div class="metadata">
                    <span
                      >${typeLabels[m.valueType]}${unit ? ` · ${unit.symbol}` : m.displayUnit === null ? ' · No unit' : ''}</span
                    ><span>${m.isRequired ? 'Required' : 'Optional'}</span
                    >${primary ? html`<span class="badge default">Primary</span>` : nothing}${inherited ? html`<span class="badge">Inherited</span>` : nothing}${m.isArchived ? html`<span class="badge">Archived</span>` : nothing}${m.aggregation !== 'none' ? html`<span>${aggregationLabels[m.aggregation]}</span>` : nothing}${m.personalBestDirection !== 'none' ? html`<span>${bestLabels[m.personalBestDirection]}</span>` : nothing}
                  </div>
                </div>
                ${
                  inherited
                    ? html`<a
                        class="button quiet"
                        href=${parent.pathname + parent.search}
                        >Edit at parent</a
                      >`
                    : html`<details>
                        <summary
                          aria-label=${`Measurement actions for ${m.name}`}
                        >
                          •••
                        </summary>
                        <div class="menu">
                          <button
                            ?disabled=${this.busy === m.id || !this.units}
                            @click=${(e: Event) => this.open({ action: 'edit', value: m }, e)}
                          >
                            Edit measurement</button
                          >${eligible && !primary ? html`<button ?disabled=${Boolean(this.busy)} @click=${() => this.primary(m.id)}>Set as primary</button>` : nothing}${primary ? html`<button ?disabled=${Boolean(this.busy)} @click=${() => this.primary(null)}>Clear primary</button>` : nothing}<button
                            ?disabled=${this.busy === m.id || (m.isArchived && (this.kind.isArchived || this.variant?.isArchived === true))}
                            @click=${(e: Event) => this.open({ action: m.isArchived ? 'restore' : 'archive', value: m }, e)}
                          >
                            ${m.isArchived ? 'Restore measurement' : 'Archive measurement'}
                          </button>
                        </div>
                      </details>`
                }
              </li>`;
            },
          )}
        </ul>`
      : html`<div class="empty">
          <p>
            ${inherited ? 'No inherited measurements.' : 'No measurements yet'}
          </p>
          <p class="help">
            ${inherited ? 'Parent measurements apply to every variant.' : 'Add the values you want to record for this activity kind. Overall duration and notes are already available.'}
          </p>
        </div>`;
  }
  override render() {
    const editor = this.editor;
    const parent = this.url(true);
    if (this.variantUnavailable)
      return html`<h2>Measurements</h2>
        <p role="alert">This variant is unavailable for this activity kind.</p>
        <a href=${parent.pathname + parent.search}
          >Return to parent measurements</a
        >`;
    return html`<section aria-labelledby="measurements-title">
      <header>
        <div>
          <h2 id="measurements-title" tabindex="-1">Measurements</h2>
          <p class="muted">
            ${this.variant ? `Additional values for ${this.variant.name}. Parent measurements apply to every variant.` : 'Define the values to record. Overall duration and notes are already common activity fields.'}
          </p>
        </div>
        <button
          class="primary"
          ?disabled=${!this.units || this.kind.isArchived || this.variant?.isArchived || this.busy === 'create'}
          @click=${(e: Event) => this.open({ action: 'edit' }, e)}
        >
          Add measurement
        </button>
      </header>
      ${this.variant ? html`<a href=${parent.pathname + parent.search}>Return to parent measurements</a>` : html`<p class="help primary-note">The primary measurement appears in compact activity summaries.${!this.kind.primaryMeasurementDefinitionId ? ' No primary measurement selected.' : ''}</p>`}
      <div class="toolbar">
        <span class="help"
          >${this.variant ? `Only for ${this.variant.name}` : 'For every variant'}</span
        ><label class="check"
          ><input
            type="checkbox"
            .checked=${this.archived}
            @change=${this.toggle}
          />Show archived measurements</label
        >
      </div>
      ${this.error ? html`${this.errorBox(this.error)}<button @click=${() => void this.load()}>Retry measurements</button>` : nothing}
      ${
        this.unitError
          ? html`<p>
                Unit metadata could not be loaded. Forms are unavailable until
                it loads.
              </p>
              ${this.errorBox(this.unitError)}<button
                @click=${() => void this.load()}
              >
                Retry units
              </button>`
          : nothing
      }
      ${this.mutationError && !editor ? this.errorBox(this.mutationError) : nothing}
      ${
        this.result
          ? this.result.view === 'effective'
            ? html`<h3>Inherited from ${this.kind.name}</h3>
                ${this.rows(
                  this.result.items.filter((m) => m.source === 'inherited'),
                  true,
                )}
                <h3>Only for ${this.variant?.name}</h3>
                ${this.rows(this.result.items.filter((m) => m.source === 'variant-specific'))}`
            : this.rows(
                this.result.items.filter((m) => m.activityVariantId === null),
              )
          : nothing
      }
      <p class="help status" role="status">
        ${this.loading ? (this.result ? 'Updating measurements…' : 'Loading measurements…') : this.busy ? 'Saving measurement configuration…' : ''}
      </p>
      ${
        editor
          ? html`<dialog
              aria-labelledby="measurement-editor-title"
              @keydown=${trapDialogFocus}
              @cancel=${(e: Event) => {
                e.preventDefault();
                this.dismiss();
              }}
              @dismiss-measurement=${() => this.close()}
            >
              <h2 id="measurement-editor-title">
                ${editor.action === 'edit' ? (editor.value ? 'Edit measurement' : 'Add measurement') : editor.action === 'archive' ? 'Archive measurement?' : 'Restore measurement?'}
              </h2>
              ${
                editor.action === 'edit'
                  ? html`<measurement-form
                      .definition=${editor.value}
                      .owner=${this.variant ? `Applies only to ${this.variant.name}` : `Applies to ${this.kind.name} and every variant`}
                      .units=${this.units ?? []}
                      .busy=${Boolean(this.busy)}
                      .error=${this.mutationError}
                      @save-measurement=${this.save}
                    ></measurement-form>`
                  : html`<div class="confirmation">
                      <strong>${editor.value.name}</strong>
                      <p>
                        ${editor.action === 'archive' ? 'Historical values remain visible. This measurement will no longer appear for new activity entries. Clear or replace it first if it is the primary measurement.' : 'Restore this measurement for new activity entries. Its name must not conflict with another definition or an inherited measurement.'}
                      </p>
                      ${this.mutationError ? this.errorBox(this.mutationError) : nothing}
                      <div class="actions">
                        <button
                          ?disabled=${Boolean(this.busy)}
                          @click=${this.dismiss}
                        >
                          Cancel</button
                        ><button
                          class="primary"
                          ?disabled=${Boolean(this.busy)}
                          @click=${this.confirm}
                        >
                          ${editor.action === 'archive' ? 'Archive measurement' : 'Restore measurement'}
                        </button>
                      </div>
                    </div>`
              }
            </dialog>`
          : nothing
      }
    </section>`;
  }
}
customElements.define('measurement-section', MeasurementSection);
