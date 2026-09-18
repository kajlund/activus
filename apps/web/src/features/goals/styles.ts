import { css } from 'lit';
import { journalStyles } from '../journal/styles.js';

/** Phase 6A controls and Phase 6B editorial layout, scoped to goals/progress. */
export const goalStyles = [
  ...journalStyles,
  css`
    :host {
      display: block;
      max-width: 1040px;
      margin: auto;
    }
    h1 {
      font-family: var(--font-family-display);
      font-size: var(--font-size-display);
      line-height: var(--line-height-display);
      font-weight: 400;
    }
    h2 {
      font-size: var(--font-size-component-title);
      line-height: var(--line-height-component-title);
      overflow-wrap: anywhere;
    }
    p {
      margin: var(--space-2) 0;
      overflow-wrap: anywhere;
    }
    header {
      align-items: center;
      margin-bottom: var(--space-5);
    }
    header p {
      margin-top: var(--space-2);
    }
    a:not(.goal-link):not(.title) {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
    }
    a.primary {
      background: var(--color-primary);
      color: var(--color-on-primary);
      text-decoration: none;
      font-weight: 600;
      padding-inline: var(--space-4);
    }
    a.primary:hover {
      background: var(--color-primary-hover);
    }
    .muted,
    .announcement {
      color: var(--color-text-muted);
    }
    .announcement {
      font-size: var(--font-size-small);
      min-height: 24px;
      margin: var(--space-3) 0;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      border-bottom: 1px solid var(--color-border);
      padding-bottom: var(--space-3);
    }
    nav a {
      text-decoration: none;
    }
    nav a[aria-current='page'] {
      background: var(--color-primary-soft);
      color: var(--color-text);
      font-weight: 600;
    }
    .goal-row {
      padding: var(--space-5) 0;
      border-bottom: 1px solid var(--color-border);
    }
    .row-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(240px, 0.8fr);
      gap: var(--space-3) var(--space-6);
      align-items: start;
    }
    .definition {
      grid-row: 1 / span 2;
      min-width: 0;
    }
    .goal-link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 44px;
      color: var(--color-text);
      text-decoration: none;
    }
    .goal-link:hover {
      color: var(--color-primary);
      text-decoration: underline;
    }
    .goal-link svg {
      width: 18px;
      flex-shrink: 0;
      color: var(--color-text-muted);
    }
    .definition p,
    .progress p:not(.numeric) {
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .scope {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .scope svg {
      flex-shrink: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }
    .row-head > .actions {
      justify-content: flex-end;
    }
    .row-head > .actions button {
      background: transparent;
      border-color: transparent;
      font-size: var(--font-size-small);
    }
    .tags {
      gap: var(--space-2);
    }
    .tags > span {
      padding-right: var(--space-2);
      border-right: 1px solid var(--color-border);
    }
    .numeric {
      font-size: var(--font-size-section-title);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .progress {
      padding-top: var(--space-2);
      min-width: 0;
    }
    .achieved {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--color-text);
      font-size: var(--font-size-small);
      font-weight: 500;
    }
    .achieved::before {
      content: '';
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--color-progress);
    }
    progress {
      display: block;
      width: 100%;
      max-width: 640px;
      height: 6px;
      appearance: none;
      border: 0;
      border-radius: var(--radius-pill);
      overflow: hidden;
      background: var(--color-border);
      margin: var(--space-3) 0;
    }
    progress::-webkit-progress-bar {
      background: var(--color-border);
    }
    progress::-webkit-progress-value {
      background: var(--color-primary);
    }
    progress::-moz-progress-bar {
      background: var(--color-primary);
    }
    .empty {
      gap: var(--space-3);
      padding: var(--space-6) 0;
    }
    .empty p {
      max-width: 65ch;
    }
    .sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    .definition-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-5);
    }
    dt {
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
      margin-bottom: var(--space-2);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .warning {
      border-left: 3px solid var(--color-caution);
      padding: var(--space-3);
      background: var(--color-surface-subtle);
    }
    .lifecycle-footer {
      border-top: 1px solid var(--color-border);
      margin-top: var(--space-4);
      padding-top: var(--space-5);
    }
    dialog {
      width: min(520px, calc(100vw - 32px));
    }
    dialog .actions {
      justify-content: flex-end;
      margin-top: var(--space-5);
    }
    select:focus-visible,
    textarea:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 3px;
    }
    @media (max-width: 700px) {
      .row-head {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-2);
      }
      .definition {
        grid-row: auto;
      }
      .row-head > .actions {
        justify-content: flex-start;
      }
      header {
        align-items: flex-start;
      }
      .definition-grid {
        grid-template-columns: minmax(0, 1fr);
      }
      nav a {
        flex: 1;
        justify-content: center;
      }
    }
  `,
];
