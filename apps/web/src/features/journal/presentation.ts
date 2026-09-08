import { html, nothing } from 'lit';
import type { Activity, ActivitySummary } from '@activus/contracts';
import {
  ClientError,
  clientMessage,
} from '../../services/configuration-api.js';
export function tagsView(tags: Activity['tags']) {
  return html`<div class="tags" aria-label="Tags">
    ${tags.map((t) => html`<span class="tag">${t.color && /^#[0-9a-f]{6}$/i.test(t.color) ? html`<span class="swatch" aria-hidden="true" style=${`background:${t.color}`}></span>` : nothing}${t.name}${t.isArchived ? ' (archived)' : ''}</span>`)}
  </div>`;
}
export function referenceText(a: Activity | ActivitySummary) {
  return `${a.kind.name}${a.kind.isArchived ? ' (archived)' : ''}${a.variant ? ` · ${a.variant.name}${a.variant.isArchived ? ' (archived)' : ''}` : ''}`;
}
export function readError(error: unknown) {
  return html`<div class="error-box" role="alert">
    <p>${clientMessage(error)}</p>
    ${error instanceof ClientError && error.requestId ? html`<p class="help">Request ID: ${error.requestId}</p>` : nothing}
  </div>`;
}
