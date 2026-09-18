import { css } from 'lit';
import { journalStyles } from './styles.js';
export const journalPageStyles = [
  ...journalStyles,
  css`
    :host {
      display: block;
      max-width: 1040px;
    }
    [hidden] {
      display: none !important;
    }
    h1 {
      font-family: var(--font-family-display);
      font-size: var(--font-size-display);
      line-height: var(--line-height-display);
      font-weight: 400;
    }
    header {
      align-items: center;
      margin-bottom: var(--space-6);
    }
    header p {
      margin-top: var(--space-2);
    }
    .toolbar {
      gap: var(--space-3);
      padding-bottom: var(--space-3);
      margin-bottom: 0;
      border-bottom: 1px solid var(--color-border);
    }
    .toolbar button {
      gap: var(--space-2);
    }
    .kind-filter {
      max-width: 260px;
      min-width: 0;
    }
    select {
      width: 100%;
      min-height: 44px;
      padding: 0 var(--space-3);
      border: 1px solid var(--color-control-border);
      border-radius: var(--radius-sm);
      background: var(--color-input);
      color: var(--color-text);
      font: inherit;
      text-overflow: ellipsis;
    }
    .result-count {
      margin-left: auto;
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .chips:has(button) {
      padding-top: var(--space-3);
    }
    .chips button {
      font-size: var(--font-size-small);
      gap: var(--space-2);
    }
    .filters {
      padding: var(--space-5);
      margin-top: var(--space-3);
      background: var(--color-surface-subtle);
      border-radius: var(--radius-md);
    }
    .filters h2 {
      margin-bottom: var(--space-4);
    }
    .group {
      margin-top: var(--space-5);
    }
    .group h2 {
      font-size: var(--font-size-small);
      font-weight: 600;
      margin-bottom: var(--space-2);
    }
    .row {
      display: block;
      padding: 0;
    }
    .row-toggle {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) minmax(0, auto) 20px;
      gap: var(--space-4);
      width: 100%;
      padding: var(--space-4) var(--space-3);
      text-align: left;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-text);
      font-weight: 400;
      align-items: center;
    }
    .row-toggle:hover {
      background: var(--color-surface-subtle);
    }
    .row-toggle[aria-expanded='true'] {
      background: var(--color-primary-soft);
    }
    .row-toggle:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: -3px;
    }
    .kind-icon {
      display: grid;
      place-items: center;
      padding: var(--space-2) 0;
      border-bottom: 3px solid var(--kind-color);
    }
    .identity {
      gap: var(--space-1);
    }
    .title {
      line-height: var(--line-height-body);
    }
    .title:hover {
      text-decoration: none;
    }
    .facts {
      justify-content: flex-end;
      max-width: 360px;
      gap: var(--space-3);
      font-variant-numeric: tabular-nums;
    }
    .facts time {
      color: var(--color-text-muted);
    }
    .primary-measure {
      font-weight: 650;
      min-width: 0;
      max-width: 100%;
      overflow-wrap: anywhere;
    }
    .primary-measure .measure {
      white-space: normal;
    }
    .chevron {
      display: flex;
      color: var(--color-text-muted);
    }
    .entry-details {
      padding: var(--space-5) var(--space-5) var(--space-5) 64px;
      border-left: 2px solid var(--color-primary);
      background: var(--color-surface);
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-4) var(--space-5);
      margin: 0;
    }
    .detail-grid div {
      min-width: 0;
    }
    dt {
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
      margin-bottom: var(--space-1);
      overflow-wrap: anywhere;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
      font-variant-numeric: tabular-nums;
    }
    .entry-details section {
      margin-top: var(--space-5);
    }
    h3 {
      font-size: var(--font-size-small);
      font-weight: 600;
      margin: 0 0 var(--space-3);
      color: var(--color-text-muted);
    }
    .notes {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-width: 70ch;
      margin: 0;
    }
    .entry-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
      margin-top: var(--space-5);
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-border);
    }
    .entry-actions .danger {
      margin-left: auto;
      border-color: transparent;
    }
    .matching-goal {
      display: flex;
      align-items: center;
      min-height: 44px;
      overflow-wrap: anywhere;
    }
    @media (max-width: 700px) {
      .row-toggle {
        grid-template-columns: 32px minmax(0, 1fr) 20px;
        gap: var(--space-2) var(--space-3);
      }
      .facts {
        grid-column: 2;
        justify-content: flex-start;
        max-width: none;
      }
      .facts:empty {
        display: none;
      }
      .chevron {
        grid-column: 3;
        grid-row: 1 / span 2;
      }
      .kind-icon {
        grid-column: 1;
        grid-row: 1 / span 2;
        align-self: start;
      }
      .entry-details {
        padding: var(--space-4);
      }
      .detail-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .result-count {
        flex-basis: 100%;
        margin-left: 0;
      }
    }
    @media (max-width: 440px) {
      .detail-grid {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-3);
      }
      .filters {
        padding: var(--space-3);
      }
      .kind-filter {
        max-width: 100%;
        flex: 1 1 100%;
      }
      .row-toggle {
        padding-inline: var(--space-2);
      }
      .facts {
        gap: var(--space-2) var(--space-3);
      }
      .entry-actions .danger {
        margin-left: 0;
      }
    }
  `,
];
