import { LitElement, css, html, nothing } from 'lit';
import type { Activity, Tag } from '@activus/contracts';
import { managementStyles } from '../activity-kinds/styles.js';

export class ActivityTagPicker extends LitElement {
  static override properties = {
    tags: { attribute: false },
    selected: { attribute: false },
    historical: { attribute: false },
    query: { state: true },
    disabled: { type: Boolean },
  };
  tags: Tag[] = [];
  selected: string[] = [];
  historical: Activity['tags'] = [];
  disabled = false;
  private query = '';
  static override styles = [
    managementStyles,
    css`
      .selected {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
      }
      .selected button {
        border-radius: var(--radius-pill);
        text-align: left;
        max-width: 100%;
      }
      .name {
        overflow-wrap: anywhere;
        min-width: 0;
      }
      .options {
        max-height: 220px;
        overflow-y: auto;
        margin-top: var(--space-2);
      }
      .check {
        padding: var(--space-2);
      }
      .swatch {
        width: 14px;
        height: 14px;
      }
    `,
  ];
  private toggle(id: string, add: boolean) {
    if (this.disabled) return;
    this.dispatchEvent(
      new CustomEvent<string[]>('tags-change', {
        detail: add
          ? [...new Set([...this.selected, id])]
          : this.selected.filter((v) => v !== id),
        bubbles: true,
        composed: true,
      }),
    );
  }
  override render() {
    const options = this.tags.filter(
      (t) =>
        !t.isArchived &&
        t.name.toLocaleLowerCase().includes(this.query.toLocaleLowerCase()),
    );
    return html`
      <div class="selected" aria-label="Selected tags">
        ${this.selected.map((id) => {
          const tag =
            this.tags.find((t) => t.id === id) ??
            this.historical.find((t) => t.id === id);
          return tag
            ? html`<button
                type="button"
                ?disabled=${this.disabled}
                aria-label=${`Remove ${tag.name}${tag.isArchived ? ' (archived)' : ''}`}
                @click=${async () => {
                  this.toggle(id, false);
                  await this.updateComplete;
                  this.renderRoot
                    .querySelector<HTMLInputElement>('input')
                    ?.focus();
                }}
              >
                <span class="name"
                  >${tag.name}${tag.isArchived ? ' (archived)' : ''}</span
                ><span aria-hidden="true">×</span>
              </button>`
            : nothing;
        })}
      </div>
      ${
        this.tags.length
          ? html`<label class="field" for="tag-search"
                >Search tags<input
                  id="tag-search"
                  type="search"
                  .value=${this.query}
                  ?disabled=${this.disabled}
                  @input=${(e: Event) => {
                    this.query = (e.target as HTMLInputElement).value;
                  }}
              /></label>
              <div class="options" role="group" aria-label="Available tags">
                ${options.map((tag) => html`<label class="check"><input type="checkbox" .checked=${this.selected.includes(tag.id)} ?disabled=${this.disabled} @change=${(e: Event) => this.toggle(tag.id, (e.target as HTMLInputElement).checked)} />${tag.color && /^#[0-9a-f]{6}$/i.test(tag.color) ? html`<span class="swatch" aria-hidden="true" style=${`background:${tag.color}`}></span>` : nothing}<span class="name">${tag.name}</span></label>`)}
              </div>
              <p class="help" role="status">
                ${options.length ? '' : 'No matching tags.'}
              </p>`
          : html`<p class="help">
              No active tags available. Tags are optional.
            </p>`
      }
    `;
  }
}
customElements.define('activity-tag-picker', ActivityTagPicker);
