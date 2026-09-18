import { editorSection } from './editor-section.js';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { journalFixture } from '../test/support/journal.js';
import { journalPath } from '../src/features/journal/state.js';

async function setup(page: Page, count = 2) {
  const f = await journalFixture(count);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // This activity fixture has no goal repository; model its empty matching goals.
    if (url.pathname.startsWith('/api/v1/goals/for-activity/')) {
      await route.fulfill({
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
      return;
    }
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
  return f;
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    name,
  ).toBe(true);
}
async function accessibility(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}

test('core journey joins configuration, entry, filters, editing and archived history', async ({
  page,
}, info) => {
  const f = await setup(page, 0);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      errors.push(message.text());
  });
  await page.goto('/activity-kinds');
  await page
    .getByRole('button', { name: 'Add activity kind', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Journal walking');
  await dialog
    .getByRole('button', { name: 'Add activity kind', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('link', { name: /Journal walking/ }).click();
  for (const name of ['Outdoor', 'Treadmill']) {
    await page
      .getByRole('button', { name: 'Add variant', exact: true })
      .click();
    await dialog.getByLabel('Name', { exact: true }).fill(name);
    await dialog
      .getByRole('button', { name: 'Add variant', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  }
  const kindId = new URL(page.url()).pathname.split('/')[2]!;
  await page
    .getByRole('button', { name: 'Add measurement', exact: true })
    .click();
  await dialog.getByLabel('Name', { exact: true }).fill('Distance');
  await dialog
    .getByLabel('Display unit', { exact: true })
    .selectOption('kilometre');
  await dialog.getByLabel('Required for normal entries').check();
  await dialog
    .getByRole('button', { name: 'Add measurement', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await capture(page, info, '01-configuration');
  await accessibility(page);
  await page.goto('/tags');
  await page
    .getByRole('button', { name: 'New tag', exact: true })
    .first()
    .click();
  await dialog.getByLabel('Name', { exact: true }).fill('Recovery walk');
  await dialog.getByRole('button', { name: 'Create tag', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto('/activities');
  await page.getByRole('link', { name: 'New activity', exact: true }).click();
  await editorSection(page, 'activity');
  await page.locator(`input[name="activityKind"][value="${kindId}"]`).check();
  await editorSection(page, 'activity');
  await page.getByRole('radio', { name: 'Treadmill', exact: true }).check();
  await editorSection(page, 'timing');
  await page.getByLabel('Activity date *', { exact: true }).fill('2026-01-15');
  await editorSection(page, 'measurements');
  await page.getByLabel('Distance *', { exact: true }).fill('2.5');
  await editorSection(page, 'context');
  await page.getByLabel('Recovery walk', { exact: true }).check();
  await capture(page, info, '02-entry');
  await accessibility(page);
  await page
    .getByRole('button', { name: /^Save (activity|changes)$/, exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Edit activity', exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const saved = await f.api.getActivity(id);
  const filtered = journalPath({
    dateFrom: '2026-01-01',
    dateTo: '2026-12-31',
    activityKindId: kindId,
    activityVariantId: saved.activityVariantId!,
    tagIds: saved.tags.map((t) => t.id),
    tagMatch: 'all',
  });
  await page.goto(filtered);
  await expect(page.locator('activity-journal-page .row')).toHaveCount(1);
  await capture(page, info, '03-filtered-journal');
  await accessibility(page);
  await page.locator('activity-journal-page .title').click();
  await page.getByRole('link', { name: 'Edit activity', exact: true }).click();
  await editorSection(page, 'context');
  await page
    .getByLabel('Notes', { exact: true })
    .fill('A factual observation.');
  await page
    .getByRole('button', { name: /^Save (activity|changes)$/, exact: true })
    .click();
  await expect(
    page.getByText('A factual observation.', { exact: true }),
  ).toBeVisible();
  await f.api.archiveTag(saved.tags[0]!.id);
  await f.api.archiveVariant(saved.activityVariantId!);
  await f.api.archiveMeasurement(
    saved.measurements[0]!.measurementDefinitionId,
  );
  await f.api.archiveKind(kindId);
  await page.reload();
  await expect(page.locator('journal-entry-details')).toContainText('archived');
  // Installed browsers may retain OS regional number formatting even when
  // their requested language is en-US. Assert the exact localized quantity.
  const distanceText = await page.evaluate(
    () => `${new Intl.NumberFormat().format(2.5)} km`,
  );
  await expect(
    page
      .locator('journal-entry-details')
      .getByText(distanceText, { exact: true }),
  ).toBeVisible();
  await capture(page, info, '04-historical-detail');
  await accessibility(page);
  expect(errors).toEqual([]);
});

test('dirty configuration cancel, pending mutation and browser history preserve work', async ({
  page,
}, info) => {
  const f = await setup(page);
  await page.goto('/activities');
  await page.getByRole('link', { name: 'New activity', exact: true }).click();
  await editorSection(page, 'activity');
  await page
    .locator(`input[name="activityKind"][value="${f.kind.id}"]`)
    .check();
  page.once('dialog', (d) => d.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(/\/activities\/new(?:\?|$)/);
  page.once('dialog', (d) => d.accept());
  await page.goBack();
  await expect(page).toHaveURL(/\/activities$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/activities\/new(?:\?|$)/);
  await page.goto(`/activity-kinds/${f.kind.id}`);
  await page
    .getByRole('button', { name: 'Edit activity kind', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Walking revised');
  await page.keyboard.press('Escape');
  await expect(
    dialog.getByRole('button', { name: 'Keep editing' }),
  ).toBeFocused();
  await capture(page, info, 'dirty-kind');
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(
    'Walking revised',
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/v1/activity-kinds/${f.kind.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      await gate;
      await route.abort();
    } else await route.fallback();
  });
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole('alert')).toContainText(
    'server could not be reached',
  );
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(
    'Walking revised',
  );
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard changes' }).click();
  await expect(dialog).not.toBeVisible();
});

test('routes, mobile navigation, reflow, zoom and accessible forms', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const f = await setup(page);
  await f.api.updateActivity(f.activities[0]!.id, {
    measurements: [
      {
        measurementDefinitionId: f.distance.id,
        valueType: 'decimal',
        value: '9007199254740990.12',
        unitId: 'metre',
      },
    ],
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Each theme is exercised at narrow phone, tablet, desktop and wide widths.
  for (const width of [320, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, path, heading] of [
      ['kinds', '/activity-kinds', 'Activity kinds'],
      ['configuration', `/activity-kinds/${f.kind.id}`, 'Walking'],
      ['tags', '/tags', 'Tags'],
      ['entry', '/activities/new', 'New activity'],
      ['edit', `/activities/${f.activities[0]!.id}/edit`, 'Edit activity'],
      ['journal', '/activities', 'Journal'],
      ['detail', `/activities/${f.activities[0]!.id}`, 'Entry 01'],
      ['settings', '/settings', 'Settings'],
    ]) {
      await page.goto(path!);
      await expect(
        page.getByRole('heading', { name: heading!, exact: true }).first(),
      ).toBeVisible();
      if (name === 'entry') {
        await editorSection(page, 'activity');
        await page
          .locator(`input[name="activityKind"][value="${f.kind.id}"]`)
          .check();
      }
      await capture(page, info, `${width}-${name}`);
      if (width === 320) await accessibility(page);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/activities');
  await expect(
    page.getByRole('heading', { name: 'Journal', exact: true }),
  ).toBeVisible();
  await page.addStyleTag({ content: 'html { zoom: 2; }' });
  await capture(page, info, '200-percent-css-zoom');
  await page.goto('/not-an-activus-route');
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
  await expect(page).toHaveTitle('Page not found · Activus');
  await page.getByRole('link', { name: 'Return to journal' }).click();
  await expect(page).toHaveTitle('Journal · Activus');
  await expect(page.getByRole('main')).toBeFocused();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Goals', exact: true })
    .focus();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Navigation', exact: true }),
  ).toBeFocused();
  await expect(page.getByRole('navigation')).not.toBeVisible();
});
test.use({ timezoneId: 'Europe/Helsinki', locale: 'en-US' });
