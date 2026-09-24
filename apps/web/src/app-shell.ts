import { themeMode, applyTheme, selectTheme } from './theme.js';
import { LitElement, css, html } from 'lit';
import { pageHeadingStyles } from './components/page-heading.js';
import {
  interceptNavigation,
  initializeNavigation,
  navigationPosition,
  requestRouteChange,
  wasApprovedNavigation,
} from './routes/navigation.js';
import './features/activity-kinds/page.js';
import './features/tags/page.js';
import './features/activities/page.js';
import './features/journal/page.js';
import './features/journal/detail.js';
import './features/goals/create-page.js';
import './features/goals/page.js';
import './features/goals/detail.js';
import './features/progress/page.js';
import './features/overview/page.js';
import { Sun, Moon, Menu, X, createElement } from 'lucide';

const destinations = [
  ['Overview', '/'],
  ['Activities', '/activities'],
  ['Goals', '/goals'],
  ['Progress', '/progress/trends'],
  ['Activity kinds', '/activity-kinds'],
  ['Settings', '/settings'],
] as const;

export class ActivusApp extends LitElement {
  static override properties = {
    location: { state: true },
    theme: { state: true },
    menuOpen: { state: true },
  };
  private location = window.location.pathname + window.location.search;
  private theme = themeMode();
  private menuOpen = false;
  private readonly syncTheme = () => applyTheme(this.theme);
  private position = navigationPosition();
  private restoringHistory = false;
  private approvedHistory = false;
  private applyLocation() {
    this.position = navigationPosition();
    const pathChanged =
      new URL(this.location, window.location.origin).pathname !==
      window.location.pathname;
    this.location = window.location.pathname + window.location.search;
    this.menuOpen = false;
    if (pathChanged)
      void this.updateComplete.then(() =>
        this.renderRoot.querySelector<HTMLElement>('main')?.focus(),
      );
  }
  private readonly onLocation = (event: Event) => {
    if (this.approvedHistory) {
      this.approvedHistory = false;
      this.applyLocation();
      return;
    }
    if (this.restoringHistory) {
      this.restoringHistory = false;
      return;
    }
    if (!wasApprovedNavigation(event)) {
      const targetPosition = navigationPosition();
      const targetUrl = window.location.pathname + window.location.search;
      const targetState = window.history.state;
      const delta = this.position - navigationPosition();
      let restored = true;
      let resumeRequested = false;
      const resume = () => {
        if (!restored) {
          resumeRequested = true;
          return;
        }
        const resumeDelta = targetPosition - navigationPosition();
        if (resumeDelta) {
          this.approvedHistory = true;
          window.history.go(resumeDelta);
        } else {
          window.history.replaceState(targetState, '', targetUrl);
          this.applyLocation();
        }
      };
      if (!requestRouteChange({ resume })) {
        restored = false;
        if (delta) {
          this.restoringHistory = true;
          window.history.go(delta);
          const restoredLocation = () => {
            window.removeEventListener('popstate', restoredLocation);
            restored = true;
            if (resumeRequested) resume();
          };
          window.addEventListener('popstate', restoredLocation);
        } else {
          restored = true;
          window.history.replaceState(
            { ...window.history.state, activusPosition: this.position },
            '',
            this.location,
          );
        }
        return;
      }
      return;
    }
    this.applyLocation();
  };
  private readonly desktop = window.matchMedia?.('(min-width: 960px)');
  private readonly syncNavigation = () => {
    this.menuOpen = false;
  };
  private readonly outsideNavigation = (event: Event) => {
    const path = event.composedPath();
    const navigation = this.renderRoot.querySelector('nav');
    const toggle = this.renderRoot.querySelector('.menu-toggle');
    if (this.menuOpen && !path.includes(navigation!) && !path.includes(toggle!))
      this.menuOpen = false;
  };
  private async toggleNavigation() {
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      await this.updateComplete;
      (
        this.renderRoot.querySelector<HTMLAnchorElement>(
          'nav a[aria-current="page"]',
        ) ?? this.renderRoot.querySelector<HTMLAnchorElement>('nav a')
      )?.focus();
    }
  }
  private readonly escapeNavigation = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.menuOpen) {
      this.menuOpen = false;
      this.renderRoot.querySelector<HTMLButtonElement>('.menu-toggle')?.focus();
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    initializeNavigation();
    this.syncTheme();
    document.addEventListener('pointerdown', this.outsideNavigation);
    document.addEventListener('focusin', this.outsideNavigation);
    document.addEventListener('keydown', this.escapeNavigation);
    this.desktop?.addEventListener('change', this.syncNavigation);
    window.addEventListener('popstate', this.onLocation);
    this.syncNavigation();
  }

  override disconnectedCallback() {
    this.desktop?.removeEventListener('change', this.syncNavigation);
    window.removeEventListener('popstate', this.onLocation);
    document.removeEventListener('pointerdown', this.outsideNavigation);
    document.removeEventListener('focusin', this.outsideNavigation);
    document.removeEventListener('keydown', this.escapeNavigation);
    super.disconnectedCallback();
  }

  protected override firstUpdated() {
    this.syncNavigation();
  }
  protected override updated() {
    const path = new URL(this.location, window.location.origin).pathname;
    const title =
      path === '/activities'
        ? 'Journal'
        : path === '/goals/new'
          ? 'New goal'
          : /^\/goals\/[^/]+$/.test(path) && path !== '/goals/new'
            ? 'Goal details'
            : /^\/goals\/[^/]+\/edit$/.test(path)
              ? 'Edit goal'
              : path === '/activities/new'
                ? 'New activity'
                : /^\/activities\/[^/]+\/edit$/.test(path)
                  ? 'Edit activity'
                  : /^\/activities\/[^/]+$/.test(path)
                    ? 'Activity details'
                    : /^\/activity-kinds\/[^/]+$/.test(path)
                      ? 'Activity kind details'
                      : path === '/tags'
                        ? 'Tags'
                        : (destinations.find(([, url]) => url === path)?.[0] ??
                          'Page not found');
    document.title = `${title} · Activus`;
  }
  static override styles = css`
    :host {
      display: block;
    }
    * {
      box-sizing: border-box;
    }
    .shell {
      min-height: 100dvh;
      container-type: inline-size;
    }
    header {
      height: 72px;
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 12px 32px;
      border-bottom: 1px solid var(--color-divider);
      background: var(--color-surface);
      position: relative;
      z-index: 10;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--color-text);
      text-decoration: none;
      font-size: 20px;
      font-weight: 650;
    }
    .brand img {
      width: 36px;
      height: 36px;
    }
    nav {
      flex: 1;
    }
    nav ul {
      display: flex;
      gap: 4px;
      list-style: none;
      padding: 0;
      margin: 0;
    }
    nav a {
      display: flex;
      align-items: center;
      min-height: var(--control-height);
      padding: 8px 12px;
      color: var(--color-text-secondary);
      text-decoration: none;
      white-space: nowrap;
      border-radius: var(--radius-sm);
      transition: background var(--duration-fast);
    }
    nav a:hover {
      background: var(--color-nav-hover);
    }
    nav a[aria-current='page'] {
      background: var(--color-nav-active);
      color: var(--color-primary-hover);
      font-weight: 650;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      color: var(--color-text);
      background: transparent;
      cursor: pointer;
      flex-shrink: 0;
    }
    button:hover {
      background: var(--color-nav-hover);
    }
    .theme-toggle {
      margin-left: auto;
    }
    .menu-toggle {
      display: none;
    }
    a:focus-visible,
    button:focus-visible,
    main:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 3px;
    }
    main {
      max-width: var(--content-width);
      margin: auto;
      padding: 24px 32px;
      min-width: 0;
    }
    ${pageHeadingStyles}
    h1 {
      margin: 0 0 24px;
    }
    main > a {
      display: inline-flex;
      align-items: center;
      min-height: var(--control-height);
      color: var(--color-primary);
    }
    main > h1,
    main > p,
    main > a {
      margin-left: max(0px, calc((100% - 1040px) / 2));
    }
    p {
      color: var(--color-text-muted);
    }
    .settings {
      max-width: 1040px;
      margin: auto;
    }
    .settings ul {
      list-style: none;
      padding: 0;
    }
    .settings li a {
      text-decoration: none;
    }
    .settings li a:hover strong {
      text-decoration: underline;
    }
    .settings h2 {
      font-size: 1.2rem;
      margin: 32px 0 8px;
    }
    .settings li a strong {
      display: block;
      font-weight: 600;
    }
    .settings li a span {
      display: block;
      margin-top: 6px;
      color: var(--color-text-muted);
      font-size: 0.9rem;
    }
    .settings li a {
      display: block;
      padding: 16px 0;
      color: var(--color-primary);
      border-bottom: 1px solid var(--color-divider);
    }
    .skip {
      position: fixed;
      top: 12px;
      left: 12px;
      clip-path: inset(50%);
      width: 1px;
      height: 1px;
      overflow: hidden;
      background: var(--color-surface);
      color: var(--color-text);
      z-index: 20;
    }
    .skip:focus {
      clip-path: none;
      width: auto;
      height: auto;
      padding: 12px;
    }
    @container (max-width: 959px) {
      header {
        padding: 12px 16px;
        gap: 8px;
      }
      .menu-toggle {
        display: inline-flex;
      }
      nav {
        display: none;
        position: absolute;
        top: 71px;
        right: 16px;
        width: min(320px, calc(100vw - 32px));
        max-height: calc(100dvh - 88px);
        overflow-y: auto;
        background: var(--color-surface-raised);
        padding: 8px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-md);
      }
      nav.open {
        display: block;
      }
      nav ul {
        flex-direction: column;
      }
      main {
        padding: 24px 16px;
      }
    }
    @media (max-width: 768px) {
      main {
        padding: 20px 16px;
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
      pathname === '/activity-kinds' ||
      /^\/activity-kinds\/[^/]+$/.test(pathname);
    return html`
      <a class="skip" href="#main" @click=${this.skipToMain}>Skip to content</a>
      <div
        class="shell"
        @click=${interceptNavigation}
        @focusin=${this.outsideNavigation}
      >
        <header>
          <a class="brand" href="/" aria-label="Activus home"
            ><img src="/icons/activus.svg" alt="" width="36" height="36" /><span
              >Activus</span
            ></a
          >
          <nav
            id="primary-navigation"
            class=${this.menuOpen ? 'open' : ''}
            aria-label="Primary"
          >
            <ul>
              ${destinations.map(
                ([label, path]) =>
                  html`<li>
                    <a
                      href=${path}
                      aria-current=${(path === '/activity-kinds' ? isKinds : path === '/settings' ? pathname === '/settings' || pathname === '/tags' : path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/')) ? 'page' : 'false'}
                      @click=${() => {
                        this.menuOpen = false;
                      }}
                      >${label}</a
                    >
                  </li>`,
              )}
            </ul>
          </nav>
          <button
            type="button"
            class="theme-toggle"
            aria-label=${this.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title=${this.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            @click=${() => {
              this.theme = this.theme === 'dark' ? 'light' : 'dark';
              selectTheme(this.theme);
            }}
          >
            ${createElement(this.theme === 'dark' ? Sun : Moon, { width: '20', height: '20', 'aria-hidden': 'true' })}
          </button>
          <button
            type="button"
            class="menu-toggle"
            aria-label="Navigation"
            title="Navigation"
            aria-expanded=${this.menuOpen}
            aria-controls="primary-navigation"
            @click=${this.toggleNavigation}
          >
            ${createElement(this.menuOpen ? X : Menu, { width: '22', height: '22', 'aria-hidden': 'true' })}
          </button>
        </header>
        <main id="main" tabindex="-1">
          ${
            pathname === '/progress/trends'
              ? html`<progress-page></progress-page>`
              : pathname === '/goals'
                ? html`<goals-page .route=${this.location}></goals-page>`
                : /^\/goals\/[^/]+$/.test(pathname) && pathname !== '/goals/new'
                  ? html`<goal-detail-page
                      .route=${this.location}
                    ></goal-detail-page>`
                  : pathname === '/goals/new' ||
                      /^\/goals\/[^/]+\/edit$/.test(pathname)
                    ? html`<goal-form-page
                        .route=${this.location}
                      ></goal-form-page>`
                    : pathname === '/activities/new' ||
                        /^\/activities\/[^/]+\/edit$/.test(pathname)
                      ? html`<activity-editor-page
                          .route=${this.location}
                        ></activity-editor-page>`
                      : pathname === '/activities'
                        ? html`<activity-journal-page
                            .route=${this.location}
                          ></activity-journal-page>`
                        : /^\/activities\/[^/]+$/.test(pathname)
                          ? html`<activity-detail-page
                              .route=${this.location}
                            ></activity-detail-page>`
                          : isKinds
                            ? html`<activity-kinds-page
                                .route=${this.location}
                              ></activity-kinds-page>`
                            : pathname === '/tags'
                              ? html`<tags-page
                                  .route=${this.location}
                                ></tags-page>`
                              : pathname === '/settings'
                                ? html`<div class="settings">
                                    <h1>Settings</h1>
                                    <p>
                                      Manage the configuration used by your
                                      journal.
                                    </p>
                                    <h2>Journal configuration</h2>
                                    <ul aria-label="Configuration">
                                      <li>
                                        <a
                                          href="/activity-kinds"
                                          aria-label="Activity kinds and measurements"
                                          ><strong
                                            >Activity kinds and
                                            measurements</strong
                                          ><span
                                            >Manage kinds, variants and the
                                            values recorded with each
                                            activity.</span
                                          ></a
                                        >
                                      </li>
                                      <li>
                                        <a href="/tags" aria-label="Tags"
                                          ><strong>Tags</strong
                                          ><span
                                            >Organise activities with reusable
                                            labels and colours.</span
                                          ></a
                                        >
                                      </li>
                                    </ul>
                                  </div>`
                                : pathname === '/'
                                  ? html`<overview-page></overview-page>`
                                  : html`<h1>Page not found</h1>
                                      <p>
                                        This address does not match an Activus
                                        page.
                                      </p>
                                      <a href="/activities"
                                        >Return to journal</a
                                      >`
          }
        </main>
      </div>
    `;
  }
}

customElements.define('activus-app', ActivusApp);
