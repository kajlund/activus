import { afterEach, expect, it } from 'vitest';
import { ActivusApp } from '../src/app-shell.js';

afterEach(() => {
  document.body.replaceChildren();
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
