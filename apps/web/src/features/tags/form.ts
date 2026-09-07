import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { CreateTagRequestSchema, type Tag } from '@activus/contracts';
import {
  ClientError,
  clientMessage,
} from '../../services/configuration-api.js';
import { managementStyles } from '../activity-kinds/styles.js';
import { chartColours } from '../../components/chart-colours.js';

export const tagNameLimit = CreateTagRequestSchema.shape.name.maxLength!;
export class TagForm extends LitElement {
  static override properties = {
    tag: { attribute: false },
    busy: { type: Boolean },
    error: { attribute: false },
    nameValue: { state: true },
    colorValue: { state: true },
    nameError: { state: true },
    colorError: { state: true },
    discardWarning: { state: true },
  };
  tag: Tag | undefined;
  busy = false;
  error: unknown;
  private nameValue = '';
  private colorValue: string | null = null;
  private nameError = '';
  private colorError = '';
  private discardWarning = false;
  static override styles = [
    managementStyles,
    css`
      form,
      fieldset {
        display: grid;
        gap: var(--space-5);
      }
      fieldset {
        border: 0;
        padding: 0;
        margin: 0;
        min-width: 0;
      }
      legend {
        font-weight: 600;
        margin-bottom: var(--space-3);
      }
      .colours {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-2);
      }
      .choice {
        display: flex;
        gap: var(--space-2);
        min-height: 48px;
        align-items: center;
        padding: var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        cursor: pointer;
      }
      .choice:has(:checked) {
        border-color: var(--color-primary);
        background: var(--color-primary-soft);
      }
      .choice span {
        overflow-wrap: anywhere;
      }
      .notice {
        display: grid;
        gap: var(--space-3);
        padding: var(--space-4);
        background: var(--color-primary-soft);
        border-radius: var(--radius-md);
      }
      .actions {
        justify-content: flex-end;
      }
      .selection {
        min-height: 1.5em;
      }
    `,
  ];
  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('tag')) {
      this.nameValue = this.tag?.name ?? '';
      this.colorValue = this.tag?.color ?? null;
    }
  }
  protected override firstUpdated() {
    this.focusName();
  }
  protected override updated(changed: PropertyValues) {
    if (changed.has('error') && this.error) {
      if (
        this.error instanceof ClientError &&
        ['TAG_NAME_CONFLICT', 'TAG_INVALID'].includes(this.error.code)
      )
        this.focusName();
      else this.renderRoot.querySelector<HTMLElement>('#server-error')?.focus();
    }
  }
  private focusName() {
    this.renderRoot.querySelector<HTMLInputElement>('#name')?.focus();
  }
  get dirty() {
    return (
      this.nameValue !== (this.tag?.name ?? '') ||
      this.colorValue !== (this.tag?.color ?? null)
    );
  }
  requestDismiss() {
    if (this.busy) return;
    if (!this.dirty) this.dismiss();
    else {
      this.discardWarning = true;
      void this.updateComplete.then(() =>
        this.renderRoot
          .querySelector<HTMLButtonElement>('#keep-editing')
          ?.focus(),
      );
    }
  }
  private dismiss() {
    this.dispatchEvent(
      new CustomEvent('dismiss-tag', { bubbles: true, composed: true }),
    );
  }
  private async submit(event: Event) {
    event.preventDefault();
    if (this.busy) return;
    const result = CreateTagRequestSchema.safeParse({
      name: this.nameValue,
      color: this.colorValue,
    });
    this.nameError = '';
    this.colorError = '';
    if (!result.success) {
      for (const issue of result.error.issues) {
        if (issue.path[0] === 'name')
          this.nameError = `Enter a name of 1–${tagNameLimit} characters.`;
        else this.colorError = 'Choose a colour or No colour.';
      }
      await this.updateComplete;
      if (this.nameError) this.focusName();
      else
        this.renderRoot
          .querySelector<HTMLInputElement>('[name=colour]')
          ?.focus();
      return;
    }
    this.dispatchEvent(
      new CustomEvent('save-tag', {
        detail: result.data,
        bubbles: true,
        composed: true,
      }),
    );
  }
  private choice(label: string, color: string | null) {
    return html`<label class="choice"
      ><input
        type="radio"
        name="colour"
        value=${color ?? ''}
        .checked=${this.colorValue === color}
        aria-label=${color ? `${label} ${color}` : label}
        @change=${() => {
          this.colorValue = color;
        }}
      />${color ? html`<span class="swatch" style=${`background:${color}`} aria-hidden="true"></span>` : nothing}<span
        >${label}</span
      ></label
    >`;
  }
  override render() {
    const nameError =
      this.nameError ||
      (this.error instanceof ClientError &&
      this.error.code === 'TAG_NAME_CONFLICT'
        ? clientMessage(this.error)
        : '');
    const existing = this.tag?.color;
    const custom =
      existing && !chartColours.some(([, color]) => color === existing);
    const selected =
      this.colorValue === null
        ? 'No colour'
        : (chartColours.find(([, color]) => color === this.colorValue)?.[0] ??
          'Existing colour');
    return html`<form novalidate aria-busy=${this.busy} @submit=${this.submit}>
      <fieldset ?disabled=${this.busy}>
        <legend>Tag details</legend>
        <div class="field">
          <label class="field-title" for="name">Name</label
          ><input
            id="name"
            required
            maxlength=${tagNameLimit}
            autocomplete="off"
            .value=${this.nameValue}
            aria-invalid=${Boolean(nameError)}
            aria-describedby="name-error"
            @input=${(e: Event) => {
              this.nameValue = (e.target as HTMLInputElement).value;
            }}
          /><span id="name-error" class="error">${nameError}</span>
        </div>
        <fieldset aria-describedby="colour-help colour-error">
          <legend>Colour (optional)</legend>
          <div class="colours">
            ${this.choice('No colour', null)}${chartColours.map(([label, color]) => this.choice(label, color))}${custom ? this.choice('Existing colour', existing) : nothing}
          </div>
          <p class="help selection" id="colour-help" aria-live="polite">
            Selected: ${selected}
          </p>
          <span id="colour-error" class="error">${this.colorError}</span>
        </fieldset>
      </fieldset>
      ${this.error ? html`<div id="server-error" tabindex="-1" class="error-box" role="alert">${clientMessage(this.error)}${this.error instanceof ClientError && this.error.requestId ? html`<small>Request ID: ${this.error.requestId}</small>` : nothing}</div>` : nothing}
      ${
        this.discardWarning
          ? html`<div class="notice" role="alert">
              <p>Discard your unsaved tag changes?</p>
              <div class="actions">
                <button
                  id="keep-editing"
                  type="button"
                  @click=${() => {
                    this.discardWarning = false;
                    void this.updateComplete.then(() => this.focusName());
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
      <p class="help" role="status">${this.busy ? 'Saving tag…' : ''}</p>
      <div class="actions">
        <button
          type="button"
          ?disabled=${this.busy}
          @click=${() => this.requestDismiss()}
        >
          Cancel</button
        ><button class="primary" type="submit" ?disabled=${this.busy}>
          ${this.tag ? 'Save changes' : 'Create tag'}
        </button>
      </div>
    </form>`;
  }
}
customElements.define('tag-form', TagForm);
