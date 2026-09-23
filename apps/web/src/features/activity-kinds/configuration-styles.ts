import { css } from 'lit';

// Scoped to configuration screens so journal and activity entry stay unchanged.
export const configurationStyles = css`
  h1 {
    font-family: Georgia, serif;
    font-weight: 400;
    font-size: clamp(2rem, 4vw, 2.75rem);
    line-height: 1.15;
    letter-spacing: -0.035em;
  }
  h2 {
    font-size: 1.2rem;
  }
  .list {
    background: transparent;
    border-radius: 0;
  }
  .row {
    padding: 16px 0;
  }
  .row-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }
  .row-actions button,
  .row-actions .button,
  .name-button {
    background: transparent;
    border-color: transparent;
    padding: 8px 4px;
    color: var(--color-primary);
    min-height: 44px;
  }
  .row-actions button:hover,
  .name-button:hover {
    text-decoration: underline;
  }
  .name-button {
    text-align: left;
    justify-content: flex-start;
    overflow-wrap: anywhere;
    font-weight: 600;
  }
  .lifecycle {
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid var(--color-border);
  }
  .kind-symbol {
    border-left: 4px solid var(--kind-color);
  }
  .empty p {
    margin-left: 0;
    margin-right: 0;
  }
  .empty {
    text-align: left;
    justify-items: start;
    padding: 24px 0;
  }
  .heading-copy p {
    max-width: 58ch;
  }
  @media (max-width: 600px) {
    .row {
      display: flex;
      flex-wrap: wrap;
      padding: 12px 0;
    }
    .row-actions {
      width: 100%;
    }
    .row-copy {
      flex-basis: 100%;
    }
    .row-link .row-copy {
      flex-basis: auto;
    }
  }
`;

export const configurationFormStyles = css`
  form {
    gap: 20px;
  }
  legend {
    font-size: 0.9rem;
  }
  input[type='number'] {
    max-width: 10rem;
  }
  .required::after {
    content: '*';
  }
  .required {
    color: var(--color-primary);
  }
  .form-section {
    border-top: 1px solid var(--color-border);
    padding-top: 20px;
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .choice {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .choice:has(input:checked) {
    background: var(--color-primary-soft);
    border-color: var(--color-primary);
  }
  .choice input {
    margin: 0;
  }
`;
