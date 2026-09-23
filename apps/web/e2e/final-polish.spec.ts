import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { journalFixture } from '../test/support/journal.js';
import { fixedDetail, periodHistory } from '../test/support/goal-detail.js';
import { GoalOverviewItemSchema } from '@activus/contracts';

async function setup(page: Page) {
  const f = await journalFixture(2);
  const detail = structuredClone(fixedDetail);
  detail.goal.activityKindId = f.kind.id;
  detail.goal.activityVariantId = f.variant.id;
  detail.goal.measurementDefinitionId = f.distance.id;
  detail.goal.tagIds = [f.tag.id];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (path === '/api/v1/goals/overview')
      return route.fulfill({
        json: {
          items: [GoalOverviewItemSchema.strip().parse(detail)],
          hasGoals: true,
        },
      });
    if (path.startsWith('/api/v1/goals/for-activity/'))
      return route.fulfill({
        json: {
          items: [],
          pagination: {
            limit: 10,
            offset: 0,
            hasMore: false,
            nextOffset: null,
          },
        },
      });
    if (path === `/api/v1/goals/${detail.goal.id}/detail`)
      return route.fulfill({ json: detail });
    if (path === `/api/v1/goals/${detail.goal.id}`)
      return route.fulfill({ json: detail.goal });
    if (path.endsWith('/periods'))
      return route.fulfill({ json: periodHistory });
    if (path.endsWith('/contributions'))
      return route.fulfill({
        json: {
          startDate: detail.goal.startDate,
          endDate: detail.goal.endDate,
          items: [],
          pagination: {
            limit: 25,
            offset: 0,
            hasMore: false,
            nextOffset: null,
          },
        },
      });
    const response = await f.app.request(path + url.search, {
      method: req.method(),
      headers: { 'Content-Type': 'application/json' },
      ...(req.postData() ? { body: req.postData()! } : {}),
    });
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  return { ...f, goal: detail.goal };
}

test('all implemented routes and configuration dialogs share accessible responsive foundations', async ({
  page,
}, info) => {
  test.skip(
    info.project.name.startsWith('mobile'),
    'Both themes cover all five widths in this matrix.',
  );
  test.setTimeout(180_000);
  const f = await setup(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()))
      errors.push(message.text());
  });
  const routes = [
    ['overview', '/', 'Overview'],
    ['journal', '/activities', 'Journal'],
    ['new-activity', '/activities/new', 'New activity'],
    [
      'edit-activity',
      `/activities/${f.activities[0]!.id}/edit`,
      'Edit activity',
    ],
    ['activity-detail', `/activities/${f.activities[0]!.id}`, 'Entry 01'],
    ['goals', '/goals', 'Goals'],
    ['goal-detail', `/goals/${f.goal.id}`, f.goal.name],
    ['new-goal', '/goals/new', 'Create goal'],
    ['edit-goal', `/goals/${f.goal.id}/edit`, 'Edit goal'],
    ['progress', '/progress/trends', 'Progress'],
    ['kinds', '/activity-kinds', 'Activity kinds'],
    ['kind-detail', `/activity-kinds/${f.kind.id}`, f.kind.name],
    ['settings', '/settings', 'Settings'],
    ['tags', '/tags', 'Tags'],
    ['not-found', '/unknown-page', 'Page not found'],
  ] as const;
  for (const width of [1920, 1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, path, heading] of routes) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(
        page.getByRole('status').filter({ hasText: /^Loading/ }),
      ).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath(`${width}-${name}.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width}-${name}`,
      ).toBe(true);
      if (width === 320) {
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          result.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          })),
          name,
        ).toEqual([]);
      }
    }
    await page.goto(`/activity-kinds/${f.kind.id}`);
    for (const [name, label] of [
      ['kind', 'Edit activity kind'],
      ['variant', 'Add variant'],
      ['measurement', 'Add measurement'],
    ] as const) {
      await page.getByRole('button', { name: label, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`${width}-${name}-dialog.png`),
        fullPage: false,
      });
      expect(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(
        true,
      );
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
    await page.goto('/tags');
    await page.getByRole('button', { name: 'New tag', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`${width}-tag-dialog.png`),
      fullPage: false,
    });
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);
});

test('mobile navigation supports keyboard entry, exit, current route and short viewports', async ({
  page,
}, info) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto('/settings');
  const toggle = page.getByRole('button', { name: 'Navigation', exact: true });
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(
    nav.getByRole('link', { name: 'Settings', exact: true }),
  ).toBeFocused();
  await expect(nav.getByRole('link')).toHaveCount(6);
  await expect(
    nav.getByRole('link', { name: 'Settings', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: info.outputPath('short-mobile-menu.png') });
  await page.keyboard.press('Tab');
  await expect(nav).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: /Switch to .* theme/ }),
  ).toBeFocused();
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.getByRole('button', { name: /Switch to .* theme/ }).click();
  await expect(nav).not.toBeVisible();
  await toggle.click();
  await nav.getByRole('link', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
});

test('goal reference failure is recoverable without losing input or producing runtime errors', async ({
  page,
}) => {
  const f = await setup(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/goals/new');
  await page.getByLabel('Name *', { exact: true }).fill('Keep this goal');
  await page.route(`**/api/v1/activity-kinds/${f.kind.id}/variants*`, (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: 'UNAVAILABLE',
          message: 'Unavailable',
          requestId: '11111111-1111-4111-8111-111111111111',
        },
      },
    }),
  );
  await page
    .getByRole('combobox', { name: 'Activity kind *', exact: true })
    .selectOption(f.kind.id);
  await expect(page.getByRole('alert')).toContainText(
    '11111111-1111-4111-8111-111111111111',
  );
  await expect(
    page.getByRole('button', { name: 'Create goal', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Name *', { exact: true })).toHaveValue(
    'Keep this goal',
  );
  await page.unroute(`**/api/v1/activity-kinds/${f.kind.id}/variants*`);
  await page
    .getByRole('button', { name: 'Retry variants and measurements' })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Create goal', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Name *', { exact: true })).toHaveValue(
    'Keep this goal',
  );
  expect(errors).toEqual([]);
});
