import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { journalFixture } from '../test/support/journal.js';
import { validMeasurement } from '../test/support/activity-editor.js';
import { journalPath } from '../src/features/journal/state.js';
async function setup(page: Page, count = 30) {
  const f = await journalFixture(count);
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
  return f;
}
async function shot(page: Page, info: TestInfo, name: string) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: name.startsWith('historical'),
  });
}
const rows = (page: Page) => page.locator('activity-journal-page .row');
test('journal detail and editor preserve context and refresh saved values', async ({
  page,
}, info) => {
  const f = await setup(page);
  const context = journalPath({
    activityKindId: f.kind.id,
    dateFrom: '2026-01-01',
  });
  await page.goto(context);
  await expect(rows(page)).toHaveCount(25);
  await shot(page, info, 'journal-populated');
  await page.getByRole('link', { name: 'Entry 01', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Entry 01', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Along the river', { exact: false }),
  ).toBeVisible();
  await shot(page, info, 'activity-detail');
  await page.getByRole('link', { name: 'Edit activity', exact: true }).click();
  await page
    .getByText('Start time and name (optional)', { exact: true })
    .click();
  await page
    .getByLabel('Activity name (optional)', { exact: true })
    .fill('Updated river walk');
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Updated river walk', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Back to journal', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp('activityKindId=' + f.kind.id));
  await expect(
    page.getByRole('link', { name: 'Updated river walk', exact: true }),
  ).toBeVisible();
  await rows(page).first().locator('summary').click();
  await page.getByRole('link', { name: 'Edit activity', exact: true }).click();
  await page.getByLabel('Minutes', { exact: true }).fill('10');
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Journal', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View saved activity', exact: true }),
  ).toBeVisible();
});
test('full-year Walking and Treadmill with all tags survives URL reload and filter removal', async ({
  page,
}, info) => {
  const f = await setup(page);
  await page.goto('/activities');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Filter journal' });
  await dialog.getByLabel('From date', { exact: true }).fill('2026-01-01');
  await dialog.getByLabel('Through date', { exact: true }).fill('2026-12-31');
  await dialog
    .getByLabel('Activity kind', { exact: true })
    .selectOption(f.kind.id);
  await dialog
    .getByLabel('Variant', { exact: true })
    .selectOption(f.otherVariant.id);
  await dialog.getByLabel('Match tags', { exact: true }).selectOption('all');
  await dialog.getByLabel('Commute', { exact: true }).check();
  await dialog.getByLabel('With dog', { exact: true }).check();
  await shot(page, info, 'journal-filters');
  await dialog
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  await expect(rows(page)).toHaveCount(15);
  await expect(page).toHaveURL(/tagMatch=all/);
  await expect(page.getByRole('button', { name: /^Filters/ })).toBeFocused();
  await shot(page, info, 'journal-filtered');
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(rows(page)).toHaveCount(15);
  await page
    .getByRole('button', { name: 'Remove filter: Treadmill', exact: true })
    .click();
  await expect(page).not.toHaveURL(/activityVariantId=/);
  await page.goBack();
  await expect(page).toHaveURL(url);
  await expect(rows(page)).toHaveCount(15);
});
test('load more retains results on failure, retries once and reaches the end', async ({
  page,
}, info) => {
  await setup(page, 35);
  let fail = true;
  let requests = 0;
  await page.route('**/api/v1/activities?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('offset') === '25') {
      requests++;
      if (fail) {
        await route.abort('failed');
        return;
      }
    }
    await route.fallback();
  });
  await page.goto('/activities');
  await expect(rows(page)).toHaveCount(25);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Retry loading more', exact: true }),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(25);
  await shot(page, info, 'later-page-error');
  fail = false;
  await page
    .getByRole('button', { name: 'Retry loading more', exact: true })
    .click();
  await expect(rows(page)).toHaveCount(35);
  await expect(
    page.getByRole('button', { name: 'All activities loaded', exact: true }),
  ).toBeFocused();
  expect(requests).toBe(2);
  await expect(rows(page).locator('.title')).toHaveCount(35);
});
test('delete requires a precise permanent confirmation and reconciles list and detail', async ({
  page,
}, info) => {
  const f = await setup(page, 3);
  await page.goto('/activities');
  await rows(page).first().locator('summary').click();
  await page
    .getByRole('button', { name: 'Delete activity', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Delete activity?' });
  await expect(dialog).toContainText('Walking');
  await expect(dialog).toContainText('permanently');
  await shot(page, info, 'delete-confirmation');
  await dialog
    .getByRole('button', { name: 'Keep activity', exact: true })
    .click();
  await expect(rows(page)).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Delete activity', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Delete activity', exact: true })
    .click();
  await expect(rows(page)).toHaveCount(2);
  await expect(
    page.getByRole('heading', { name: 'Journal', exact: true }),
  ).toBeFocused();
  expect(f.deps.rows.size).toBe(2);
  await rows(page).first().locator('.title').click();
  await page
    .getByRole('button', { name: 'Delete activity', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Delete activity', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Journal', exact: true }),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
});
test('empty, filtered-empty, initial error, retry and invalid URL states', async ({
  page,
}, info) => {
  const f = await setup(page, 0);
  let fail = true;
  await page.route('**/api/v1/activities?*', async (route) => {
    if (fail) await route.abort('failed');
    else await route.fallback();
  });
  await page.goto('/activities?dateFrom=invalid&offset=200&search=ignored');
  await expect(
    page.getByRole('button', { name: 'Retry activities', exact: true }),
  ).toBeVisible();
  await shot(page, info, 'initial-error');
  fail = false;
  await page
    .getByRole('button', { name: 'Retry activities', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Record your first activity', exact: true }),
  ).toBeVisible();
  await shot(page, info, 'empty-journal');
  await page.goto(
    journalPath({ dateFrom: '2020-01-01', activityKindId: f.kind.id }),
  );
  await expect(
    page.getByRole('heading', {
      name: 'No activities match these filters',
      exact: true,
    }),
  ).toBeVisible();
  await shot(page, info, 'filtered-empty');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(page).toHaveURL(/\/activities$/);
});
test('historical long names, measurements and tags remain readable in journal and detail', async ({
  page,
}, info) => {
  const f = await setup(page, 2);
  const id = f.activities[0]!.id;
  const extra = await f.deps.measurements.create(f.kind.id, {
    ...validMeasurement,
    name: 'Elevation gained along the route',
    sortOrder: 2,
    isRequired: false,
  });
  const another = await f.deps.measurements.create(f.kind.id, {
    ...validMeasurement,
    name: 'Distance over uneven ground',
    sortOrder: 3,
    isRequired: false,
  });
  const tags = [];
  for (let i = 0; i < 6; i++)
    tags.push(
      await f.deps.tags.create({
        name: `Context ${i + 1} with a longer descriptive name`,
        color: i % 2 ? '#67318F' : null,
      }),
    );
  await f.api.updateActivity(id, {
    name: 'A long activity name for a quiet walk along the river and through the old town',
    tagIds: tags.map((t) => t.id),
    measurements: [
      {
        measurementDefinitionId: f.distance.id,
        valueType: 'decimal',
        value: '0',
        unitId: 'metre',
      },
      {
        measurementDefinitionId: extra.id,
        valueType: 'decimal',
        value: '1234.5',
        unitId: 'metre',
      },
      {
        measurementDefinitionId: another.id,
        valueType: 'decimal',
        value: '9876.5',
        unitId: 'metre',
      },
    ],
    notes:
      'A recorded observation.\n<img src=x onerror=alert(1)>\nPlain text, with line breaks.',
  });
  f.deps.activityKinds.rows.get(f.kind.id)!.archivedAt = new Date();
  f.deps.variants.rows.get(f.variant.id)!.archivedAt = new Date();
  f.deps.measurements.rows.get(f.distance.id)!.archivedAt = new Date();
  for (const t of tags) f.deps.tags.rows.get(t.id)!.archivedAt = new Date();
  await page.goto('/activities');
  await expect(rows(page)).toHaveCount(2);
  await shot(page, info, 'historical-journal');
  await rows(page).first().locator('.title').focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Plain text, with line breaks.', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('activity-detail-page .notes img')).toHaveCount(0);
  await expect(
    page.getByText('Elevation gained along the route', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Distance over uneven ground', { exact: true }),
  ).toBeVisible();
  await shot(page, info, 'historical-detail');
  const sparseKind = await f.api.createKind({
    name: 'Stretching',
    iconName: 'activity',
    color: '#67318F',
    sortOrder: 1,
  });
  const response = await f.app.request('/api/v1/activities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activityKindId: sparseKind.id,
      activityDate: '2026-09-08',
      measurements: [],
    }),
  });
  expect(response.status).toBe(201);
  await page.goto(journalPath({ activityKindId: sparseKind.id }));
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).locator('.measure')).toHaveCount(0);
  await shot(page, info, 'minimal-journal');
});
test('creation outside current filters opens saved detail without inventing a matching journal row', async ({
  page,
}) => {
  const f = await setup(page, 1);
  const context = journalPath({ dateFrom: '2026-01-01', dateTo: '2026-12-31' });
  await page.goto(context);
  await page.getByRole('link', { name: 'New activity', exact: true }).click();
  await page
    .getByLabel('Activity kind (required)', { exact: true })
    .selectOption(f.kind.id);
  await page.locator(`#m-${f.distance.id}`).fill('1');
  await page
    .getByLabel('Activity date (required)', { exact: true })
    .fill('2020-01-01');
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Activity saved.');
  await page
    .getByRole('link', { name: 'Back to journal', exact: true })
    .click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page).toHaveURL(/dateFrom=2026/);
});
test('keyboard filters validate custom dates and delete failure retains the record', async ({
  page,
}, info) => {
  const f = await setup(page, 1);
  await page.goto('/activities');
  await page.getByRole('button', { name: 'Filters', exact: true }).focus();
  await page.keyboard.press('Enter');
  const filters = page.getByRole('dialog', { name: 'Filter journal' });
  await filters.getByLabel('From date', { exact: true }).fill('2027-01-01');
  await filters.getByLabel('Through date', { exact: true }).fill('2026-01-01');
  await filters
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  await expect(filters.getByLabel('From date', { exact: true })).toBeFocused();
  await shot(page, info, 'filter-validation');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Filters', exact: true }),
  ).toBeFocused();
  await page.route(
    `**/api/v1/activities/${f.activities[0]!.id}`,
    async (route) => {
      if (route.request().method() === 'DELETE') await route.abort('failed');
      else await route.fallback();
    },
  );
  await rows(page).first().locator('summary').click();
  await page
    .getByRole('button', { name: 'Delete activity', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Delete activity?' });
  await dialog
    .getByRole('button', { name: 'Delete activity', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'server could not be reached',
  );
  expect(f.deps.rows.size).toBe(1);
  await shot(page, info, 'delete-error');
});
test.use({ timezoneId: 'Europe/Helsinki' });
