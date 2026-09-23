import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fixture } from './fixture.js';
import { kindInput } from '../test/support/configuration-api.js';
import { defaults } from '../src/features/measurements/fields.js';

async function accessibility(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .getByRole('dialog')
      .evaluateAll((dialogs) =>
        dialogs.every((dialog) => dialog.scrollWidth <= dialog.clientWidth),
      ),
  ).toBe(true);
}

test('configuration reflows at wide, tablet and narrow widths with explicit actions', async ({
  page,
}, info) => {
  const api = await fixture(page);
  const kind = await api.createKind(kindInput);
  for (const [index, name] of [
    'Cycling',
    'Strength training',
    'Swimming',
  ].entries()) {
    await api.createKind({
      ...kindInput,
      name,
      sortOrder: index + 1,
      color: '#527FA5',
      iconName: 'bike',
    });
  }
  for (const name of ['Outdoor', 'Treadmill'])
    await api.createVariant(kind.id, {
      name,
      sortOrder: 0,
      isDefault: name === 'Outdoor',
    });
  for (const [index, type] of (
    ['decimal', 'integer', 'duration', 'rating', 'boolean', 'text'] as const
  ).entries()) {
    await api.createMeasurement(kind.id, {
      ...defaults(type),
      activityVariantId: null,
      name: [
        'Distance',
        'Steps',
        'Duration',
        'Effort',
        'With company',
        'Surface',
      ][index]!,
      sortOrder: index,
    });
  }
  for (const width of [1920, 768, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/activity-kinds');
    await expect(
      page
        .getByRole('list', { name: 'Activity kinds', exact: true })
        .getByRole('listitem'),
    ).toHaveCount(4);
    await expect(page.locator('activity-kinds-page summary')).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`kinds-${width}.png`),
      fullPage: true,
    });
    await page.getByRole('link', { name: /Walking/ }).click();
    await expect(
      page.getByRole('button', {
        name: 'Edit measurement Effort',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText('Overall duration is already entered with the activity.', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.locator('measurement-section summary')).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`detail-${width}.png`),
      fullPage: true,
    });
    if (width === 320) await accessibility(page);
    await page
      .getByRole('button', { name: 'Edit activity kind', exact: true })
      .click();
    await noOverflow(page);
    if (width === 320) await accessibility(page);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await page.goto('/settings');
    await expect(
      page.getByRole('link', { name: 'Tags', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: 'Activity kinds and measurements',
        exact: true,
      }),
    ).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`settings-${width}.png`),
      fullPage: true,
    });
    if (width === 320) await accessibility(page);
  }
});

test('all measurement types retain values through edit and progressive settings', async ({
  page,
}, info) => {
  const api = await fixture(page);
  const kind = await api.createKind(kindInput);
  await page.goto(`/activity-kinds/${kind.id}`);
  const section = page.locator('measurement-section');
  const dialog = page.getByRole('dialog');
  for (const type of [
    'decimal',
    'integer',
    'duration',
    'rating',
    'boolean',
    'text',
  ] as const) {
    await section
      .getByRole('button', { name: 'Add measurement', exact: true })
      .click();
    await dialog.getByLabel('Name', { exact: true }).fill(`Example ${type}`);
    await dialog.getByLabel('Value type', { exact: true }).selectOption(type);
    await dialog.getByLabel('Required for normal entries').check();
    await dialog
      .getByText('Entry and summary settings', { exact: true })
      .click();
    if (type === 'rating') {
      await dialog.getByRole('radio', { name: '1 to 10', exact: true }).check();
      await expect(
        dialog.getByRole('radio', { name: 'Total', exact: true }),
      ).toHaveCount(0);
    }
    if (!['boolean', 'text'].includes(type)) {
      await dialog.getByRole('radio', { name: 'Average', exact: true }).check();
      await dialog
        .getByRole('radio', { name: 'Lowest value is better', exact: true })
        .check();
    } else
      await expect(
        dialog.getByRole('group', { name: 'Aggregation', exact: true }),
      ).toHaveCount(0);
    await dialog.getByLabel('Display order', { exact: true }).fill('3');
    await dialog
      .getByText('Entry and summary settings', { exact: true })
      .click();
    await noOverflow(page);
    await dialog
      .getByRole('button', { name: 'Add measurement', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const saved = api.measurements.find((m) => m.name === `Example ${type}`)!;
    expect(saved).toMatchObject({
      valueType: type,
      isRequired: true,
      sortOrder: 3,
    });
    if (type === 'rating') expect(saved.maximumValue).toBe(10);
    if (!['boolean', 'text'].includes(type))
      expect(saved).toMatchObject({
        aggregation: 'average',
        personalBestDirection: 'lowest',
      });
    await section
      .getByRole('button', {
        name: `Edit measurement Example ${type}`,
        exact: true,
      })
      .click();
    await dialog
      .getByText('Entry and summary settings', { exact: true })
      .click();
    if (type === 'rating')
      await expect(
        dialog.getByRole('radio', { name: '1 to 10', exact: true }),
      ).toBeChecked();
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`form-${type}.png`),
      fullPage: false,
    });
    if (type === 'rating') await accessibility(page);
    await dialog.getByLabel('Name', { exact: true }).fill(`Edited ${type}`);
    await dialog
      .getByRole('button', { name: 'Save measurement', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(api.measurements.find((m) => m.id === saved.id)).toMatchObject({
      ...saved,
      name: `Edited ${type}`,
    });
  }
});

test('kind archival keeps history configuration and restoration does not reinstate defaults', async ({
  page,
}) => {
  const api = await fixture(page);
  const kind = await api.createKind(kindInput);
  await api.createVariant(kind.id, {
    name: 'Outdoor',
    isDefault: true,
    sortOrder: 0,
  });
  await page.goto(`/activity-kinds/${kind.id}`);
  await page
    .getByRole('button', { name: 'Archive activity kind', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'Existing history remains available',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add variant', exact: true }),
  ).toBeDisabled();
  await page.goto('/activity-kinds');
  await expect(
    page.getByRole('heading', {
      name: 'No active activity kinds',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel('Show archived kinds').check();
  await page.getByRole('link', { name: /Walking/ }).click();
  await page
    .getByRole('button', { name: 'Restore activity kind', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Default', { exact: true })).toHaveCount(0);
  expect(api.variants[0]?.isDefault).toBe(false);
  await page.goto('/activity-kinds?archived=true');
  await expect(
    page.getByText('No archived activity kinds.', { exact: true }),
  ).toBeVisible();
});
