import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import {
  CreateActivityKindRequestSchema,
  activityKindIconNames,
  type ActivityKind,
} from '@activus/contracts';
import {
  ClientError,
  clientMessage,
} from '../../services/configuration-api.js';
import { managementStyles } from './styles.js';
import { activityIcon, iconLabels } from './icons.js';
const palette = [
  ['Purple', '#67318F'],
  ['Blue', '#527FA5'],
  ['Clay', '#A66B3F'],
  ['Lavender', '#8069A5'],
  ['Sand', '#9A7650'],
  ['Rose', '#A15467'],
] as const;
export class KindForm extends LitElement {
  static override properties = {
    kind: { attribute: false },
    busy: { type: Boolean },
    error: { attribute: false },
    nameValue: { state: true },
    iconValue: { state: true },
    colorValue: { state: true },
    sortValue: { state: true },
    search: { state: true },
    errors: { state: true },
  };
  kind: ActivityKind | undefined;
  busy = false;
  error: unknown;
  private nameValue = '';
  private iconValue: ActivityKind['iconName'] = 'activity';
  private colorValue = '#67318F';
  private sortValue = '0';
  private search = '';
  private errors: Record<string, string> = {};
  static override styles = [
    managementStyles,
    css`
      form {
        display: grid;
        gap: var(--space-5);
      }
      fieldset {
        padding: 0;
        margin: 0;
        border: 0;
        min-width: 0;
        display: grid;
        gap: var(--space-5);
      }
      legend {
        font-weight: 600;
        margin-bottom: var(--space-2);
      }
      .icon-options {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-2);
      }
      .icon-option {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-height: 48px;
        padding: var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        cursor: pointer;
      }
      .icon-option:has(input:checked) {
        background: var(--color-primary-soft);
        border-color: var(--color-primary);
      }
      .icon-option span {
        overflow-wrap: anywhere;
      }
      .preview {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        min-height: 44px;
      }
      .palette {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .palette button {
        padding: var(--space-2);
        min-width: 44px;
      }
      .palette button[aria-pressed='true'] {
        outline: 2px solid var(--color-primary);
        outline-offset: 1px;
      }
      .actions {
        justify-content: flex-end;
        padding-top: var(--space-3);
        border-top: 1px solid var(--color-border);
      }
    `,
  ];
  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('kind')) {
      this.nameValue = this.kind?.name ?? '';
      this.iconValue = this.kind?.iconName ?? 'activity';
      this.colorValue = this.kind?.color ?? '#67318F';
      this.sortValue = String(this.kind?.sortOrder ?? 0);
    }
  }
  protected override firstUpdated() {
    this.renderRoot.querySelector<HTMLInputElement>('#name')?.focus();
  }
  protected override updated(changed: PropertyValues) {
    if (
      changed.has('error') &&
      this.error instanceof ClientError &&
      this.error.code === 'ACTIVITY_KIND_NAME_CONFLICT'
    )
      this.renderRoot.querySelector<HTMLInputElement>('#name')?.focus();
  }
  private async submit(event: Event) {
    event.preventDefault();
    if (this.busy) return;
    const parsed = CreateActivityKindRequestSchema.safeParse({
      name: this.nameValue,
      iconName: this.iconValue,
      color: this.colorValue,
      sortOrder: this.sortValue.trim() ? Number(this.sortValue) : NaN,
    });
    this.errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        this.errors[field] =
          field === 'name'
            ? 'Enter a name of 1–120 characters.'
            : field === 'color'
              ? 'Enter a six-digit hex colour, such as #67318F.'
              : field === 'sortOrder'
                ? 'Enter a whole number from 0 to 2147483647.'
                : 'Choose a supported icon.';
      }
      await this.updateComplete;
      this.renderRoot
        .querySelector<HTMLElement>(
          `[data-field="${Object.keys(this.errors)[0]}"]`,
        )
        ?.focus();
      return;
    }
    this.dispatchEvent(
      new CustomEvent('save-kind', {
        detail: parsed.data,
        bubbles: true,
        composed: true,
      }),
    );
  }
  override render() {
    const nameError =
      this.errors.name ??
      (this.error instanceof ClientError &&
      this.error.code === 'ACTIVITY_KIND_NAME_CONFLICT'
        ? clientMessage(this.error)
        : undefined);
    const options = activityKindIconNames.filter((name) =>
      iconLabels[name].toLowerCase().includes(this.search.toLowerCase()),
    );
    return html`<form novalidate @submit=${this.submit} aria-busy=${this.busy}>
      <fieldset ?disabled=${this.busy}>
        <label class="field"
          ><span class="field-title" id="name-label">Name</span
          ><input
            id="name"
            aria-labelledby="name-label"
            data-field="name"
            maxlength="120"
            required
            autocomplete="off"
            .value=${this.nameValue}
            @input=${(e: Event) => {
              this.nameValue = (e.target as HTMLInputElement).value;
            }}
            aria-invalid=${!!nameError}
            aria-describedby="name-error"
          /><span id="name-error" class="error">${nameError ?? ''}</span></label
        >
        <fieldset>
          <legend>Icon</legend>
          <label class="field"
            ><span class="help">Search icons</span
            ><input
              type="search"
              .value=${this.search}
              @input=${(e: Event) => {
                this.search = (e.target as HTMLInputElement).value;
              }}
          /></label>
          <div class="icon-options">
            ${options.map(
              (name) =>
                html`<label class="icon-option"
                  ><input
                    type="radio"
                    name="icon"
                    value=${name}
                    .checked=${this.iconValue === name}
                    @change=${() => {
                      this.iconValue = name;
                    }}
                  />${activityIcon(name)}<span>${iconLabels[name]}</span></label
                >`,
            )}
          </div>
          ${options.length ? nothing : html`<p class="help">No matching icons. Try another search.</p>`}
        </fieldset>
        <div class="field">
          <span class="field-title">Colour</span>
          <div class="palette" role="group" aria-label="Approved colours">
            ${palette.map(
              ([label, color]) =>
                html`<button
                  type="button"
                  title=${label}
                  aria-label=${`${label} ${color}`}
                  aria-pressed=${this.colorValue.toUpperCase() === color}
                  @click=${() => {
                    this.colorValue = color;
                  }}
                >
                  <span class="swatch" style=${`background:${color}`}></span
                  >${this.colorValue.toUpperCase() === color ? html`<span aria-hidden="true">✓</span>` : nothing}
                </button>`,
            )}
          </div>
          <label class="field"
            ><span class="help">Custom hex colour</span
            ><input
              data-field="color"
              .value=${this.colorValue}
              @input=${(e: Event) => {
                this.colorValue = (e.target as HTMLInputElement).value;
              }}
              aria-invalid=${!!this.errors.color}
              aria-describedby="color-error"
            /><span id="color-error" class="error"
              >${this.errors.color ?? ''}</span
            ></label
          >
          <div class="preview">
            ${activityIcon(this.iconValue)}<span
              class="swatch"
              style=${/^#[0-9a-f]{6}$/i.test(this.colorValue) ? `background:${this.colorValue}` : ''}
            ></span
            ><span class="help"
              >Selected icon: ${iconLabels[this.iconValue]}</span
            >
          </div>
        </div>
        <label class="field"
          ><span class="field-title">Sort order</span
          ><input
            data-field="sortOrder"
            type="number"
            min="0"
            max="2147483647"
            step="1"
            required
            .value=${this.sortValue}
            @input=${(e: Event) => {
              this.sortValue = (e.target as HTMLInputElement).value;
            }}
            aria-invalid=${!!this.errors.sortOrder}
            aria-describedby="order-help order-error"
          /><span id="order-help" class="help"
            >Lower numbers appear first. Equal numbers are allowed.</span
          ><span id="order-error" class="error"
            >${this.errors.sortOrder ?? ''}</span
          ></label
        >
      </fieldset>
      ${this.error ? html`<div class="error-box" role="alert">${clientMessage(this.error)}${this.error instanceof ClientError && this.error.requestId ? html`<small>Request ID: ${this.error.requestId}</small>` : nothing}</div>` : nothing}
      <div class="actions">
        <button
          type="button"
          ?disabled=${this.busy}
          @click=${() => this.dispatchEvent(new CustomEvent('cancel-editor', { bubbles: true, composed: true }))}
        >
          Cancel</button
        ><button class="primary" type="submit" ?disabled=${this.busy}>
          ${this.busy ? 'Saving…' : this.kind ? 'Save changes' : 'Add activity kind'}
        </button>
      </div>
    </form>`;
  }
}
customElements.define('kind-form', KindForm);
