import { LitElement, html, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type {
  ActivityKind,
  ActivityVariant,
  ActivitySummary,
  Tag,
} from '@activus/contracts';
import {
  configurationApi,
  type JournalApi,
  type ConfigurationApi,
  type TagApi,
} from '../../services/configuration-api.js';
import { navigate } from '../../routes/navigation.js';
import { trapDialogFocus } from '../../components/dialog-focus.js';
import { activityIcon } from '../activity-kinds/icons.js';
import { journalStyles } from './styles.js';
import { journalDate, startTime, duration, measurementText } from './format.js';
import { tagsView, referenceText, readError } from './presentation.js';
import {
  journalPath,
  parseJournal,
  pageSize,
  withReturn,
  type Filters,
} from './state.js';
import { JournalFilters } from './filters.js';
import './delete-dialog.js';

export type JournalPageApi = JournalApi &
  Pick<ConfigurationApi, 'listKinds' | 'listVariants'> &
  Pick<TagApi, 'listTags'>;
export class ActivityJournalPage extends LitElement {
  static override properties = {
    route: { type: String },
    api: { attribute: false },
    items: { state: true },
    loading: { state: true },
    moreLoading: { state: true },
    error: { state: true },
    moreError: { state: true },
    referenceError: { state: true },
    kinds: { state: true },
    tags: { state: true },
    variants: { state: true },
    referencesLoading: { state: true },
    nextOffset: { state: true },
    deleting: { state: true },
    status: { state: true },
    filtersOpen: { state: true },
  };
  route = location.pathname + location.search;
  api: JournalPageApi = configurationApi;
  private items: ActivitySummary[] = [];
  private loading = true;
  private moreLoading = false;
  private error: unknown;
  private moreError: unknown;
  private referenceError: unknown;
  private kinds: ActivityKind[] = [];
  private tags: Tag[] = [];
  private variants: ActivityVariant[] = [];
  private referencesLoading = true;
  private nextOffset: number | null = null;
  private deleting: ActivitySummary | undefined;
  private status = '';
  private filtersOpen = false;
  private loaded = false;
  private generation = 0;
  private referenceGeneration = 0;
  private variantGeneration = 0;
  private read: AbortController | undefined;
  private references: AbortController | undefined;
  private variantRead: AbortController | undefined;
  private opener: HTMLElement | undefined;
  private get url() {
    return new URL(this.route, location.origin);
  }
  private cachedSearch = '';
  private cachedFilters: Filters = {};
  private get filters() {
    if (this.cachedSearch !== this.url.search) {
      this.cachedSearch = this.url.search;
      this.cachedFilters = parseJournal(this.cachedSearch).filters;
    }
    return this.cachedFilters;
  }
  private get context() {
    return journalPath(this.filters);
  }
  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('api')) void this.loadReferences();
    if (changed.has('route') || changed.has('api')) {
      this.closeFilters();
      this.deleting = undefined;
      void this.load();
      void this.loadVariantLabels();
    }
  }
  override disconnectedCallback() {
    this.read?.abort();
    this.references?.abort();
    this.variantRead?.abort();
    this.generation++;
    this.referenceGeneration++;
    this.variantGeneration++;
    super.disconnectedCallback();
  }
  async loadReferences() {
    this.references?.abort();
    const controller = (this.references = new AbortController());
    const generation = ++this.referenceGeneration;
    this.referencesLoading = true;
    this.referenceError = undefined;
    try {
      const [kinds, tags] = await Promise.all([
        this.api.listKinds(true, controller.signal),
        this.api.listTags(true, undefined, controller.signal),
      ]);
      if (generation !== this.referenceGeneration) return;
      this.kinds = kinds.items;
      this.tags = tags.items;
    } catch (error) {
      if (generation === this.referenceGeneration && !controller.signal.aborted)
        this.referenceError = error;
    } finally {
      if (generation === this.referenceGeneration)
        this.referencesLoading = false;
    }
  }
  private async loadVariantLabels() {
    this.variantRead?.abort();
    const controller = (this.variantRead = new AbortController());
    const generation = ++this.variantGeneration;
    this.variants = [];
    try {
      if (this.filters.activityKindId) {
        const result = await this.api.listVariants(
          this.filters.activityKindId,
          true,
          controller.signal,
        );
        if (generation === this.variantGeneration) this.variants = result.items;
      }
    } catch {
      /* The filter dialog provides an explicit variant read retry. */
    }
  }
  async load(more = false) {
    if (
      more &&
      (this.loading ||
        this.moreLoading ||
        !!this.error ||
        this.nextOffset === null)
    )
      return;
    if (!more) {
      this.read?.abort();
      this.read = new AbortController();
      this.generation++;
      this.loading = true;
      this.moreLoading = false;
      this.error = undefined;
      this.moreError = undefined;
      this.status = '';
    } else {
      this.moreLoading = true;
      this.moreError = undefined;
    }
    const controller = this.read!;
    const generation = this.generation;
    const offset = more ? this.nextOffset! : 0;
    try {
      const result = await this.api.listActivities(
        { ...this.filters, limit: pageSize, offset },
        controller.signal,
      );
      if (generation !== this.generation) return;
      this.items = [
        ...new Map(
          (more ? [...this.items, ...result.items] : result.items).map((a) => [
            a.id,
            a,
          ]),
        ).values(),
      ];
      this.nextOffset = result.pagination.hasMore
        ? result.pagination.nextOffset
        : null;
      this.loaded = true;
      this.status = `${this.items.length} ${this.items.length === 1 ? 'activity' : 'activities'} shown.`;
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted) {
        if (more) this.moreError = error;
        else this.error = error;
      }
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.moreLoading = false;
        if (more) {
          await this.updateComplete;
          this.renderRoot.querySelector<HTMLElement>('#load-more')?.focus();
        }
      }
    }
  }
  private async openFilters(event: Event) {
    this.opener = event.currentTarget as HTMLElement;
    this.filtersOpen = true;
    await this.updateComplete;
    this.renderRoot
      .querySelector<JournalFilters>('journal-filters')
      ?.resetDraft();
    this.renderRoot
      .querySelector<HTMLDialogElement>('dialog.filters')
      ?.showModal();
  }
  private closeFilters() {
    this.filtersOpen = false;
    this.renderRoot.querySelector<HTMLDialogElement>('dialog.filters')?.close();
    this.opener?.focus();
  }
  private apply(filters: Filters) {
    this.closeFilters();
    const path = journalPath(filters);
    if (path === this.context) void this.load();
    else navigate(path);
  }
  private removeFilter(key: keyof Filters, tagId?: string) {
    const next = { ...this.filters };
    delete next[key];
    if (key === 'activityKindId') delete next.activityVariantId;
    if (key === 'tagIds') {
      const remaining = this.filters.tagIds?.filter((id) => id !== tagId);
      if (remaining?.length) next.tagIds = remaining;
      else delete next.tagMatch;
    }
    this.apply(next);
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLElement>('#filter-button')?.focus(),
    );
  }
  private chips() {
    const f = this.filters;
    const chips: { key: keyof Filters; text: string; tagId?: string }[] = [];
    if (f.dateFrom)
      chips.push({ key: 'dateFrom', text: `From ${journalDate(f.dateFrom)}` });
    if (f.dateTo)
      chips.push({ key: 'dateTo', text: `Through ${journalDate(f.dateTo)}` });
    if (f.activityKindId)
      chips.push({
        key: 'activityKindId',
        text:
          this.kinds.find((k) => k.id === f.activityKindId)?.name ??
          'Selected activity kind',
      });
    if (f.activityVariantId)
      chips.push({
        key: 'activityVariantId',
        text:
          this.variants.find((v) => v.id === f.activityVariantId)?.name ??
          'Selected variant',
      });
    for (const id of f.tagIds ?? [])
      chips.push({
        key: 'tagIds',
        tagId: id,
        text: this.tags.find((t) => t.id === id)?.name ?? 'Selected tag',
      });
    return chips;
  }
  private async deleted() {
    this.items = this.items.filter((a) => a.id !== this.deleting?.id);
    this.deleting = undefined;
    await this.load();
    this.status = 'Activity deleted.';
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLElement>('h1')?.focus();
  }
  private row(a: ActivitySummary) {
    const primary = a.primaryMeasurement
      ? measurementText(a.primaryMeasurement)
      : undefined;
    return html`<li class="row">
      <span class="kind-icon">${activityIcon(a.kind.iconName)}</span>
      <article class="identity">
        <a class="title" href=${withReturn(`/activities/${a.id}`, this.context)}
          >${a.name ?? a.kind.name}</a
        >
        <p class="metadata muted">
          ${referenceText(a)}${a.isPartial ? ' · Partial record' : ''}
        </p>
        <div class="facts">
          ${a.startedAt ? html`<time datetime=${a.startedAt}>${startTime(a.startedAt)}</time>` : nothing}${a.durationSeconds !== null ? html`<span class="measure">${duration(a.durationSeconds)}</span>` : nothing}${primary && a.primaryMeasurement ? html`<span><span class="muted">${a.primaryMeasurement.name}${a.primaryMeasurement.isArchived ? ' (archived)' : ''}:</span> <span class="measure" aria-label=${primary.label}>${primary.text}</span></span>` : nothing}${a.hasNotes ? html`<span class="muted">Notes recorded</span>` : nothing}
        </div>
        ${tagsView(a.tags)}
      </article>
      <details>
        <summary
          aria-label=${`Actions for ${a.name ?? a.kind.name} on ${journalDate(a.activityDate)}`}
        >
          Actions
        </summary>
        <div class="menu">
          <a
            class="button"
            href=${withReturn(`/activities/${a.id}/edit`, this.context)}
            >Edit activity</a
          ><button
            @click=${(e: Event) => {
              this.opener = (e.currentTarget as HTMLElement)
                .closest('details')!
                .querySelector('summary')!;
              this.deleting = a;
            }}
          >
            Delete activity
          </button>
        </div>
      </details>
    </li>`;
  }
  override render() {
    const groups = new Map<string, ActivitySummary[]>();
    for (const a of this.items)
      groups.set(a.activityDate, [...(groups.get(a.activityDate) ?? []), a]);
    const chips = this.chips();
    const saved = this.url.searchParams.get('saved');
    return html`<header>
        <div>
          <h1 tabindex="-1">Journal</h1>
          <p class="muted">A chronological record of your activities.</p>
        </div>
        <a
          class="button primary"
          href=${withReturn('/activities/new', this.context)}
          >New activity</a
        >
      </header>
      <div class="toolbar">
        <button
          id="filter-button"
          aria-haspopup="dialog"
          aria-expanded=${this.filtersOpen}
          @click=${this.openFilters}
        >
          Filters${chips.length ? ` (${chips.length})` : ''}</button
        >${chips.length ? html`<button @click=${() => this.apply({})}>Clear all filters</button>` : nothing}
      </div>
      <div class="chips">
        ${chips.map((c) => html`<button aria-label=${`Remove filter: ${c.text}`} @click=${() => this.removeFilter(c.key, c.tagId)}>${c.text}<span aria-hidden="true">×</span></button>`)}
      </div>
      ${this.filters.tagIds?.length ? html`<p class="help">Matching ${this.filters.tagMatch ?? 'any'} selected tags.</p>` : nothing}
      ${parseJournal(this.url.search).normalized ? html`<p class="help">Unsupported or invalid URL filters were ignored. Apply filters to update the link.</p>` : nothing}
      ${saved && /^[0-9a-f-]{36}$/i.test(saved) ? html`<p role="status">Activity saved. Your filters remain in place. <a href=${withReturn(`/activities/${saved}`, this.context)}>View saved activity</a></p>` : this.url.searchParams.get('deleted') === '1' ? html`<p role="status">Activity deleted.</p>` : nothing}
      <p role="status" class="status">
        ${this.loading ? (this.items.length ? 'Updating results; showing previous activities until the new results arrive.' : 'Loading activities…') : this.status}
      </p>
      ${this.error ? html`${readError(this.error)}${this.items.length ? html`<p class="help">Showing previously loaded activities. These may not match the current filters.</p>` : nothing}<button @click=${() => this.load()}>Retry activities</button>` : nothing}
      ${[...groups].map(
        ([date, items]) =>
          html`<section class="group" aria-label=${journalDate(date)}>
            <h2><time datetime=${date}>${journalDate(date)}</time></h2>
            <ul>
              ${repeat(
                items,
                (a) => a.id,
                (a) => this.row(a),
              )}
            </ul>
          </section>`,
      )}
      ${
        !this.loading && !this.error && !this.items.length
          ? html`<div class="empty">
              <h2>
                ${chips.length ? 'No activities match these filters' : 'No activities recorded yet'}
              </h2>
              <p class="muted">
                ${chips.length ? 'Adjust your filters or clear them to browse your journal.' : 'Record your first activity to begin your journal.'}
              </p>
              ${chips.length ? html`<button @click=${() => this.apply({})}>Clear filters</button>` : html`<a class="button primary" href=${withReturn('/activities/new', this.context)}>Record your first activity</a>`}
            </div>`
          : nothing
      }
      ${this.loaded && this.items.length ? html`<div class="paging">${this.moreError ? readError(this.moreError) : nothing}<button id="load-more" ?disabled=${this.loading || this.moreLoading || !!this.error} aria-disabled=${this.nextOffset === null} @click=${() => this.load(true)}>${this.moreLoading ? 'Loading more…' : this.moreError ? 'Retry loading more' : this.nextOffset === null ? 'All activities loaded' : 'Load more'}</button><span role="status" class="help">${this.moreLoading ? 'Loading the next page. Current activities remain visible.' : ''}</span></div>` : nothing}
      <dialog
        class="filters"
        aria-labelledby="filters-title"
        @keydown=${trapDialogFocus}
        @cancel=${(e: Event) => {
          e.preventDefault();
          this.closeFilters();
        }}
      >
        <h2 id="filters-title">Filter journal</h2>
        ${
          this.referencesLoading
            ? html`<p role="status">Loading filter options…</p>
                <button @click=${this.closeFilters}>Close filters</button>`
            : this.referenceError
              ? html`${readError(this.referenceError)}<button
                    @click=${() => this.loadReferences()}
                  >
                    Retry filter options</button
                  ><button @click=${this.closeFilters}>Close filters</button>`
              : html`<journal-filters
                  .filters=${this.filters}
                  .kinds=${this.kinds}
                  .tags=${this.tags}
                  .api=${this.api}
                  @apply-filters=${(e: CustomEvent<Filters>) => this.apply(e.detail)}
                  @cancel-filters=${this.closeFilters}
                ></journal-filters>`
        }
      </dialog>
      ${
        this.deleting
          ? html`<activity-delete-dialog
              .activity=${this.deleting}
              .api=${this.api}
              @delete-cancel=${() => {
                this.deleting = undefined;
                this.opener?.focus();
              }}
              @activity-deleted=${() => this.deleted()}
            ></activity-delete-dialog>`
          : nothing
      }`;
  }
  static override styles = journalStyles;
}
customElements.define('activity-journal-page', ActivityJournalPage);
