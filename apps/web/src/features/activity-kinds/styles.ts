import { css } from 'lit';
import { pageHeadingStyles } from '../../components/page-heading.js';
export const managementStyles = css`
  :host {
    display: block;
    min-width: 0;
    color: var(--color-text);
  }
  * {
    box-sizing: border-box;
  }
  [hidden] {
    display: none !important;
  }
  h1,
  h2,
  h3,
  p {
    margin: 0;
  }
  ${pageHeadingStyles}
  h2 {
    font-size: var(--font-size-section-title);
    line-height: var(--line-height-section-title);
    font-weight: 650;
  }
  h3 {
    font-size: var(--font-size-component-title);
    font-weight: 600;
  }
  p {
    line-height: var(--line-height-body);
  }
  .muted,
  .help {
    color: var(--color-text-muted);
  }
  .help {
    font-size: var(--font-size-small);
  }
  button,
  input {
    font: inherit;
  }
  button,
  a {
    -webkit-tap-highlight-color: transparent;
  }
  button,
  .button {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    text-decoration: none;
    font-weight: 600;
  }
  button:hover,
  .button:hover {
    background: var(--color-surface-subtle);
  }
  .primary {
    background: var(--color-primary);
    color: var(--color-on-primary);
    border-color: var(--color-primary);
  }
  .primary:hover {
    background: var(--color-primary-hover);
  }
  button:disabled,
  button:disabled:hover {
    background: var(--color-control-disabled);
    color: var(--color-text-disabled);
    border-color: var(--color-border);
    cursor: default;
  }
  a {
    color: var(--color-primary);
  }
  button:focus-visible,
  a:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  summary:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 3px;
  }
  input:not([type='checkbox']):not([type='radio']) {
    width: 100%;
    min-height: 44px;
    padding: var(--space-3);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
  }
  input[type='checkbox'],
  input[type='radio'] {
    accent-color: var(--color-primary);
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
  label {
    display: block;
  }
  [aria-invalid='true'] {
    border-color: var(--color-error) !important;
  }
  input:disabled,
  select:disabled,
  textarea:disabled {
    background: var(--color-control-disabled);
    color: var(--color-text-disabled);
  }
  .field {
    display: grid;
    gap: var(--space-2);
  }
  .field-title {
    font-weight: 600;
  }
  .required::after {
    content: ' *';
    color: var(--color-primary);
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 44px;
    cursor: pointer;
  }
  .error {
    color: var(--color-error);
    font-size: var(--font-size-small);
  }
  .error-box {
    padding: var(--space-4);
    border-left: 3px solid var(--color-error);
    background: var(--color-surface);
    display: grid;
    gap: var(--space-3);
    overflow-wrap: anywhere;
  }
  .badge {
    color: var(--color-text);
    font-size: var(--font-size-small);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--color-surface-subtle);
    white-space: nowrap;
  }
  .default {
    background: var(--color-primary-soft);
    color: var(--color-primary-hover);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .quiet {
    border-color: transparent;
    background: transparent;
  }
  .swatch {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    button,
    a {
      transition: background-color var(--duration-fast) var(--ease-standard);
    }
  }
`;
