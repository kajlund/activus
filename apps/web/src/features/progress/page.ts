import { LitElement, html } from 'lit';
import { goalStyles } from '../goals/styles.js';

export class ProgressPage extends LitElement {
  override render() {
    return html`<header>
        <div>
          <h1>Progress</h1>
          <p class="muted">Review the progress recorded in your journal.</p>
        </div>
      </header>
      <section class="empty" aria-labelledby="progress-state">
        <h2 id="progress-state">Progress views are planned</h2>
        <p class="muted">
          Trends and personal records are not available yet. You can review
          current goal progress or browse your recorded activities.
        </p>
        <div class="actions">
          <a class="primary" href="/goals">View goals</a
          ><a href="/activities">Open journal</a>
        </div>
      </section>`;
  }
  static override styles = goalStyles;
}
customElements.define('progress-page', ProgressPage);
