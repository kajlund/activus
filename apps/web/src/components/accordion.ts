import { html, css, type TemplateResult } from 'lit';
import { ChevronDown, ChevronUp, createElement } from 'lucide';
export function accordionHeader(
  id: string,
  title: string,
  summary: string,
  icon: TemplateResult | Element,
  open: boolean,
  error: boolean,
  toggle: () => void,
) {
  return html`<h2 class="accordion-heading">
    <button
      type="button"
      class="accordion-trigger"
      id=${id + '-trigger'}
      aria-expanded=${open}
      aria-controls=${id + '-panel'}
      @click=${toggle}
    >
      ${icon}<span class="accordion-label"
        ><strong>${title}</strong
        ><span class="accordion-summary">${summary}</span></span
      >${error ? html`<span class="error">Review fields</span>` : ''}${createElement(open ? ChevronUp : ChevronDown, { width: '20', height: '20', 'aria-hidden': 'true' })}
    </button>
  </h2>`;
}
export const accordionStyles = css`
  .accordion-heading {
    margin: 0;
  }
  .accordion-trigger {
    width: 100%;
    justify-content: start;
    text-align: left;
    border: 0;
    border-radius: 0;
    padding: 14px 16px;
    background: transparent;
    gap: 16px;
    transition: background-color var(--duration-fast) var(--ease-standard);
  }
  .accordion-trigger[aria-expanded='true'] {
    background: var(--color-primary-soft);
  }
  .accordion-trigger > svg {
    flex-shrink: 0;
    color: var(--color-primary);
  }
  .accordion-label {
    display: flex;
    align-items: baseline;
    gap: 24px;
    flex: 1;
    min-width: 0;
  }
  .accordion-label strong {
    min-width: 140px;
  }
  .accordion-summary {
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 400;
    font-size: var(--font-size-small);
  }
  .accordion-panel {
    padding: 16px;
    min-height: 0;
    overflow: auto;
  }
  @media (max-width: 600px) {
    .accordion-label {
      display: grid;
      gap: 2px;
    }
    .accordion-trigger {
      padding: 12px 8px;
      gap: 10px;
    }
  }
`;
