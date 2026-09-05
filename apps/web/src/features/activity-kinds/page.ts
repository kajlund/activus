import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { ActivityKindSchema, type ActivityKind, type ActivityVariant, type CreateActivityKindRequest, type CreateActivityVariantRequest } from '@activus/contracts';
import { configurationApi, ClientError, clientMessage, type ConfigurationApi } from '../../services/configuration-api.js';
import { navigate } from '../../routes/navigation.js';
import { managementStyles } from './styles.js';
import { activityIcon } from './icons.js';
import './kind-form.js';
import './variant-form.js';
type Editor = { type: 'kind'; value?: ActivityKind } | { type: 'variant'; value?: ActivityVariant } | { type: 'confirm'; target: 'kind' | 'variant'; action: 'archive' | 'restore'; value: ActivityKind | ActivityVariant };
export class ActivityKindsPage extends LitElement {
  static override properties = { route: { type: String }, api: { attribute: false }, kinds: { state: true }, kind: { state: true }, variants: { state: true }, loading: { state: true }, error: { state: true }, variantError: { state: true }, editor: { state: true }, busy: { state: true }, mutationError: { state: true }, status: { state: true } };
  route = window.location.pathname + window.location.search;
  api: ConfigurationApi = configurationApi;
  private kinds: ActivityKind[] = []; private kind: ActivityKind | undefined; private variants: ActivityVariant[] = [];
  private loading = true; private error: unknown; private variantError: unknown;
  private editor: Editor | undefined; private busy = false; private mutationError: unknown; private status = '';
  private loadController: AbortController | undefined; private mutationController: AbortController | undefined; private generation = 0; private loadedPath = ''; private opener: HTMLElement | undefined;
  private get url() { return new URL(this.route, window.location.origin); }
  private get archived() { return this.url.searchParams.get('archived') === 'true'; }
  private get archivedVariants() { return this.url.searchParams.get('variantsArchived') === 'true'; }
  private get listUrl() { return '/activity-kinds' + (this.archived ? '?archived=true' : ''); }
  private kindUrl(id: string) { return `/activity-kinds/${id}` + (this.archived ? '?archived=true' : ''); }
  static override styles = [managementStyles, css`
    :host { max-width:1040px; margin:0 auto; } .heading { display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:var(--space-5); margin-bottom:var(--space-6); } .heading-copy { flex:1; min-width:0; } .heading p { margin-top:var(--space-2); max-width:62ch; }
    .toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:var(--space-3); padding-bottom:var(--space-3); } .list { list-style:none; padding:0; margin:0; border-top:1px solid var(--color-border); background:var(--color-surface); border-radius:var(--radius-md); }
    .row { display:flex; align-items:center; gap:var(--space-3); padding:var(--space-4); min-width:0; border-bottom:1px solid var(--color-border); } .row:last-child { border-bottom:0; } .row.archived { background:var(--color-surface-subtle); } .row.archived .row-name { color:var(--color-text-muted); }
    .row-link { display:flex; align-items:center; gap:var(--space-4); flex:1; min-width:0; text-decoration:none; color:var(--color-text); min-height:44px; } .row-link:hover .row-name { text-decoration:underline; } .row-name { font-weight:600; overflow-wrap:anywhere; min-width:0; } .row-copy { flex:1; min-width:0; display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-2); }
    .kind-symbol { display:flex; align-items:center; justify-content:center; background:var(--color-primary-soft); color:var(--color-primary); border-radius:var(--radius-md); width:44px; height:44px; flex-shrink:0; } .chevron { font-size:24px; color:var(--color-text-muted); }
    .more { position:relative; flex-shrink:0; } .more summary { display:flex; align-items:center; justify-content:center; width:44px; height:44px; cursor:pointer; list-style:none; border-radius:var(--radius-md); } .more summary::-webkit-details-marker { display:none; } .more[open] summary { background:var(--color-primary-soft); } .menu { position:absolute; right:0; top:46px; width:180px; z-index:3; display:grid; gap:var(--space-1); padding:var(--space-2); background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-md); box-shadow:var(--shadow-md); } .menu button { justify-content:flex-start; border:0; }
    .empty { padding:var(--space-7) var(--space-5); text-align:center; border-top:1px solid var(--color-border); } .empty p { max-width:52ch; margin:var(--space-2) auto var(--space-5); } .back { display:inline-flex; align-items:center; gap:var(--space-2); min-height:44px; margin-bottom:var(--space-5); text-decoration:none; } .back:hover { text-decoration:underline; }
    .detail-title { display:flex; align-items:center; gap:var(--space-3); min-width:0; margin-bottom:var(--space-3); } section { margin-top:var(--space-7); } .notice { padding:var(--space-4); background:var(--color-primary-soft); border-radius:var(--radius-md); } .status { color:var(--color-text-muted); margin:var(--space-3) 0; } .not-found { padding:var(--space-6) 0; display:grid; gap:var(--space-4); }
    dialog { padding:var(--space-6); width:min(600px,calc(100% - 32px)); max-height:calc(100dvh - 48px); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-surface); color:var(--color-text); box-shadow:var(--shadow-md); overflow-y:auto; } dialog::backdrop { background:rgb(23 18 28 / .5); } dialog h2 { margin-bottom:var(--space-5); overflow-wrap:anywhere; } .confirmation { display:grid; gap:var(--space-5); } .confirmation .actions { justify-content:flex-end; }
    @media(max-width:600px) { .heading { gap:var(--space-4); } .row { padding:var(--space-3); gap:var(--space-2); } .row-link { gap:var(--space-3); } .empty { padding:var(--space-6) var(--space-3); } dialog { width:100%; max-width:100%; height:100dvh; max-height:100dvh; margin:0; border:0; border-radius:0; padding:var(--space-5); } .heading > .primary { width:100%; } }
  `];
  protected override willUpdate(changed: PropertyValues) { if (changed.has('route') || changed.has('api')) { this.mutationController?.abort(); this.busy = false; this.closeEditor(false); this.status = ''; void this.load(); } }
  override disconnectedCallback() { this.loadController?.abort(); this.mutationController?.abort(); this.generation++; super.disconnectedCallback(); }
  async load() {
    this.loadController?.abort(); const controller = new AbortController(); this.loadController = controller; const generation = ++this.generation;
    const path = this.url.pathname.replace(/\/$/, '');
    if (path !== this.loadedPath) { this.kinds = []; this.kind = undefined; this.variants = []; } this.loadedPath = path;
    this.loading = true; this.error = undefined; this.variantError = undefined;
    try {
      if (path === '/activity-kinds') { const result = await this.api.listKinds(this.archived, controller.signal); if (generation === this.generation) this.kinds = result.items; }
      else {
        const match = /^\/activity-kinds\/([^/]+)$/.exec(path); const id = match?.[1];
        if (!id || !ActivityKindSchema.shape.id.safeParse(id).success) throw new ClientError('not-found', 'INVALID_KIND_ID');
        const [kind, variants] = await Promise.allSettled([this.api.getKind(id, controller.signal), this.api.listVariants(id, this.archivedVariants, controller.signal)]);
        if (generation !== this.generation) return;
        if (kind.status === 'rejected') throw kind.reason;
        this.kind = kind.value;
        if (variants.status === 'fulfilled') this.variants = variants.value.items; else this.variantError = variants.reason;
      }
    } catch (error) { if (generation === this.generation && !controller.signal.aborted) this.error = error; }
    finally { if (generation === this.generation) this.loading = false; }
  }
  private toggle(parameter: string, event: Event) { const url = this.url; if ((event.target as HTMLInputElement).checked) url.searchParams.set(parameter, 'true'); else url.searchParams.delete(parameter); navigate(url.pathname + url.search); }
  private async openEditor(editor: Editor, event: Event) {
    const target = event.currentTarget as HTMLElement; this.opener = target.closest('details')?.querySelector('summary') ?? target;
    for (const details of this.renderRoot.querySelectorAll('details')) details.open = false;
    this.editor = editor; this.mutationError = undefined; await this.updateComplete;
    const dialog = this.renderRoot.querySelector('dialog'); dialog?.showModal();
    const form = this.renderRoot.querySelector<LitElement>('kind-form,variant-form'); if (form) { await form.updateComplete; form.shadowRoot?.querySelector<HTMLInputElement>('input')?.focus(); } else dialog?.querySelector<HTMLButtonElement>('button')?.focus();
  }
  private closeEditor(restore = true) {
    this.renderRoot.querySelector('dialog')?.close(); this.editor = undefined; this.mutationError = undefined;
    if (restore) { if (this.opener?.isConnected) this.opener.focus(); else this.renderRoot.querySelector<HTMLElement>('h1')?.focus(); }
  }
  private async mutate(action: (signal: AbortSignal) => Promise<unknown>, feedback = '') {
    if (this.busy) return; this.busy = true; this.mutationError = undefined; const route = this.route;
    const controller = new AbortController(); this.mutationController = controller;
    try { await action(controller.signal); if (!this.isConnected || this.route !== route) return; this.closeEditor(); this.status = feedback; await this.load(); await this.updateComplete; if (!this.opener?.isConnected) this.renderRoot.querySelector<HTMLElement>('h1')?.focus(); }
    catch (error) { if (this.isConnected && this.route === route && !controller.signal.aborted) this.mutationError = error; }
    finally { if (this.isConnected && this.mutationController === controller) this.busy = false; }
  }
  private saveKind(event: CustomEvent<CreateActivityKindRequest>) { const value = this.editor?.type === 'kind' ? this.editor.value : undefined; void this.mutate((signal) => value ? this.api.updateKind(value.id, event.detail, signal) : this.api.createKind(event.detail, signal)); }
  private saveVariant(event: CustomEvent<CreateActivityVariantRequest>) { const value = this.editor?.type === 'variant' ? this.editor.value : undefined; const kind = this.kind; if (!kind) return; void this.mutate((signal) => value ? this.api.updateVariant(value.id, event.detail, signal) : this.api.createVariant(kind.id, event.detail, signal)); }
  private confirm() { const editor = this.editor; if (editor?.type !== 'confirm') return; const { target, action, value } = editor; void this.mutate((signal) => target === 'kind' ? action === 'archive' ? this.api.archiveKind(value.id, signal) : this.api.restoreKind(value.id, signal) : action === 'archive' ? this.api.archiveVariant(value.id, signal) : this.api.restoreVariant(value.id, signal), `${target === 'kind' ? 'Activity kind' : 'Variant'} ${action === 'archive' ? 'archived' : 'restored'}.`); }
  private renderError(error: unknown) { return html`<div class="error-box" role="alert"><p>${clientMessage(error)}</p>${error instanceof ClientError && error.requestId ? html`<small>Request ID: ${error.requestId}</small>` : nothing}<div><button @click=${() => void this.load()}>Retry</button></div></div>`; }
  private menu(value: ActivityKind | ActivityVariant, target: 'kind' | 'variant') { return html`<details class="more"><summary aria-label=${`Actions for ${value.name}`} title=${`Actions for ${value.name}`}>•••</summary><div class="menu"><button @click=${(e: Event) => this.openEditor(target === 'kind' ? { type: 'kind', value: value as ActivityKind } : { type: 'variant', value: value as ActivityVariant }, e)}>Edit</button><button ?disabled=${target === 'variant' && value.isArchived && this.kind?.isArchived} @click=${(e: Event) => this.openEditor({ type: 'confirm', target, action: value.isArchived ? 'restore' : 'archive', value }, e)}>${value.isArchived ? 'Restore' : 'Archive'}</button></div></details>`; }
  private renderList() { return html`
    <header class="heading"><div class="heading-copy"><h1 tabindex="-1">Activity kinds</h1><p class="muted">Kinds define the activities you record and their available variants and measurements.</p></div><button class="primary" @click=${(e: Event) => this.openEditor({ type: 'kind' }, e)}>Add activity kind</button></header>
    <div class="toolbar"><span class="help">Your activity kinds</span><label class="check"><input type="checkbox" .checked=${this.archived} @change=${(e: Event) => this.toggle('archived',e)}/>Show archived kinds</label></div>
    ${this.error ? this.renderError(this.error) : nothing}
    ${this.kinds.length ? html`<ul class="list" aria-label="Activity kinds">${repeat(this.kinds, (k) => k.id, (k) => html`<li class=${`row ${k.isArchived ? 'archived' : ''}`}><a class="row-link" href=${this.kindUrl(k.id)}><span class="kind-symbol">${activityIcon(k.iconName)}</span><span class="row-copy"><span class="row-name">${k.name}</span>${k.isArchived ? html`<span class="badge">Archived</span>` : nothing}</span><span class="swatch" style=${`background:${k.color}`} role="img" aria-label=${`Colour ${k.color}`}></span><span class="chevron" aria-hidden="true">›</span></a>${this.menu(k,'kind')}</li>`)}</ul>` : !this.loading && !this.error ? html`<div class="empty"><h2>No activity kinds yet</h2><p class="muted">Add your first kind to define the activities you want to record.</p><button class="primary" @click=${(e: Event) => this.openEditor({ type: 'kind' },e)}>Add activity kind</button></div>` : nothing}`; }
  private renderDetail() { const kind = this.kind; return html`<a class="back" href=${this.listUrl}>← Activity kinds</a>
    ${this.error instanceof ClientError && this.error.kind === 'not-found' ? html`<div class="not-found"><h1 tabindex="-1">Activity kind not found</h1><p class="muted">This link does not point to an available activity kind.</p><a href=${this.listUrl}>Return to Activity kinds</a></div>` : this.error ? this.renderError(this.error) : nothing}
    ${kind ? html`<header class="heading"><div class="heading-copy"><div class="detail-title"><span class="kind-symbol">${activityIcon(kind.iconName)}</span><h1 tabindex="-1">${kind.name}</h1><span class="swatch" style=${`background:${kind.color}`} role="img" aria-label=${`Colour ${kind.color}`}></span></div>${kind.isArchived ? html`<span class="badge">Archived</span>` : html`<p class="muted">Activity kind</p>`}</div><div class="actions"><button @click=${(e: Event) => this.openEditor({ type: 'kind', value: kind },e)}>Edit activity kind</button>${this.menu(kind,'kind')}</div></header>
      ${kind.isArchived ? html`<p class="notice">This kind remains available in history. Restore it before adding or restoring variants or selecting a default.</p>` : nothing}
      <section aria-labelledby="variants-title"><header class="heading"><div class="heading-copy"><h2 id="variants-title">Variants</h2><p class="muted">Variants distinguish forms of the same activity, such as Outdoor and Treadmill.</p></div><button class="primary" ?disabled=${kind.isArchived} @click=${(e: Event) => this.openEditor({ type: 'variant' },e)}>Add variant</button></header><div class="toolbar"><span class="help">Forms of this activity</span><label class="check"><input type="checkbox" .checked=${this.archivedVariants} @change=${(e: Event) => this.toggle('variantsArchived',e)}/>Show archived variants</label></div>
      ${this.variantError ? this.renderError(this.variantError) : nothing}
      ${this.variants.length ? html`<ul class="list" aria-label="Variants">${repeat(this.variants,(v) => v.id,(v) => html`<li class=${`row ${v.isArchived ? 'archived' : ''}`}><div class="row-copy"><span class="row-name">${v.name}</span>${v.isDefault ? html`<span class="badge default">Default</span>` : nothing}${v.isArchived ? html`<span class="badge">Archived</span>` : nothing}</div>${this.menu(v,'variant')}</li>`)}</ul>` : !this.loading && !this.variantError ? html`<div class="empty"><h3>No variants</h3><p class="muted">Add variants only when you need to distinguish forms such as Outdoor and Treadmill.</p></div>` : nothing}</section>` : nothing}`; }
  private renderEditor() { const editor = this.editor; if (!editor) return nothing;
    const title = editor.type === 'kind' ? editor.value ? 'Edit activity kind' : 'Add activity kind' : editor.type === 'variant' ? editor.value ? 'Edit variant' : 'Add variant' : `${editor.action === 'archive' ? 'Archive' : 'Restore'} ${editor.target === 'kind' ? 'activity kind' : 'variant'}?`;
    return html`<dialog aria-labelledby="editor-title" @cancel=${(e: Event) => { e.preventDefault(); if (!this.busy) this.closeEditor(); }} @cancel-editor=${() => this.closeEditor()}><h2 id="editor-title">${title}</h2>
      ${editor.type === 'kind' ? html`<kind-form .kind=${editor.value} .busy=${this.busy} .error=${this.mutationError} @save-kind=${this.saveKind}></kind-form>` : editor.type === 'variant' ? html`<variant-form .variant=${editor.value} .parentArchived=${this.kind?.isArchived ?? false} .busy=${this.busy} .error=${this.mutationError} @save-variant=${this.saveVariant}></variant-form>` : html`<div class="confirmation"><p><strong>${editor.value.name}</strong></p><p>${editor.action === 'restore' ? 'Restore this item for new activity entry. Restoring does not reinstate a default variant.' : editor.target === 'kind' ? 'Existing history remains available. This kind will no longer be available for new activity entry. Its variants and measurements remain configured; any default variant is cleared.' : 'Historical activities retain this variant, but it will no longer be available for new entries. If it is the default, its default selection is cleared.'}</p>${this.mutationError ? html`<div class="error-box" role="alert">${clientMessage(this.mutationError)}${this.mutationError instanceof ClientError && this.mutationError.requestId ? html`<small>Request ID: ${this.mutationError.requestId}</small>` : nothing}</div>` : nothing}<div class="actions"><button ?disabled=${this.busy} @click=${() => this.closeEditor()}>Cancel</button><button class="primary" ?disabled=${this.busy} @click=${this.confirm}>${this.busy ? 'Saving…' : editor.action === 'archive' ? 'Archive' : 'Restore'}</button></div></div>`}
    </dialog>`;
  }
  override render() { return html`<div aria-busy=${this.loading}>${this.url.pathname.replace(/\/$/,'') === '/activity-kinds' ? this.renderList() : this.renderDetail()}</div><p class="status" role="status">${this.loading ? this.kind || this.kinds.length ? 'Updating…' : 'Loading…' : this.status}</p>${this.renderEditor()}`; }
}
customElements.define('activity-kinds-page', ActivityKindsPage);
