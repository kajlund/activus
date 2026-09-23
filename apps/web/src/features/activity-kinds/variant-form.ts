import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import {
  CreateActivityVariantRequestSchema,
  type ActivityVariant,
} from '@activus/contracts';
import {
  ClientError,
  clientMessage,
} from '../../services/configuration-api.js';
import { managementStyles } from './styles.js';
import { configurationFormStyles } from './configuration-styles.js';
export class VariantForm extends LitElement {
  static override properties = {
    variant: { attribute: false },
    owner: { type: String },
    parentArchived: { type: Boolean },
    busy: { type: Boolean },
    error: { attribute: false },
    nameValue: { state: true },
    sortValue: { state: true },
    defaultValue: { state: true },
    errors: { state: true },
  };
  owner = '';
  variant: ActivityVariant | undefined;
  parentArchived = false;
  busy = false;
  error: unknown;
  private nameValue = '';
  private sortValue = '0';
  private defaultValue = false;
  private errors: Record<string, string> = {};
  get dirty() {
    return (
      this.nameValue !== (this.variant?.name ?? '') ||
      this.sortValue !== String(this.variant?.sortOrder ?? 0) ||
      this.defaultValue !== (this.variant?.isDefault ?? false)
    );
  }
  static override styles = [
    managementStyles,
    css`
      form,
      fieldset {
        display: grid;
        gap: var(--space-5);
      }
      fieldset {
        min-width: 0;
        padding: 0;
        margin: 0;
        border: 0;
      }
      .actions {
        justify-content: flex-end;
        border-top: 1px solid var(--color-border);
        padding-top: var(--space-4);
      }
    `,
    configurationFormStyles,
  ];
  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('variant')) {
      this.nameValue = this.variant?.name ?? '';
      this.sortValue = String(this.variant?.sortOrder ?? 0);
      this.defaultValue = this.variant?.isDefault ?? false;
    }
  }
  protected override firstUpdated() {
    this.renderRoot.querySelector<HTMLInputElement>('#name')?.focus();
  }
  protected override updated(changed: PropertyValues) {
    if (
      changed.has('error') &&
      this.error instanceof ClientError &&
      this.error.code === 'ACTIVITY_VARIANT_NAME_CONFLICT'
    )
      this.renderRoot.querySelector<HTMLInputElement>('#name')?.focus();
  }
  private async submit(event: Event) {
    event.preventDefault();
    if (this.busy) return;
    const parsed = CreateActivityVariantRequestSchema.safeParse({
      name: this.nameValue,
      sortOrder: this.sortValue.trim() ? Number(this.sortValue) : NaN,
      isDefault: this.defaultValue,
    });
    this.errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        this.errors[String(issue.path[0])] =
          issue.path[0] === 'name'
            ? 'Enter a name of 1–120 characters.'
            : 'Enter a whole number from 0 to 2147483647.';
      await this.updateComplete;
      this.renderRoot
        .querySelector<HTMLElement>(
          `[data-field="${Object.keys(this.errors)[0]}"]`,
        )
        ?.focus();
      return;
    }
    this.dispatchEvent(
      new CustomEvent('save-variant', {
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
      this.error.code === 'ACTIVITY_VARIANT_NAME_CONFLICT'
        ? clientMessage(this.error)
        : undefined);
    return html`<form novalidate @submit=${this.submit} aria-busy=${this.busy}>
      <p class="help">Variant of ${this.owner}</p>
      <fieldset ?disabled=${this.busy}>
        <label class="field"
          ><span class="field-title" id="name-label"
            >Name <span class="required" aria-hidden="true"></span></span
          ><input
            id="name"
            aria-labelledby="name-label"
            data-field="name"
            required
            maxlength="120"
            .value=${this.nameValue}
            @input=${(e: Event) => {
              this.nameValue = (e.target as HTMLInputElement).value;
            }}
            aria-invalid=${!!nameError}
            aria-describedby="name-error"
          /><span class="error" id="name-error">${nameError ?? ''}</span></label
        >
        <div>
          <label class="check"
            ><input
              type="checkbox"
              .checked=${this.defaultValue}
              ?disabled=${this.parentArchived || this.variant?.isArchived}
              @change=${(e: Event) => {
                this.defaultValue = (e.target as HTMLInputElement).checked;
              }}
              aria-describedby="default-help"
            />Use as default variant</label
          >
          <p class="help" id="default-help">
            The default may be preselected when recording an activity. Selecting
            it replaces the current
            default.${this.parentArchived || this.variant?.isArchived ? ' Restore the kind and variant before selecting a default.' : ''}
          </p>
        </div>
        <label class="field"
          ><span class="field-title"
            >Sort order <span class="required" aria-hidden="true"></span></span
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
          ><span class="error" id="order-error"
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
          ${this.busy ? 'Saving…' : this.variant ? 'Save changes' : 'Add variant'}
        </button>
      </div>
    </form>`;
  }
}
customElements.define('variant-form', VariantForm);
