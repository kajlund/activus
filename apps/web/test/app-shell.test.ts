import { afterEach, expect, it } from 'vitest';
import { ActivusApp } from '../src/app-shell.js';
import { navigate } from '../src/routes/navigation.js';

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
});

it('does not create a history entry when a route guard rejects internal navigation', async () => {
  const app = new ActivusApp();
  document.body.append(app);
  await app.updateComplete;
  const length = history.length;
  const guard = (event: Event) => event.preventDefault();
  window.addEventListener('before-route-change', guard);
  try {
    navigate('/settings');
    expect(location.pathname).toBe('/');
    expect(history.length).toBe(length);
  } finally {
    window.removeEventListener('before-route-change', guard);
  }
});
it('names unknown routes and updates the page title when navigating away', async () => {
  history.replaceState(null, '', '/unknown/nested/path');
  const app = new ActivusApp();
  document.body.append(app);
  await app.updateComplete;
  expect(app.shadowRoot!.querySelector('h1')!.textContent).toBe(
    'Page not found',
  );
  expect(document.title).toBe('Page not found · Activus');
  navigate('/settings');
  await app.updateComplete;
  expect(document.title).toBe('Settings · Activus');
});

it('renders all primary navigation destinations as keyboard-usable links', async () => {
  const app = new ActivusApp();
  document.body.append(app);
  await app.updateComplete;
  const navigation = app.shadowRoot?.querySelector('nav[aria-label="Primary"]');
  expect(navigation).not.toBeNull();
  const links = Array.from(navigation?.querySelectorAll('a') ?? []);
  expect(links.map((link) => link.textContent)).toEqual([
    'Overview',
    'Activities',
    'Goals',
    'Progress',
    'Activity kinds',
    'Settings',
  ]);
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/',
    '/activities',
    '/goals',
    '/progress/trends',
    '/activity-kinds',
    '/settings',
  ]);
  expect(links.every((link) => link.tabIndex === 0)).toBe(true);
  expect(links[0]?.getAttribute('aria-current')).toBe('page');
});

it('moves keyboard focus to the main area from the skip link', async () => {
  const app = new ActivusApp();
  document.body.append(app);
  await app.updateComplete;
  app.shadowRoot?.querySelector<HTMLAnchorElement>('.skip')?.click();
  expect(app.shadowRoot?.activeElement?.tagName).toBe('MAIN');
});
