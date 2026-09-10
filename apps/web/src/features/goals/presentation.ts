import { html, nothing } from 'lit';
import type { GoalOverviewItem } from '@activus/contracts';
import { duration, exactNumber } from '../journal/format.js';
import { trapDialogFocus } from '../../components/dialog-focus.js';
import { clientMessage } from '../../services/configuration-api.js';

export function goalValue(item: GoalOverviewItem, value: string) {
  const isDuration =
    item.goal.targetType === 'total_duration' || item.unitSymbol === 'h / min';
  return isDuration
    ? duration(Number(value))
    : `${exactNumber(value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''))}${item.goal.targetType === 'activity_count' ? ` ${value === '1' ? 'activity' : 'activities'}` : item.unitSymbol ? ` ${item.unitSymbol}` : ''}`;
}
export function goalProgressBar(
  name: string,
  current: string,
  target: string,
  label: string,
) {
  return html`<progress
    aria-label=${name}
    aria-valuetext=${label}
    max="100"
    value=${Math.max(0, Math.min(100, (Number(current) / Number(target)) * 100))}
  ></progress>`;
}
export function archiveConfirmation(
  name: string,
  busy: boolean,
  error: unknown,
  cancel: () => void,
  confirm: () => void,
) {
  return html`<dialog
    aria-labelledby="archive-title"
    @keydown=${trapDialogFocus}
    @cancel=${(e: Event) => {
      e.preventDefault();
      cancel();
    }}
  >
    <h2 id="archive-title">Archive this goal?</h2>
    <p>${name}</p>
    <p>Its definition and historical progress will be preserved.</p>
    ${error ? html`<p role="alert">${clientMessage(error)}</p>` : nothing}
    <div class="actions">
      <button class="cancel" ?disabled=${busy} @click=${cancel}>Cancel</button
      ><button ?disabled=${busy} @click=${confirm}>
        ${busy ? 'Archiving…' : 'Archive goal'}
      </button>
    </div>
  </dialog>`;
}
