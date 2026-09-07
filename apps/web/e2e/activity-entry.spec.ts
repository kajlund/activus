import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { CreateActivityRequestSchema } from '@activus/contracts';
import {
  editorFixture,
  validMeasurement,
} from '../test/support/activity-editor.js';

async function setup(page: Page) {
  const f = await editorFixture();
  // All application requests use real Hono routes with isolated repositories.
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const response = await f.app.request(
      new URL(request.url()).pathname + new URL(request.url()).search,
      {
        method: request.method(),
        headers: { 'Content-Type': 'application/json' },
        ...(request.postData() ? { body: request.postData()! } : {}),
      },
    );
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
    fullPage: true,
  });
}
async function choose(page: Page, f: Awaited<ReturnType<typeof setup>>) {
  await page
    .getByLabel('Activity kind (required)', { exact: true })
    .selectOption(f.kind.id);
  await expect(
    page.getByLabel('Variant (optional)', { exact: true }),
  ).toHaveValue(f.variant.id);
  await expect(page.locator(`#m-${f.distance.id}`)).toBeVisible();
}
test('create with measurements and multiple tags, then edit and verify persisted API values', async ({
  page,
}, info) => {
  const f = await setup(page);
  await page.goto('/');
  await page
    .getByRole('link', { name: 'Record activity', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'New activity' }),
  ).toBeVisible();
  await choose(page, f);
  await page
    .getByLabel('Activity date (required)', { exact: true })
    .fill('2026-09-06');
  await page.getByLabel('Hours', { exact: true }).fill('1');
  await page.getByLabel('Minutes', { exact: true }).fill('25');
  await page.locator(`#m-${f.distance.id}`).fill('4.12567');
  await page.getByLabel('Commute', { exact: true }).check();
  await page.getByLabel('With dog', { exact: true }).check();
  await page
    .getByLabel('Notes (optional)', { exact: true })
    .fill('Along the river\nEvening entry');
  await shot(page, info, 'new-filled');
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Edit activity' }),
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Activity saved.' }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/')[2]!;
  expect((await f.api.getActivity(id)).measurements[0]?.canonicalValue).toBe(
    '4125.67',
  );
  expect((await f.api.getActivity(id)).tags).toHaveLength(2);
  await page.getByLabel('Minutes', { exact: true }).fill('26');
  await page
    .getByLabel('Notes (optional)', { exact: true })
    .fill('Revised note');
  await page
    .getByRole('button', { name: 'Remove With dog', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect
    .poll(async () => (await f.api.getActivity(id)).durationSeconds)
    .toBe(5160);
  expect((await f.api.getActivity(id)).tags.map((t) => t.name)).toEqual([
    'Commute',
  ]);
  await page.reload();
  await expect(
    page.getByLabel('Notes (optional)', { exact: true }),
  ).toHaveValue('Revised note');
  await shot(page, info, 'edit-saved');
});
test('switch variants, recover values, exclude incompatible measurements and protect dirty navigation', async ({
  page,
}, info) => {
  const f = await setup(page);
  await page.goto('/activities/new');
  await choose(page, f);
  await page.locator(`#m-${f.distance.id}`).fill('2');
  await page
    .getByLabel('Variant (optional)', { exact: true })
    .selectOption(f.otherVariant.id);
  await page.locator(`#m-${f.incline.id}`).fill('4');
  await page
    .getByLabel('Variant (optional)', { exact: true })
    .selectOption(f.variant.id);
  await expect(page.getByText(/Kept while you edit/)).toBeVisible();
  await shot(page, info, 'recoverable-values');
  await page
    .getByLabel('Variant (optional)', { exact: true })
    .selectOption(f.otherVariant.id);
  await expect(page.locator(`#m-${f.incline.id}`)).toHaveValue('4');
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('unsaved activity');
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/activities\/new$/);
  await expect(page.locator(`#m-${f.incline.id}`)).toHaveValue('4');
  await page
    .getByLabel('Variant (optional)', { exact: true })
    .selectOption(f.variant.id);
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(page).toHaveURL(/\/edit\?saved=1$/);
  const a = await f.api.getActivity(
    new URL(page.url()).pathname.split('/')[2]!,
  );
  expect(a.measurements.map((m) => m.measurementDefinitionId)).toEqual([
    f.distance.id,
  ]);
});
test('historical archived references retain exact values with long labels and keyboard focus', async ({
  page,
}, info) => {
  const f = await setup(page);
  const a = await f.api.createActivity(
    CreateActivityRequestSchema.parse({
      activityKindId: f.kind.id,
      activityVariantId: f.variant.id,
      activityDate: '2026-10-25',
      startedAt: '2026-10-25T01:30:01.123Z',
      durationSeconds: 3601,
      measurements: [
        {
          measurementDefinitionId: f.distance.id,
          valueType: 'decimal',
          value: '1234567.89',
        },
      ],
      tagIds: [f.tag.id, f.otherTag.id],
    }),
  );
  f.deps.activityKinds.rows.get(f.kind.id)!.archivedAt = new Date();
  f.deps.variants.rows.get(f.variant.id)!.archivedAt = new Date();
  Object.assign(f.deps.measurements.rows.get(f.distance.id)!, {
    archivedAt: new Date(),
    name: 'Recorded distance along the exceptionally long riverside walking route',
  });
  f.deps.tags.rows.get(f.tag.id)!.archivedAt = new Date();
  await page.goto(`/activities/${a.id}/edit`);
  await expect(
    page.getByLabel('Activity kind (required)', { exact: true }),
  ).toHaveValue(f.kind.id);
  await expect(
    page.getByRole('button', {
      name: 'Remove Commute (archived)',
      exact: true,
    }),
  ).toBeVisible();
  await page.locator(`#m-${f.distance.id}`).focus();
  await page.keyboard.press('Tab');
  await shot(page, info, 'archived-edit');
  await page
    .getByLabel('Notes (optional)', { exact: true })
    .fill('Only this note changes');
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(page).toHaveURL(/saved=1$/);
  const after = await f.api.getActivity(a.id);
  expect(after.startedAt).toBe(a.startedAt);
  expect(after.measurements[0]?.canonicalValue).toBe('1234567.89');
});
test('loading, no variants or measurements, and no tags remain calm and actionable', async ({
  page,
}, info) => {
  const f = await setup(page);
  f.deps.tags.rows.clear();
  const kind = await f.api.createKind({
    name: 'Stretching',
    iconName: 'person-standing',
    color: '#67318F',
    sortOrder: 1,
  });
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route('**/api/v1/activity-kinds?*', async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto('/activities/new');
  await expect(
    page.getByRole('status').filter({ hasText: 'Loading activity' }),
  ).toBeVisible();
  await shot(page, info, 'loading');
  release();
  await page
    .getByLabel('Activity kind (required)', { exact: true })
    .selectOption(kind.id);
  await expect(
    page.getByLabel('Variant (optional)', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('No active tags available. Tags are optional.'),
  ).toBeVisible();
  await expect(page.getByText('0 configured measurements.')).toBeVisible();
  await shot(page, info, 'minimal-entry');
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(page).toHaveURL(/\/edit\?saved=1$/);
});
test('long configuration, typed fields, validation, pending save and save failure', async ({
  page,
}, info) => {
  const f = await setup(page);
  const longTags: string[] = [];
  for (let i = 0; i < 5; i++) {
    const name = `Context ${i + 1}: a long descriptive label for a shared activity`;
    await f.deps.tags.create({ name, color: null });
    longTags.push(name);
  }
  for (let i = 0; i < 7; i++)
    await f.deps.measurements.create(f.kind.id, {
      ...validMeasurement,
      name: `Additional measurement ${i + 1} with a deliberately long descriptive label`,
      sortOrder: i + 1,
    });
  await f.deps.measurements.create(f.kind.id, {
    ...validMeasurement,
    name: 'Moving time',
    valueType: 'duration',
    canonicalUnit: 'second',
    displayUnit: 'hour-minute',
    precision: null,
  });
  await page.goto('/activities/new');
  await choose(page, f);
  for (const name of longTags)
    await page.getByLabel(name, { exact: true }).check();
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(page.locator(`#m-${f.distance.id}`)).toBeFocused();
  await shot(page, info, 'validation-long-form');
  await page.locator(`#m-${f.distance.id}`).fill('0.00001');
  await page
    .getByLabel('Moving time (optional)', { exact: true })
    .fill('1:25:01');
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route('**/api/v1/activities', async (route) => {
    await gate;
    await route.abort('failed');
  });
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Saving…', exact: true }),
  ).toBeDisabled();
  await shot(page, info, 'pending-save');
  release();
  await expect(page.getByRole('alert')).toContainText(
    'server could not be reached',
  );
  await expect(page.locator(`#m-${f.distance.id}`)).toHaveValue('0.00001');
  await shot(page, info, 'save-error');
});
test('read error and retry, keyboard tags and browser-back unsaved protection', async ({
  page,
}, info) => {
  const f = await setup(page);
  let fail = true;
  await page.route('**/api/v1/tags?*', async (route) => {
    if (fail) await route.abort('failed');
    else await route.fallback();
  });
  await page.goto('/activities');
  await page.getByRole('link', { name: 'Record activity' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'server could not be reached',
  );
  await shot(page, info, 'load-error');
  fail = false;
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await choose(page, f);
  await page.getByLabel('Search tags', { exact: true }).fill('dog');
  await page.getByLabel('With dog', { exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('button', { name: 'Remove With dog', exact: true }),
  ).toBeVisible();
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    await dialog.dismiss();
  });
  await page.goBack();
  await expect(page).toHaveURL(/\/activities\/new$/);
  await expect(
    page.getByRole('button', { name: 'Remove With dog', exact: true }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/activities$/);
});
test('date and time preserve the journal day across Helsinki daylight-saving changes', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-09-06T12:00:00Z'));
  const f = await setup(page);
  await page.goto('/activities/new');
  await choose(page, f);
  await page.locator(`#m-${f.distance.id}`).fill('1');
  await page
    .getByLabel('Activity date (required)', { exact: true })
    .fill('2026-03-29');
  await page
    .getByText('Start time and name (optional)', { exact: true })
    .click();
  await page
    .getByLabel('Start date and time (optional)', { exact: true })
    .fill('2026-03-29T03:30');
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(
    page.getByText('This local time does not exist.', { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel('Start date and time (optional)', { exact: true })
    .fill('2026-10-25T03:30');
  await page
    .getByLabel('Repeated daylight-saving time', { exact: false })
    .selectOption('later');
  await page
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(page).toHaveURL(/saved=1$/);
  const a = await f.api.getActivity(
    new URL(page.url()).pathname.split('/')[2]!,
  );
  expect(a.activityDate).toBe('2026-03-29');
  expect(a.startedAt).toBe('2026-10-25T01:30:00.000Z');
});
test.use({ timezoneId: 'Europe/Helsinki' });
