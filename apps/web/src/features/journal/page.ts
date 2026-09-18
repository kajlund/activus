import { LitElement, html, nothing, type PropertyValues } from 'lit';
import {
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  createElement,
} from 'lucide';
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
  type ActivityApi,
  type ActivityGoalsApi,
  type ConfigurationApi,
  type TagApi,
} from '../../services/configuration-api.js';
import { navigate } from '../../routes/navigation.js';
import { activityIcon } from '../activity-kinds/icons.js';
import { journalPageStyles } from './page-styles.js';
import './entry-details.js';
import { journalDate, startTime, duration } from './format.js';
import { referenceText, readError, measurementView } from './presentation.js';
import {
  journalPath,
  parseJournal,
  pageSize,
  withReturn,
  expandedReturn,
  expandedActivity,
  type Filters,
} from './state.js';
import { JournalFilters } from './filters.js';
import './delete-dialog.js';

export type JournalPageApi = JournalApi &
  Pick<ActivityApi, 'getActivity'> &
  Partial<ActivityGoalsApi> &
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
    expandedId: { state: true },
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
  private expandedId: string | undefined;
  private restoreFocus = false;
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
      const restored = expandedActivity(this.url.search);
      this.restoreFocus = !!restored;
      this.expandedId = restored ?? this.expandedId;
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
      let result = await this.api.listActivities(
        { ...this.filters, limit: pageSize, offset },
        controller.signal,
      );
      if (generation !== this.generation) return;
      // An edited or previously opened entry may be beyond the first page.
      // Read only as far as that entry while retaining server ordering.
      const previous = this.items.find((a) => a.id === this.expandedId);
      const f = this.filters;
      const matches =
        !previous ||
        ((!f.dateFrom || previous.activityDate >= f.dateFrom) &&
          (!f.dateTo || previous.activityDate <= f.dateTo) &&
          (!f.activityKindId || previous.kind.id === f.activityKindId) &&
          (!f.activityVariantId ||
            previous.variant?.id === f.activityVariantId) &&
          (!f.tagIds?.length ||
            (f.tagMatch === 'all'
              ? f.tagIds.every((id) => previous.tags.some((t) => t.id === id))
              : f.tagIds.some((id) =>
                  previous.tags.some((t) => t.id === id),
                ))));
      if (!more && this.expandedId && matches) {
        const retained = [...result.items];
        while (
          !retained.some((a) => a.id === this.expandedId) &&
          result.pagination.hasMore
        ) {
          result = await this.api.listActivities(
            {
              ...this.filters,
              limit: pageSize,
              offset: result.pagination.nextOffset!,
            },
            controller.signal,
          );
          if (generation !== this.generation) return;
          retained.push(...result.items);
        }
        result = { ...result, items: retained };
      }
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
      if (this.expandedId && !this.items.some((a) => a.id === this.expandedId))
        this.expandedId = undefined;
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
        if (this.restoreFocus && !this.error) {
          this.restoreFocus = false;
          await this.updateComplete;
          const toggle = this.renderRoot.querySelector<HTMLElement>(
            '#entry-' + this.expandedId,
          );
          toggle?.focus({ preventScroll: true });
          toggle?.scrollIntoView({ block: 'nearest' });
        }
        if (more) {
          await this.updateComplete;
          this.renderRoot.querySelector<HTMLElement>('#load-more')?.focus();
        }
      }
    }
  }
  private async openFilters() {
    if (this.filtersOpen) {
      this.closeFilters();
      return;
    }
    this.filtersOpen = true;
    await this.updateComplete;
    this.renderRoot
      .querySelector<JournalFilters>('journal-filters')
      ?.resetDraft();
    this.renderRoot.querySelector<HTMLElement>('#filters-title')?.focus();
  }
  private closeFilters() {
    const wasOpen = this.filtersOpen;
    this.filtersOpen = false;
    if (wasOpen)
      this.renderRoot.querySelector<HTMLElement>('#filter-button')?.focus();
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
    const index = this.items.findIndex((a) => a.id === this.deleting?.id);
    const neighbor = this.items[index + 1] ?? this.items[index - 1];
    this.read?.abort();
    this.read = new AbortController();
    this.generation++;
    this.loading = this.moreLoading = false;
    this.items = this.items.filter((a) => a.id !== this.deleting?.id);
    if (this.nextOffset !== null)
      this.nextOffset = Math.max(0, this.nextOffset - 1);
    this.deleting = undefined;
    this.expandedId = undefined;
    this.status = `Activity deleted. ${this.items.length} ${this.items.length === 1 ? 'activity' : 'activities'} shown.`;
    await this.updateComplete;
    this.renderRoot
      .querySelector<HTMLElement>(neighbor ? '#entry-' + neighbor.id : 'h1')
      ?.focus();
  }
  private row(a: ActivitySummary) {
    const open = this.expandedId === a.id;
    const title = a.name ?? a.variant?.name ?? a.kind.name;
    const identity = a.name
      ? referenceText(a)
      : a.variant
        ? a.kind.name +
          (a.kind.isArchived ? ' (archived)' : '') +
          (a.variant.isArchived ? ' · Archived variant' : '')
        : a.kind.isArchived
          ? 'Archived kind'
          : '';
    return html`<li class="row" data-expanded=${open}>
      <button
        class="row-toggle"
        id=${'entry-' + a.id}
        aria-expanded=${open}
        aria-controls=${'panel-' + a.id}
        @click=${() => {
          this.expandedId = open ? undefined : a.id;
        }}
      >
        <span class="kind-icon" style=${'--kind-color:' + a.kind.color}
          >${activityIcon(a.kind.iconName)}</span
        >
        <span class="identity">
          <span class="title">${title}</span>
          ${identity || a.isPartial ? html`<span class="metadata muted">${identity}${a.isPartial ? (identity ? ' · Partial record' : 'Partial record') : ''}</span>` : nothing}
        </span>
        <span class="facts">
          ${a.startedAt ? html`<time datetime=${a.startedAt}>${startTime(a.startedAt)}</time>` : nothing}
          ${a.durationSeconds !== null ? html`<span class="measure">${duration(a.durationSeconds)}</span>` : nothing}
          ${a.primaryMeasurement ? html`<span class="primary-measure"><span class="sr-only">${a.primaryMeasurement.name}: </span>${measurementView(a.primaryMeasurement)}</span>` : nothing}
        </span>
        <span class="chevron"
          >${createElement(open ? ChevronUp : ChevronDown, { width: '20', height: '20', 'aria-hidden': 'true' })}</span
        >
      </button>
      <div
        id=${'panel-' + a.id}
        role="region"
        aria-labelledby=${'entry-' + a.id}
        ?hidden=${!open}
      >
        ${
          open
            ? html`<journal-entry-details
                .activityId=${a.id}
                .api=${this.api}
                .context=${expandedReturn(this.context, a.id)}
                @request-delete=${(event: CustomEvent) => {
                  this.opener = event.detail.opener;
                  this.deleting = a;
                }}
              ></journal-entry-details>`
            : nothing
        }
      </div>
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
        <label class="kind-filter"
          ><span class="sr-only">Activity kind filter</span
          ><select
            aria-label="Activity kind filter"
            .value=${this.filters.activityKindId ?? ''}
            ?disabled=${this.referencesLoading || !!this.referenceError}
            @change=${(event: Event) => {
              const next = { ...this.filters };
              delete next.activityVariantId;
              const id = (event.target as HTMLSelectElement).value;
              if (id) next.activityKindId = id;
              else delete next.activityKindId;
              this.apply(next);
            }}
          >
            <option value="">All activity kinds</option>
            ${this.kinds.map((kind) => html`<option value=${kind.id} .selected=${kind.id === this.filters.activityKindId}>${kind.name}${kind.isArchived ? ' (archived)' : ''}</option>`)}
          </select></label
        >
        <button
          id="filter-button"
          aria-controls="filters-panel"
          aria-expanded=${this.filtersOpen}
          @click=${this.openFilters}
        >
          ${createElement(SlidersHorizontal, { width: '16', height: '16', 'aria-hidden': 'true' })}
          Filters${chips.length ? ` (${chips.length})` : ''}</button
        >${chips.length ? html`<button @click=${() => this.apply({})}>Clear all filters</button>` : nothing}
        <span class="result-count" role="status"
          >${this.loading ? (this.items.length ? 'Updating results…' : 'Loading activities…') : this.status}</span
        >
      </div>
      <section
        id="filters-panel"
        class="filters"
        role="region"
        aria-labelledby="filters-title"
        ?hidden=${!this.filtersOpen}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            this.closeFilters();
          }
        }}
      >
        <h2 id="filters-title" tabindex="-1">Filter journal</h2>
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
      </section>
      <div class="chips">
        ${chips.map((c) => html`<button aria-label=${`Remove filter: ${c.text}`} @click=${() => this.removeFilter(c.key, c.tagId)}>${c.text}<span aria-hidden="true">×</span></button>`)}
      </div>
      ${this.filters.tagIds?.length ? html`<p class="help">Matching ${this.filters.tagMatch ?? 'any'} selected tags.</p>` : nothing}
      ${parseJournal(this.url.search).normalized ? html`<p class="help">Unsupported or invalid URL filters were ignored. Apply filters to update the link.</p>` : nothing}
      ${saved && /^[0-9a-f-]{36}$/i.test(saved) ? html`<p role="status">Activity saved. Your filters remain in place. <a href=${withReturn(`/activities/${saved}`, this.context)}>View saved activity</a></p>` : this.url.searchParams.get('deleted') === '1' ? html`<p role="status">Activity deleted.</p>` : nothing}
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
  static override styles = journalPageStyles;
}
customElements.define('activity-journal-page', ActivityJournalPage);
