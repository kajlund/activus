import { test, expect, type Locator } from '@playwright/test';
import {
  editorFixture,
  validMeasurement,
} from '../test/support/activity-editor.js';
import { editorSection } from './editor-section.js';

test('compact editor, live themes, keyboard accordion and persisted summaries', async ({
  page,
}, info) => {
  const f = await editorFixture();
  const duration = await f.deps.measurements.create(f.kind.id, {
    ...validMeasurement,
    name: 'Duration',
    valueType: 'duration',
    canonicalUnit: 'second',
    displayUnit: 'hour-minute',
    precision: null,
    isRequired: true,
  });
  for (let i = 0; i < 16; i++)
    await f.deps.measurements.create(f.kind.id, {
      ...validMeasurement,
      name: `Additional measurement ${i + 1}`,
      sortOrder: i + 1,
    });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const response = await f.app.request(url.pathname + url.search, {
      method: request.method(),
      headers: { 'Content-Type': 'application/json' },
      ...(request.postData() ? { body: request.postData()! } : {}),
    });
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  await page.goto('/activities/new');
  await page
    .locator(`input[name="activityKind"][value="${f.kind.id}"]`)
    .check();
  await expect(page.locator('input[name=activityVariant]:checked')).toHaveValue(
    f.variant.id,
  );
  await page.locator('#timing-trigger').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#activity-trigger')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.getByLabel('Hours', { exact: true }).fill('1');
  await page.getByLabel('Minutes', { exact: true }).fill('2');
  await page.getByLabel('Seconds', { exact: true }).fill('18');
  await page.getByLabel('Start time', { exact: true }).fill('18:15');
  await expect(page.locator('#m-' + duration.id)).toHaveCount(0);
  await editorSection(page, 'measurements');
  await page.locator(`#m-${f.distance.id}`).fill('4.86');
  await editorSection(page, 'context');
  await page.getByLabel('Notes', { exact: true }).fill('Evening walk');
  await page.getByLabel('Commute', { exact: true }).check();
  await page.getByText('Effort and feeling', { exact: true }).click();
  await page.locator('#effort').fill('3');
  await page.locator('#feeling').fill('4');
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
    [820, 1180],
    [390, 844],
    [320, 844],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    for (const section of [
      'activity',
      'timing',
      'measurements',
      'context',
    ] as const) {
      await editorSection(page, section);
      await page.screenshot({
        path: info.outputPath('section-' + width + '-' + section + '.png'),
      });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await expect(
        page.getByRole('button', { name: 'Save activity', exact: true }),
      ).toBeInViewport();
      if (width! >= 1440) {
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollHeight <= innerHeight,
            ),
          )
          .toBe(true);
        await expect(
          page.getByRole('button', { name: 'Save activity', exact: true }),
        ).toBeInViewport();
        for (const id of ['activity', 'timing', 'measurements', 'context'])
          await expect(page.locator(`#${id}-trigger`)).toBeInViewport();
      }
    }
    await page.screenshot({
      path: info.outputPath(`editor-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  if ((await page.locator('html').getAttribute('data-theme')) !== 'dark')
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: info.outputPath('editor-dark.png') });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('#context-trigger')).toContainText('Evening walk');
  await expect(page.locator('#timing-trigger')).toContainText('1 h 2 min');
  await expect(page.locator('#measurements-trigger')).toContainText('4.86');
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Edit activity', exact: true }),
  ).toBeVisible();
  const saved = await f.api.getActivity(
    new URL(page.url()).pathname.split('/')[2]!,
  );
  expect(saved.durationSeconds).toBe(3738);
  expect(
    saved.measurements.find((m) => m.measurementDefinitionId === duration.id)
      ?.canonicalValue,
  ).toBe(3738);
  await page.getByRole('link', { name: 'Edit activity', exact: true }).click();
  await expect(
    page.locator('.accordion-trigger[aria-expanded="true"]'),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Switch to dark theme' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#context-trigger')).toContainText('Evening walk');
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const section of [
    'activity',
    'timing',
    'measurements',
    'context',
  ] as const) {
    await editorSection(page, section);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
      )
      .toBe(true);
  }
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Edit activity', exact: true }),
  ).toBeVisible();
});

test('kind tiles scale, keyboard selection works, and mobile navigation dismisses', async ({
  page,
}) => {
  const f = await editorFixture();
  for (let i = 0; i < 20; i++)
    await f.api.createKind({
      name: 'Exercise ' + (i + 1),
      iconName: 'activity',
      color: '#67318F',
      sortOrder: i + 1,
    });
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const response = await f.app.request(url.pathname + url.search, {
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/activities/new');
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(6);
  await expect(
    page.getByRole('link', { name: 'Record activity', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Navigation', exact: true }),
  ).not.toBeVisible();
  await page.getByLabel('Find activity kind').fill('Walking');
  await expect(page.locator('input[name=activityKind]')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Walking', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('radio', { name: 'Walking', exact: true }),
  ).toBeChecked();
  await page.getByRole('radio', { name: 'Outdoor', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('radio', { name: 'Treadmill', exact: true }),
  ).toBeChecked();
  await page.getByLabel('Find activity kind').fill('');
  await expect(page.locator('input[name=activityKind]')).toHaveCount(21);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole('button', { name: 'Navigation', exact: true });
  await menu.click();
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(page.getByRole('navigation')).not.toBeVisible();
  await menu.click();
  await page.getByRole('main').click({ position: { x: 4, y: 10 } });
  await expect(page.getByRole('navigation')).not.toBeVisible();
  await menu.click();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await expect(page).toHaveURL(/settings$/);
  await expect(page.getByRole('navigation')).not.toBeVisible();
});

test('records an activity using only the keyboard', async ({ page }) => {
  const f = await editorFixture();
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const response = await f.app.request(url.pathname + url.search, {
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
  async function tabTo(target: Locator) {
    for (let i = 0; i < 80; i++) {
      if (
        await target.evaluate(
          (el) =>
            (el.getRootNode() as Document | ShadowRoot).activeElement === el,
        )
      )
        break;
      await page.keyboard.press('Tab');
    }
    await expect(target).toBeFocused();
  }
  await page.goto('/activities/new');
  await tabTo(page.getByRole('radio', { name: 'Walking', exact: true }));
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('radio', { name: 'Outdoor', exact: true }),
  ).toBeChecked();
  await tabTo(page.locator('#timing-trigger'));
  await page.keyboard.press('Enter');
  for (const [id, value] of [
    ['hours', '1'],
    ['minutes', '2'],
    ['seconds', '18'],
  ]) {
    await tabTo(page.locator('#' + id));
    await page.keyboard.insertText(value!);
  }
  await tabTo(page.locator('#measurements-trigger'));
  await page.keyboard.press('Enter');
  await tabTo(page.locator('#m-' + f.distance.id));
  await page.keyboard.insertText('4.86');
  await tabTo(page.locator('#context-trigger'));
  await page.keyboard.press('Enter');
  await tabTo(page.getByRole('checkbox', { name: 'Commute', exact: true }));
  await page.keyboard.press('Space');
  await tabTo(page.getByLabel('Notes', { exact: true }));
  await page.keyboard.insertText('Keyboard entry');
  await tabTo(page.getByText('Effort and feeling', { exact: true }));
  await page.keyboard.press('Enter');
  await tabTo(page.locator('#effort'));
  await page.keyboard.insertText('3');
  await tabTo(page.locator('#feeling'));
  await page.keyboard.insertText('4');
  await tabTo(page.getByRole('button', { name: 'Save activity', exact: true }));
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('link', { name: 'Edit activity', exact: true }),
  ).toBeVisible();
  const saved = await f.api.getActivity(
    new URL(page.url()).pathname.split('/')[2]!,
  );
  expect(saved.durationSeconds).toBe(3738);
  expect(saved.notes).toBe('Keyboard entry');
  expect(saved.tags.map((t) => t.name)).toEqual(['Commute']);
  expect(saved.effort).toBe(3);
  expect(saved.feeling).toBe(4);
});
