import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import {
  TagListQuerySchema,
  type Tag,
  type CreateTagRequest,
  type UpdateTagRequest,
} from '@activus/contracts';
import {
  configurationApi,
  ClientError,
  clientMessage,
  type TagApi,
} from '../../services/configuration-api.js';
import { navigate } from '../../routes/navigation.js';
import { trapDialogFocus } from '../../components/dialog-focus.js';
import { managementStyles } from '../activity-kinds/styles.js';
import { TagForm } from './form.js';

type Editor =
  { action: 'edit'; tag?: Tag } | { action: 'archive' | 'restore'; tag: Tag };
export class TagsPage extends LitElement {
  static override properties = {
    route: { type: String },
    api: { attribute: false },
    tags: { state: true },
    query: { state: true },
    loading: { state: true },
    pending: { state: true },
    error: { state: true },
    editor: { state: true },
    busy: { state: true },
    mutationError: { state: true },
    status: { state: true },
    hasArchived: { state: true },
  };
  route = location.pathname + location.search;
  api: TagApi = configurationApi;
  private tags: Tag[] = [];
  private query = '';
  private loading = true;
  private pending = false;
  private error: unknown;
  private editor: Editor | undefined;
  private busy = false;
  private mutationError: unknown;
  private status = '';
  private hasArchived: boolean | undefined;
  private controller: AbortController | undefined;
  private mutation: AbortController | undefined;
  private generation = 0;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private opener: HTMLElement | undefined;
  private get url() {
    return new URL(this.route, location.origin);
  }
  private get archived() {
    return this.url.searchParams.get('archived') === 'true';
  }
  private get search() {
    return this.url.searchParams.get('search')?.trim() ?? '';
  }
  static override styles = [
    managementStyles,
    css`
      :host {
        max-width: 960px;
        margin: 0 auto;
      }
      .back {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        margin-bottom: var(--space-5);
        text-decoration: none;
      }
      .back:hover {
        text-decoration: underline;
      }
      header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--space-5);
        margin-bottom: var(--space-6);
      }
      .intro {
        flex: 1;
        min-width: 240px;
      }
      .intro p {
        max-width: 66ch;
        margin-top: var(--space-3);
      }
      .filters {
        display: flex;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: var(--space-4);
        margin-bottom: var(--space-5);
      }
      .search {
        flex: 1;
        min-width: 220px;
      }
      .search-controls {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .search-controls input {
        min-width: 0;
      }
      .search-controls button {
        flex-shrink: 0;
      }
      .status {
        min-height: 1.5em;
        margin: var(--space-3) 0;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
        border-top: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-4);
        border-bottom: 1px solid var(--color-border);
      }
      .row:last-child {
        border-bottom: 0;
      }
      .name {
        min-width: 0;
        flex: 1;
        overflow-wrap: anywhere;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .name strong {
        font-weight: 600;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .archived {
        background: var(--color-surface-subtle);
      }
      .archived strong {
        color: var(--color-text-muted);
      }
      details {
        position: relative;
        flex-shrink: 0;
      }
      summary {
        width: 44px;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        border-radius: var(--radius-md);
        list-style: none;
      }
      summary::-webkit-details-marker {
        display: none;
      }
      details[open] summary {
        background: var(--color-primary-soft);
      }
      .menu {
        position: absolute;
        right: 0;
        top: 44px;
        z-index: 2;
        display: grid;
        width: 170px;
        padding: var(--space-2);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-md);
      }
      .menu button {
        border: 0;
        justify-content: flex-start;
      }
      .empty {
        border-top: 1px solid var(--color-border);
        padding: var(--space-7) var(--space-5);
        text-align: center;
        display: grid;
        justify-items: center;
        gap: var(--space-4);
      }
      .empty p {
        max-width: 55ch;
      }
      .archived-note {
        margin-top: var(--space-4);
      }
      .read-error {
        display: grid;
        justify-items: start;
        gap: var(--space-3);
        margin-bottom: var(--space-5);
      }
      dialog {
        width: min(560px, calc(100% - 32px));
        max-height: calc(100dvh - 48px);
        overflow-y: auto;
        margin: auto;
        padding: var(--space-6);
        color: var(--color-text);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
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
      .confirmation .actions {
        justify-content: flex-end;
      }
      h1:focus-visible {
        outline: 3px solid var(--color-focus);
        outline-offset: 3px;
      }
      @media (max-width: 600px) {
        .intro {
          flex-basis: 100%;
          min-width: 0;
        }
        header > button {
          width: 100%;
        }
        .search {
          flex-basis: 100%;
          min-width: 0;
        }
        .row {
          padding: var(--space-3);
        }
        .empty {
          padding: var(--space-6) var(--space-3);
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
    if (changed.has('route') || changed.has('api')) {
      clearTimeout(this.debounce);
      this.pending = false;
      this.query = this.search;
      this.mutation?.abort();
      this.busy = false;
      this.close(false);
      this.status = '';
      void this.load();
    }
  }
  private beforeRoute = (event: Event) => {
    if (
      this.renderRoot.querySelector<TagForm>('tag-form')?.dirty &&
      !window.confirm('Discard your unsaved tag changes and leave this view?')
    )
      event.preventDefault();
  };
  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.renderRoot.querySelector<TagForm>('tag-form')?.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('before-route-change', this.beforeRoute);
    window.addEventListener('beforeunload', this.beforeUnload);
  }
  override disconnectedCallback() {
    clearTimeout(this.debounce);
    this.controller?.abort();
    this.mutation?.abort();
    this.generation++;
    window.removeEventListener('before-route-change', this.beforeRoute);
    window.removeEventListener('beforeunload', this.beforeUnload);
    super.disconnectedCallback();
  }
  async load() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;
    this.loading = true;
    this.error = undefined;
    this.hasArchived = undefined;
    try {
      const parsed = TagListQuerySchema.safeParse({
        includeArchived: String(this.archived),
        ...(this.search ? { search: this.search } : {}),
      });
      if (!parsed.success) throw new ClientError('validation', 'TAG_INVALID');
      const result = await this.api.listTags(
        this.archived,
        this.search || undefined,
        controller.signal,
      );
      if (generation !== this.generation) return;
      this.tags = result.items;
      if (!this.archived && !this.search && !result.items.length) {
        // Only the empty active collection needs this single additional read to
        // distinguish a first installation from a collection of archived tags.
        const all = await this.api.listTags(true, undefined, controller.signal);
        if (generation !== this.generation) return;
        this.hasArchived = all.items.some((tag) => tag.isArchived);
      }
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted)
        this.error = error;
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }
  private searchInput(event: Event) {
    this.query = (event.target as HTMLInputElement).value;
    clearTimeout(this.debounce);
    this.controller?.abort();
    this.generation++;
    this.loading = false;
    this.pending = true;
    this.debounce = setTimeout(
      () => this.filters(this.query, this.archived),
      300,
    );
  }
  private filters(search: string, archived: boolean) {
    clearTimeout(this.debounce);
    this.pending = false;
    const url = this.url;
    const term = search.trim();
    if (term) url.searchParams.set('search', term);
    else url.searchParams.delete('search');
    if (archived) url.searchParams.set('archived', 'true');
    else url.searchParams.delete('archived');
    if (url.pathname + url.search === this.route) {
      this.query = term;
      if (!this.controller || this.controller.signal.aborted) void this.load();
    } else navigate(url.pathname + url.search);
  }
  private clearSearch() {
    this.query = '';
    this.filters('', this.archived);
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLInputElement>('#search')?.focus(),
    );
  }
  private async open(editor: Editor, event: Event) {
    clearTimeout(this.debounce);
    this.pending = false;
    this.query = this.search;
    const target = event.currentTarget as HTMLElement;
    this.opener = target.closest('details')?.querySelector('summary') ?? target;
    this.renderRoot
      .querySelectorAll('details')
      .forEach((d) => (d.open = false));
    this.editor = editor;
    this.mutationError = undefined;
    await this.updateComplete;
    this.renderRoot.querySelector('dialog')?.showModal();
    const form = this.renderRoot.querySelector<TagForm>('tag-form');
    if (form) {
      await form.updateComplete;
      form.shadowRoot?.querySelector<HTMLInputElement>('#name')?.focus();
    } else
      this.renderRoot
        .querySelector<HTMLButtonElement>('dialog button')
        ?.focus();
  }
  private close(restore = true) {
    this.renderRoot.querySelector('dialog')?.close();
    this.editor = undefined;
    this.mutationError = undefined;
    if (restore)
      (this.opener?.isConnected
        ? this.opener
        : this.renderRoot.querySelector<HTMLElement>('h1')
      )?.focus();
  }
  private dismiss() {
    if (this.busy) return;
    const form = this.renderRoot.querySelector<TagForm>('tag-form');
    if (form) form.requestDismiss();
    else this.close();
  }
  private async run(
    action: (signal: AbortSignal) => Promise<Tag>,
    verb: string,
  ) {
    if (this.busy) return;
    const controller = new AbortController();
    this.mutation = controller;
    this.busy = true;
    this.mutationError = undefined;
    try {
      const tag = await action(controller.signal);
      if (!this.isConnected || controller.signal.aborted) return;
      this.close();
      this.status = `Tag “${tag.name}” ${verb}.`;
      await this.load();
      await this.updateComplete;
      if (!controller.signal.aborted && !this.opener?.isConnected)
        this.renderRoot.querySelector<HTMLElement>('h1')?.focus();
    } catch (error) {
      if (!controller.signal.aborted && this.isConnected)
        this.mutationError = error;
    } finally {
      if (this.mutation === controller) this.busy = false;
    }
  }
  private save(event: CustomEvent<CreateTagRequest>) {
    const tag = this.editor?.action === 'edit' ? this.editor.tag : undefined;
    const patch: UpdateTagRequest = tag
      ? {
          ...(event.detail.name !== tag.name
            ? { name: event.detail.name }
            : {}),
          ...(event.detail.color !== tag.color
            ? { color: event.detail.color }
            : {}),
        }
      : event.detail;
    if (tag && !Object.keys(patch).length) {
      this.close();
      return;
    }
    void this.run(
      (signal) =>
        tag
          ? this.api.updateTag(tag.id, patch, signal)
          : this.api.createTag(event.detail, signal),
      tag ? 'updated' : 'created',
    );
  }
  private confirm() {
    const editor = this.editor;
    if (!editor || editor.action === 'edit') return;
    void this.run(
      (signal) =>
        editor.action === 'archive'
          ? this.api.archiveTag(editor.tag.id, signal)
          : this.api.restoreTag(editor.tag.id, signal),
      editor.action === 'archive' ? 'archived' : 'restored',
    );
  }
  private errorBox(error: unknown) {
    return html`<div class="error-box" role="alert">
      ${clientMessage(error)}${error instanceof ClientError && error.requestId ? html`<small>Request ID: ${error.requestId}</small>` : nothing}
    </div>`;
  }
  private empty() {
    if (this.search)
      return html`<div class="empty">
        <h2>No matching tags</h2>
        <p class="muted">
          No tags match
          “${this.search}”${this.archived ? '.' : ' among active tags.'}
        </p>
        <button @click=${this.clearSearch}>Clear search</button>
      </div>`;
    if (this.archived)
      return html`<div class="empty">
        <h2>No archived tags</h2>
        <p class="muted">Your active tag list is also empty.</p>
        <button @click=${() => this.filters('', false)}>
          Show active tags
        </button>
      </div>`;
    if (this.hasArchived)
      return html`<div class="empty">
        <h2>No active tags</h2>
        <p class="muted">
          Your tags are archived. Include archived tags to restore one.
        </p>
        <button @click=${() => this.filters('', true)}>
          Include archived tags
        </button>
      </div>`;
    return html`<div class="empty">
      <h2>No tags yet</h2>
      <p class="muted">
        Create a reusable label for personal context across your activities.
      </p>
      <button
        class="primary"
        @click=${(e: Event) => this.open({ action: 'edit' }, e)}
      >
        Create your first tag
      </button>
    </div>`;
  }
  private renderEditor() {
    const editor = this.editor;
    if (!editor) return nothing;
    return html`<dialog
      aria-labelledby="tag-editor-title"
      @keydown=${trapDialogFocus}
      @cancel=${(e: Event) => {
        e.preventDefault();
        this.dismiss();
      }}
      @dismiss-tag=${() => this.close()}
    >
      <h2 id="tag-editor-title">
        ${editor.action === 'edit' ? (editor.tag ? 'Edit tag' : 'New tag') : editor.action === 'archive' ? 'Archive tag?' : 'Restore tag?'}
      </h2>
      ${
        editor.action === 'edit'
          ? html`<tag-form
              .tag=${editor.tag}
              .busy=${this.busy}
              .error=${this.mutationError}
              @save-tag=${this.save}
            ></tag-form>`
          : html`<div class="confirmation">
              <strong>${editor.tag.name}</strong>
              <p>
                ${editor.action === 'archive' ? 'Historical activities keep this tag. It will no longer be available for future assignment. You can restore it later.' : 'This tag will be available for future assignment again. Historical activities keep their existing association.'}
              </p>
              ${this.mutationError ? this.errorBox(this.mutationError) : nothing}
              <p class="help" role="status">
                ${this.busy ? 'Saving tag…' : ''}
              </p>
              <div class="actions">
                <button ?disabled=${this.busy} @click=${this.dismiss}>
                  Cancel</button
                ><button
                  class=${editor.action === 'archive' ? 'primary' : ''}
                  ?disabled=${this.busy}
                  @click=${this.confirm}
                >
                  ${editor.action === 'archive' ? 'Archive tag' : 'Restore tag'}
                </button>
              </div>
            </div>`
      }
    </dialog>`;
  }
  override render() {
    return html`<a class="back" href="/settings">← Settings</a>
      <header>
        <div class="intro">
          <h1 tabindex="-1">Tags</h1>
          <p class="muted">
            Tags add optional context across your activities. Use a variant for
            a structured form such as Outdoor or Treadmill.
          </p>
        </div>
        <button
          class="primary"
          @click=${(e: Event) => this.open({ action: 'edit' }, e)}
        >
          New tag
        </button>
      </header>
      <div class="filters">
        <div class="field search">
          <label for="search">Search tags</label>
          <div class="search-controls">
            <input
              id="search"
              type="search"
              maxlength=${TagListQuerySchema.shape.search.unwrap().maxLength!}
              .value=${this.query}
              @input=${this.searchInput}
            />${this.query ? html`<button @click=${this.clearSearch}>Clear search</button>` : nothing}
          </div>
        </div>
        <label class="check"
          ><input
            type="checkbox"
            .checked=${this.archived}
            @change=${(e: Event) => this.filters(this.query, (e.target as HTMLInputElement).checked)}
          />Include archived tags</label
        >
      </div>
      <p class="help status" role="status">
        ${this.loading || this.pending ? (this.tags.length ? 'Updating tags…' : 'Loading tags…') : this.status || (!this.error ? `${this.tags.length} ${this.tags.length === 1 ? 'tag' : 'tags'} shown.` : '')}
      </p>
      ${this.error ? html`<div class="read-error">${this.errorBox(this.error)}<button @click=${() => void this.load()}>Retry tags</button>${this.tags.length ? html`<p class="help">Showing the last loaded tags until the list can be refreshed.</p>` : nothing}</div>` : nothing}
      <div aria-busy=${this.loading || this.pending}>
        ${
          this.tags.length
            ? html`<ul aria-label="Tags">
                ${repeat(
                  this.tags,
                  (t) => t.id,
                  (t) =>
                    html`<li class=${`row ${t.isArchived ? 'archived' : ''}`}>
                      ${t.color ? html`<span class="swatch" style=${`background:${t.color}`} role="img" aria-label=${`Colour ${t.color}`}></span>` : nothing}
                      <div class="name">
                        <strong>${t.name}</strong
                        >${t.isArchived ? html`<span class="badge">Archived</span>` : nothing}
                      </div>
                      <details>
                        <summary aria-label=${`Actions for ${t.name}`}>
                          •••
                        </summary>
                        <div class="menu">
                          <button
                            @click=${(e: Event) => this.open({ action: 'edit', tag: t }, e)}
                          >
                            Edit tag</button
                          ><button
                            @click=${(e: Event) => this.open({ action: t.isArchived ? 'restore' : 'archive', tag: t }, e)}
                          >
                            ${t.isArchived ? 'Restore tag' : 'Archive tag'}
                          </button>
                        </div>
                      </details>
                    </li>`,
                )}
              </ul>`
            : !this.loading && !this.pending && !this.error
              ? this.empty()
              : nothing
        }
      </div>
      ${this.archived && this.tags.length > 0 && !this.search && !this.loading && !this.pending && !this.error && !this.tags.some((t) => t.isArchived) ? html`<p class="help archived-note">No archived tags.</p>` : nothing}
      ${this.renderEditor()}`;
  }
}
customElements.define('tags-page', TagsPage);
