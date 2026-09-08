import { LitElement, html, type PropertyValues } from 'lit';
import type { ActivitySummary, Activity } from '@activus/contracts';
import {
  configurationApi,
  type JournalApi,
} from '../../services/configuration-api.js';
import { trapDialogFocus } from '../../components/dialog-focus.js';
import { journalStyles } from './styles.js';
import { journalDate } from './format.js';
import { readError } from './presentation.js';
export class ActivityDeleteDialog extends LitElement {
  static override properties = {
    activity: { attribute: false },
    api: { attribute: false },
    busy: { state: true },
    error: { state: true },
  };
  activity: Activity | ActivitySummary | undefined;
  api: Pick<JournalApi, 'deleteActivity'> = configurationApi;
  private busy = false;
  private error: unknown;
  private guard = (e: Event) => {
    if (this.busy) e.preventDefault();
  };
  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('before-route-change', this.guard);
  }
  override disconnectedCallback() {
    window.removeEventListener('before-route-change', this.guard);
    super.disconnectedCallback();
  }
  protected override updated(changed: PropertyValues) {
    if (changed.has('activity') && this.activity) {
      this.error = undefined;
      const dialog = this.renderRoot.querySelector('dialog')!;
      if (!dialog.open) dialog.showModal();
    }
  }
  private cancel() {
    if (this.busy) return;
    this.renderRoot.querySelector('dialog')?.close();
    this.dispatchEvent(
      new CustomEvent('delete-cancel', { bubbles: true, composed: true }),
    );
  }
  private async confirmDelete() {
    if (this.busy || !this.activity) return;
    this.busy = true;
    this.error = undefined;
    try {
      await this.api.deleteActivity(this.activity.id);
      this.busy = false;
      this.dispatchEvent(
        new CustomEvent<string>('activity-deleted', {
          detail: this.activity.id,
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      this.error = error;
    } finally {
      this.busy = false;
    }
  }
  override render() {
    return html`<dialog
      aria-labelledby="delete-title"
      @keydown=${trapDialogFocus}
      @cancel=${(e: Event) => {
        e.preventDefault();
        this.cancel();
      }}
    >
      <h2 id="delete-title">Delete activity?</h2>
      <p>
        ${this.activity ? `${this.activity.kind.name} · ${journalDate(this.activity.activityDate)}${this.activity.name ? ` · ${this.activity.name}` : ''}` : ''}
      </p>
      <p>
        This permanently deletes the activity, its measurements and tag
        assignments. It cannot be undone.
      </p>
      ${this.error ? readError(this.error) : ''}
      <p role="status">${this.busy ? 'Deleting activity…' : ''}</p>
      <div class="actions">
        <button autofocus ?disabled=${this.busy} @click=${this.cancel}>
          Keep activity</button
        ><button
          class="danger"
          ?disabled=${this.busy}
          @click=${this.confirmDelete}
        >
          ${this.busy ? 'Deleting…' : 'Delete activity'}
        </button>
      </div>
    </dialog>`;
  }
  static override styles = journalStyles;
}
customElements.define('activity-delete-dialog', ActivityDeleteDialog);
