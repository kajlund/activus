import { css } from 'lit';
import { managementStyles } from '../activity-kinds/styles.js';
export const journalStyles = [
  managementStyles,
  css`
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    :host {
      max-width: 1000px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--space-5);
      flex-wrap: wrap;
      margin-bottom: var(--space-5);
    }
    header p {
      margin-top: var(--space-3);
    }
    .toolbar,
    .chips,
    .facts,
    .tags {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .toolbar {
      margin-bottom: var(--space-4);
    }
    .chips button,
    .tag {
      border-radius: var(--radius-pill);
      overflow-wrap: anywhere;
      max-width: 100%;
      white-space: normal;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) var(--space-3);
      background: var(--color-surface-subtle);
      font-size: var(--font-size-small);
    }
    .swatch {
      width: 12px;
      height: 12px;
    }
    .status {
      min-height: 24px;
      margin: var(--space-4) 0;
    }
    .empty {
      padding: var(--space-7) var(--space-4);
      display: grid;
      gap: var(--space-4);
      justify-items: start;
      border-top: 1px solid var(--color-border);
    }
    .error-box {
      margin: var(--space-4) 0;
    }
    .group {
      margin-top: var(--space-6);
    }
    .group h2 {
      font-size: var(--font-size-component-title);
      margin-bottom: var(--space-3);
      color: var(--color-text-muted);
    }
    ul {
      padding: 0;
      margin: 0;
      list-style: none;
    }
    .row {
      display: flex;
      align-items: flex-start;
      gap: var(--space-4);
      padding: var(--space-5) 0;
      border-top: 1px solid var(--color-border);
    }
    .identity {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: var(--space-3);
    }
    .title {
      font-weight: 600;
      overflow-wrap: anywhere;
      text-decoration: none;
    }
    .title:hover {
      text-decoration: underline;
    }
    .kind-icon {
      padding-top: var(--space-1);
      flex-shrink: 0;
    }
    .facts {
      gap: var(--space-3);
    }
    .measure {
      white-space: nowrap;
    }
    .metadata,
    .facts {
      font-size: var(--font-size-small);
    }
    .metadata {
      overflow-wrap: anywhere;
    }
    .paging {
      margin: var(--space-6) 0;
      display: grid;
      gap: var(--space-3);
      justify-items: start;
    }
    dialog {
      width: min(680px, calc(100% - 32px));
      max-height: calc(100dvh - 48px);
      overflow-y: auto;
      padding: var(--space-6);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      color: var(--color-text);
      box-shadow: var(--shadow-md);
    }
    dialog::backdrop {
      background: rgb(23 18 28 / 0.5);
    }
    dialog h2 {
      margin-bottom: var(--space-5);
    }
    dialog p {
      margin-bottom: var(--space-4);
      overflow-wrap: anywhere;
    }
    .danger {
      color: var(--color-error);
      border-color: var(--color-error);
    }
    h1:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 3px;
    }
    @media (max-width: 600px) {
      header {
        display: grid;
      }
      .row {
        gap: var(--space-2);
      }
      dialog.filters {
        width: 100%;
        max-width: 100%;
        height: 100dvh;
        max-height: 100dvh;
        margin: 0;
        border-radius: 0;
        padding: var(--space-5);
      }
    }
  `,
];
