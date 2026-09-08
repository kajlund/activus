import { LitElement, html, css, type PropertyValues } from 'lit';
import {
  ActivityListQuerySchema,
  type ActivityKind,
  type ActivityVariant,
  type Tag,
} from '@activus/contracts';
import {
  configurationApi,
  type ConfigurationApi,
} from '../../services/configuration-api.js';
import { localDate } from '../activities/values.js';
import { managementStyles } from '../activity-kinds/styles.js';
import { readError } from './presentation.js';
import type { Filters } from './state.js';

export class JournalFilters extends LitElement {
  static override properties = {
    filters: { attribute: false },
    kinds: { attribute: false },
    tags: { attribute: false },
    api: { attribute: false },
    draft: { state: true },
    variants: { state: true },
    loading: { state: true },
    error: { state: true },
    dateError: { state: true },
    query: { state: true },
  };
  filters: Filters = {};
  kinds: ActivityKind[] = [];
  tags: Tag[] = [];
  api: Pick<ConfigurationApi, 'listVariants'> = configurationApi;
  private draft: Filters = {};
  private variants: ActivityVariant[] = [];
  private loading = false;
  private error: unknown;
  private dateError = '';
  private query = '';
  private generation = 0;
  private controller: AbortController | undefined;
  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('filters')) {
      this.resetDraft();
    }
  }
  resetDraft() {
    this.draft = structuredClone(this.filters);
    this.query = '';
    this.dateError = '';
    void this.loadVariants();
  }
  override disconnectedCallback() {
    this.controller?.abort();
    this.generation++;
    super.disconnectedCallback();
  }
  private async loadVariants() {
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    const generation = ++this.generation;
    this.variants = [];
    this.error = undefined;
    this.loading = true;
    try {
      if (this.draft.activityKindId) {
        const result = await this.api.listVariants(
          this.draft.activityKindId,
          true,
          controller.signal,
        );
        if (generation === this.generation) this.variants = result.items;
      }
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted)
        this.error = error;
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }
  private preset(value: string) {
    const now = new Date();
    const from = new Date(now);
    const to = new Date(now);
    if (value === 'week') {
      from.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      to.setTime(from.getTime());
      to.setDate(from.getDate() + 6);
    } else if (value === 'month') {
      from.setDate(1);
      to.setMonth(now.getMonth() + 1, 0);
    } else if (value === 'year') {
      from.setMonth(0, 1);
      to.setMonth(11, 31);
    }
    this.draft = {
      ...this.draft,
      dateFrom: value === 'all' ? undefined : localDate(from),
      dateTo: value === 'all' ? undefined : localDate(to),
    };
    this.dateError = '';
  }
  private submit(event: Event) {
    event.preventDefault();
    if (this.loading || this.error) return;
    const raw = Object.fromEntries(
      Object.entries(this.draft)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v]),
    );
    if (!raw['tagIds']) delete raw['tagMatch'];
    const result = ActivityListQuerySchema.safeParse(raw);
    if (!result.success) {
      this.dateError = 'Use valid dates with the end on or after the start.';
      void this.updateComplete.then(() =>
        this.renderRoot.querySelector<HTMLInputElement>('#dateFrom')?.focus(),
      );
      return;
    }
    const filters: Filters = Object.fromEntries(
      Object.entries(result.data).filter(
        ([key]) => key !== 'limit' && key !== 'offset',
      ),
    );
    this.dispatchEvent(
      new CustomEvent<Filters>('apply-filters', {
        detail: filters,
        bubbles: true,
        composed: true,
      }),
    );
  }
  override render() {
    return html`<form novalidate @submit=${this.submit}>
      <fieldset>
        <legend>Date range</legend>
        <div class="presets">
          ${[
            ['all', 'All time'],
            ['week', 'This week'],
            ['month', 'This month'],
            ['year', 'This year'],
          ].map(
            ([key, label]) =>
              html`<button type="button" @click=${() => this.preset(key!)}>
                ${label}
              </button>`,
          )}
        </div>
        <p class="help">Or enter an inclusive custom range.</p>
        <div class="dates">
          ${(['dateFrom', 'dateTo'] as const).map(
            (key) =>
              html`<label class="field" for=${key}
                >${key === 'dateFrom' ? 'From date' : 'Through date'}<input
                  id=${key}
                  type="date"
                  .value=${this.draft[key] ?? ''}
                  aria-invalid=${this.dateError ? 'true' : 'false'}
                  aria-describedby="date-error"
                  @input=${(e: Event) => {
                    this.draft = {
                      ...this.draft,
                      [key]: (e.target as HTMLInputElement).value || undefined,
                    };
                    this.dateError = '';
                  }}
              /></label>`,
          )}
        </div>
        <p id="date-error" class="error">${this.dateError}</p>
      </fieldset>
      <label class="field"
        >Activity kind<select
          aria-label="Activity kind"
          .value=${this.draft.activityKindId ?? ''}
          @change=${(e: Event) => {
            this.draft = {
              ...this.draft,
              activityKindId:
                (e.target as HTMLSelectElement).value || undefined,
              activityVariantId: undefined,
            };
            void this.loadVariants();
          }}
        >
          <option value="">All activity kinds</option>
          ${this.kinds.map((k) => html`<option value=${k.id} .selected=${k.id === this.draft.activityKindId}>${k.name}${k.isArchived ? ' (archived)' : ''}</option>`)}
        </select></label
      >
      ${
        this.draft.activityKindId
          ? html`<label class="field"
              >Variant<select
                aria-label="Variant"
                ?disabled=${this.loading || !!this.error}
                .value=${this.draft.activityVariantId ?? ''}
                @change=${(e: Event) => {
                  this.draft = {
                    ...this.draft,
                    activityVariantId:
                      (e.target as HTMLSelectElement).value || undefined,
                  };
                }}
              >
                <option value="">All variants</option>
                ${this.variants.map((v) => html`<option value=${v.id} .selected=${v.id === this.draft.activityVariantId}>${v.name}${v.isArchived ? ' (archived)' : ''}</option>`)}
              </select></label
            >`
          : html`<p class="help">Choose a kind to narrow its variants.</p>`
      }
      <p class="help" role="status">
        ${this.loading ? 'Loading variants…' : ''}
      </p>
      ${this.error ? html`${readError(this.error)}<button type="button" @click=${() => this.loadVariants()}>Retry variants</button>` : ''}
      <fieldset>
        <legend>Tags</legend>
        <label class="field"
          >Match tags<select
            aria-label="Match tags"
            .value=${this.draft.tagMatch ?? 'any'}
            @change=${(e: Event) => {
              this.draft = {
                ...this.draft,
                tagMatch: (e.target as HTMLSelectElement).value as
                  'any' | 'all',
              };
            }}
          >
            <option value="any" .selected=${this.draft.tagMatch !== 'all'}>
              Any selected tag
            </option>
            <option value="all" .selected=${this.draft.tagMatch === 'all'}>
              All selected tags
            </option>
          </select></label
        ><label class="field"
          >Find a tag<input
            type="search"
            .value=${this.query}
            @input=${(e: Event) => {
              this.query = (e.target as HTMLInputElement).value;
            }}
        /></label>
        <div class="tag-options">
          ${this.tags
            .filter((t) =>
              t.name
                .toLocaleLowerCase()
                .includes(this.query.toLocaleLowerCase()),
            )
            .map(
              (t) =>
                html`<label class="check"
                  ><input
                    type="checkbox"
                    .checked=${this.draft.tagIds?.includes(t.id) ?? false}
                    @change=${(e: Event) => {
                      const ids = (e.target as HTMLInputElement).checked
                        ? [...new Set([...(this.draft.tagIds ?? []), t.id])]
                        : (this.draft.tagIds ?? []).filter((id) => id !== t.id);
                      this.draft = {
                        ...this.draft,
                        tagIds: ids.length ? ids : undefined,
                        tagMatch: ids.length
                          ? (this.draft.tagMatch ?? 'any')
                          : undefined,
                      };
                    }}
                  /><span
                    >${t.name}${t.isArchived ? ' (archived)' : ''}</span
                  ></label
                >`,
            )}
        </div>
        <p class="help">
          Archived references remain available for finding historical
          activities.
        </p>
      </fieldset>
      <div class="actions">
        <button
          type="submit"
          class="primary"
          ?disabled=${this.loading || !!this.error}
        >
          Apply filters</button
        ><button
          type="button"
          @click=${() => {
            this.draft = {};
            this.dateError = '';
            void this.loadVariants();
          }}
        >
          Reset filters</button
        ><button
          type="button"
          @click=${() => this.dispatchEvent(new CustomEvent('cancel-filters', { bubbles: true, composed: true }))}
        >
          Cancel
        </button>
      </div>
    </form>`;
  }
  static override styles = [
    managementStyles,
    css`
      form {
        display: grid;
        gap: var(--space-5);
      }
      fieldset {
        border: 0;
        margin: 0;
        padding: 0;
        min-width: 0;
        display: grid;
        gap: var(--space-3);
      }
      legend {
        font-weight: 600;
        margin-bottom: var(--space-3);
      }
      .dates {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-3);
      }
      .presets {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      select {
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
      select:focus-visible {
        outline: 3px solid var(--color-focus);
        outline-offset: 3px;
      }
      .tag-options {
        max-height: 200px;
        overflow-y: auto;
      }
      .check {
        padding: var(--space-2);
        overflow-wrap: anywhere;
      }
      @media (max-width: 480px) {
        .dates {
          grid-template-columns: 1fr;
        }
      }
    `,
  ];
}
customElements.define('journal-filters', JournalFilters);
