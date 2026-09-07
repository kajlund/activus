import { LitElement, css, html } from 'lit';
import { interceptNavigation } from './routes/navigation.js';
import './features/activity-kinds/page.js';
import './features/tags/page.js';

const destinations = [
  ['Overview', '/'],
  ['Activities', '/activities'],
  ['Goals', '/goals'],
  ['Progress', '/progress/trends'],
  ['Activity kinds', '/activity-kinds'],
  ['Settings', '/settings'],
] as const;

export class ActivusApp extends LitElement {
  static override properties = { location: { state: true } };
  private location = window.location.pathname + window.location.search;
  private readonly onLocation = () => {
    if (
      !window.dispatchEvent(
        new Event('before-route-change', { cancelable: true }),
      )
    ) {
      window.history.pushState(null, '', this.location);
      return;
    }
    const pathChanged =
      new URL(this.location, window.location.origin).pathname !==
      window.location.pathname;
    this.location = window.location.pathname + window.location.search;
    const drawer = this.renderRoot.querySelector('details');
    if (pathChanged && drawer && !this.desktop?.matches) drawer.open = false;
    if (pathChanged)
      void this.updateComplete.then(() =>
        this.renderRoot.querySelector<HTMLElement>('main')?.focus(),
      );
  };
  private readonly desktop = window.matchMedia?.('(min-width: 769px)');
  private readonly syncNavigation = () => {
    const drawer = this.renderRoot.querySelector('details');
    if (drawer && this.desktop) drawer.open = this.desktop.matches;
  };

  override connectedCallback() {
    super.connectedCallback();
    this.desktop?.addEventListener('change', this.syncNavigation);
    window.addEventListener('popstate', this.onLocation);
    this.syncNavigation();
  }

  override disconnectedCallback() {
    this.desktop?.removeEventListener('change', this.syncNavigation);
    window.removeEventListener('popstate', this.onLocation);
    super.disconnectedCallback();
  }

  protected override firstUpdated() {
    this.syncNavigation();
  }

  static override styles = css`
    .settings {
      max-width: 960px;
      margin: 0 auto;
    }
    .settings ul {
      list-style: none;
      padding: 0;
      margin: var(--space-6) 0 0;
      border-top: 1px solid var(--color-border);
    }
    .settings li {
      border-bottom: 1px solid var(--color-border);
    }
    .settings li a {
      display: block;
      padding: var(--space-4);
      min-height: 44px;
      color: var(--color-primary);
    }
    :host {
      display: block;
    }
    * {
      box-sizing: border-box;
    }
    .shell {
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      min-height: 100dvh;
    }
    aside {
      padding: var(--space-6) var(--space-5);
      border-right: 1px solid var(--color-border);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      color: var(--color-text);
      text-decoration: none;
      font-size: var(--font-size-section-title);
      font-weight: var(--font-weight-section-title);
      min-height: 44px;
    }
    .brand img {
      width: 48px;
      height: 48px;
    }
    details {
      margin-top: var(--space-6);
    }
    summary {
      display: none;
      cursor: pointer;
      min-height: 44px;
      padding: var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
    }
    nav ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: var(--space-2);
    }
    nav a {
      display: flex;
      align-items: center;
      min-height: 44px;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      color: var(--color-text);
      text-decoration: none;
      transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
    }
    nav a:hover {
      background: var(--color-surface-subtle);
    }
    nav a[aria-current='page'] {
      color: var(--color-primary);
      background: var(--color-primary-soft);
      font-weight: 600;
    }
    a:focus-visible,
    summary:focus-visible,
    main:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 3px;
    }
    .skip {
      position: fixed;
      top: var(--space-3);
      left: var(--space-3);
      clip-path: inset(50%);
      width: 1px;
      height: 1px;
      overflow: hidden;
      padding: var(--space-3);
      background: var(--color-surface);
      color: var(--color-text);
      z-index: 2;
    }
    .skip:focus {
      clip-path: none;
      width: auto;
      height: auto;
      overflow: visible;
    }
    main {
      padding: var(--space-7);
      min-width: 0;
    }
    h1 {
      margin: 0 0 var(--space-5);
      font-size: var(--font-size-page-title);
      line-height: var(--line-height-page-title);
      font-weight: var(--font-weight-page-title);
    }
    p {
      max-width: 52ch;
      color: var(--color-text-muted);
      margin: 0;
    }
    @media (min-width: 769px) {
      details::details-content {
        content-visibility: visible;
      }
      details:not([open]) > nav {
        display: block;
      }
    }
    @media (max-width: 768px) {
      .shell {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto 1fr;
      }
      aside {
        padding: var(--space-4) var(--space-5);
        border-right: 0;
        border-bottom: 1px solid var(--color-border);
      }
      details {
        margin-top: var(--space-4);
      }
      summary {
        display: list-item;
        list-style-position: inside;
      }
      nav {
        padding-top: var(--space-3);
      }
      main {
        padding: var(--space-6) var(--space-5);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      nav a {
        transition: none;
      }
    }
  `;

  private skipToMain(event: Event) {
    event.preventDefault();
    this.renderRoot.querySelector<HTMLElement>('main')?.focus();
  }

  override render() {
    const pathname = new URL(this.location, window.location.origin).pathname;
    const isKinds =
      pathname === '/activity-kinds' || pathname.startsWith('/activity-kinds/');
    const current = destinations.find(([, path]) => path === pathname);
    return html`
      <a class="skip" href="#main" @click=${this.skipToMain}>Skip to content</a>
      <div class="shell" @click=${interceptNavigation}>
        <aside>
          <a class="brand" href="/" aria-label="Activus home"
            ><img src="/icons/activus.svg" alt="" width="48" height="48" /><span
              >Activus</span
            ></a
          >
          <details open>
            <summary>Navigation</summary>
            <nav aria-label="Primary">
              <ul>
                ${destinations.map(([label, path]) => html`<li><a href=${path} aria-current=${(path === '/activity-kinds' ? isKinds : path === '/settings' ? pathname === '/settings' || pathname === '/tags' : pathname === path) ? 'page' : 'false'}>${label}</a></li>`)}
              </ul>
            </nav>
          </details>
        </aside>
        <main id="main" tabindex="-1">
          ${
            isKinds
              ? html`<activity-kinds-page
                  .route=${this.location}
                ></activity-kinds-page>`
              : pathname === '/tags'
                ? html`<tags-page .route=${this.location}></tags-page>`
                : pathname === '/settings'
                  ? html`<div class="settings">
                      <h1>Settings</h1>
                      <p>Manage the configuration used by your journal.</p>
                      <ul aria-label="Configuration">
                        <li>
                          <a href="/activity-kinds"
                            >Activity kinds and measurements</a
                          >
                        </li>
                        <li><a href="/tags">Tags</a></li>
                      </ul>
                    </div>`
                  : html`<h1>${current?.[0] ?? 'Activus'}</h1>
                      <p>This space is ready for your training journal.</p>`
          }
        </main>
      </div>
    `;
  }
}

customElements.define('activus-app', ActivusApp);
