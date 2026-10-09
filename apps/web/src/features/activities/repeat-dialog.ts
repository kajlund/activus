import { LitElement, css, html, nothing } from 'lit';
import { trapDialogFocus } from '../../components/dialog-focus.js';
import { journalStyles } from '../journal/styles.js';
import type { CopyOptions } from './repeat.js';

export class ActivityRepeatDialog extends LitElement {
  static override properties = { hasNotes: { type: Boolean } };
  hasNotes = false;
  protected override firstUpdated() {
    this.renderRoot.querySelector('dialog')!.showModal();
  }
  private cancel() {
    this.renderRoot.querySelector('dialog')?.close();
    this.dispatchEvent(
      new CustomEvent('repeat-cancel', { bubbles: true, composed: true }),
    );
  }
  private confirm(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    this.renderRoot.querySelector('dialog')?.close();
    this.dispatchEvent(
      new CustomEvent<CopyOptions>('repeat-confirm', {
        bubbles: true,
        composed: true,
        detail: {
          copyValues: data.get('values') === 'copy',
          copyNotes: this.hasNotes && data.get('notes') === 'on',
        },
      }),
    );
  }
  override render() {
    return html`<dialog
      aria-labelledby="repeat-title"
      @keydown=${trapDialogFocus}
      @cancel=${(e: Event) => {
        e.preventDefault();
        this.cancel();
      }}
    >
      <form @submit=${this.confirm}>
        <h2 id="repeat-title">Repeat activity</h2>
        <p>
          Start a new activity with the same kind, variant and name. Review it
          before saving.
        </p>
        <fieldset>
          <legend>Starting values</legend>
          <label
            ><input
              type="radio"
              name="values"
              value="empty"
              checked
              autofocus
            />
            Start with empty values (recommended)</label
          >
          <label
            ><input type="radio" name="values" value="copy" /> Copy duration and
            measurements</label
          >
        </fieldset>
        ${this.hasNotes ? html`<label><input type="checkbox" name="notes" /> Copy notes</label>` : nothing}
        <p>
          The date will be today in Helsinki. Start time, effort, feeling and
          tags will be empty.
        </p>
        <div class="actions">
          <button type="button" @click=${this.cancel}>Cancel</button
          ><button type="submit" class="primary">Start new activity</button>
        </div>
      </form>
    </dialog>`;
  }
  static override styles = [
    ...journalStyles,
    css`
      dialog {
        box-sizing: border-box;
        width: min(480px, calc(100% - 24px));
        padding: 20px;
      }
      fieldset {
        margin: 12px 0;
        padding: 0;
        border: 0;
      }
      legend {
        font-weight: 600;
        margin-bottom: 4px;
      }
      label {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-block: 8px;
      }
      .actions {
        display: flex;
        justify-content: end;
        flex-wrap: wrap;
        gap: 8px;
      }
    `,
  ];
}
customElements.define('activity-repeat-dialog', ActivityRepeatDialog);
