import { test, expect } from '@playwright/test';
import { fixture } from './fixture.js';
import { kindInput } from '../test/support/configuration-api.js';

test('configure parent and variant measurements, primary, history edits and archival', async ({
  page,
}, info) => {
  const api = await fixture(page);
  const kind = await api.createKind(kindInput);
  const variant = await api.createVariant(kind.id, {
    name: 'Treadmill',
    sortOrder: 0,
    isDefault: false,
  });
  await page.goto(`/activity-kinds/${kind.id}`);
  const section = page.locator('measurement-section');
  const dialog = page.getByRole('dialog');
  await section
    .getByRole('button', { name: 'Add measurement', exact: true })
    .click();
  await dialog.getByLabel('Name', { exact: true }).fill('Distance');
  await dialog
    .getByLabel('Display unit', { exact: true })
    .selectOption('kilometre');
  await dialog.getByLabel('Required for normal entries').check();
  await dialog.getByText('Advanced settings', { exact: true }).click();
  await dialog.getByLabel('Aggregation', { exact: true }).selectOption('total');
  await dialog
    .getByLabel('Personal bests', { exact: true })
    .selectOption('highest');
  await dialog.getByLabel('Minimum (km)', { exact: true }).fill('0');
  await expect(
    dialog.getByLabel('Precision (0–6 decimal places)', { exact: true }),
  ).toHaveValue('2');
  await page.screenshot({
    path: info.outputPath('measurement-form.png'),
    fullPage: true,
  });
  await dialog
    .getByRole('button', { name: 'Add measurement', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await section
    .getByRole('button', { name: 'Add measurement', exact: true })
    .click();
  await dialog.getByLabel('Name', { exact: true }).fill('Steps');
  await dialog
    .getByLabel('Value type', { exact: true })
    .selectOption('integer');
  await dialog
    .getByLabel('Display unit', { exact: true })
    .selectOption('count');
  await dialog.getByText('Advanced settings', { exact: true }).click();
  await dialog.getByLabel('Aggregation', { exact: true }).selectOption('total');
  await dialog
    .getByRole('button', { name: 'Add measurement', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await section
    .getByLabel('Measurement actions for Distance', { exact: true })
    .click();
  await section
    .getByRole('button', { name: 'Set as primary', exact: true })
    .click();
  await expect(section.getByText('Primary', { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('parent-measurements.png'),
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'Measurements for Treadmill', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`measurementVariant=${variant.id}`));
  await expect(
    section.getByRole('heading', { name: 'Inherited from Walking' }),
  ).toBeVisible();
  await section
    .getByRole('button', { name: 'Add measurement', exact: true })
    .click();
  await expect(dialog).toContainText('Applies only to Treadmill');
  await dialog.getByLabel('Name', { exact: true }).fill('Incline');
  await dialog
    .getByRole('button', { name: 'Add measurement', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    section.getByRole('list', { name: 'Inherited measurements' }),
  ).toContainText('Distance');
  await expect(
    section.getByRole('list', { name: 'Inherited measurements' }),
  ).toContainText('Steps');
  await expect(
    section.getByRole('list', { name: 'Measurement definitions', exact: true }),
  ).toContainText('Incline');
  await page.reload();
  await expect(
    section.getByRole('heading', { name: 'Only for Treadmill', exact: true }),
  ).toBeVisible();
  await expect(section.getByText('Incline', { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('inherited-measurements.png'),
    fullPage: true,
  });
  await section
    .getByRole('link', { name: 'Return to parent measurements' })
    .click();
  const distance = api.measurements.find((m) => m.name === 'Distance')!;
  api.history.add(distance.id);
  await section
    .getByLabel('Measurement actions for Distance', { exact: true })
    .click();
  await section
    .getByRole('button', { name: 'Edit measurement', exact: true })
    .click();
  await dialog.getByLabel('Required for normal entries').uncheck();
  await dialog
    .getByRole('button', { name: 'Save measurement', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(api.measurements.find((m) => m.id === distance.id)?.isRequired).toBe(
    false,
  );
  await section
    .getByLabel('Measurement actions for Steps', { exact: true })
    .click();
  await section
    .getByRole('button', { name: 'Archive measurement', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Archive measurement', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(section.getByText('Steps', { exact: true })).not.toBeVisible();
  await expect(
    section.getByRole('heading', { name: 'Measurements', exact: true }),
  ).toBeFocused();
  await section.getByLabel('Show archived measurements').check();
  await expect(section.getByText('Archived', { exact: true })).toBeVisible();
  await section
    .getByLabel('Measurement actions for Steps', { exact: true })
    .click();
  await section
    .getByRole('button', { name: 'Restore measurement', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Restore measurement', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(section.getByText('Primary', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('measurement dirty dismissal, history locks, duration and long-name layout', async ({
  page,
}, info) => {
  const api = await fixture(page);
  const kind = await api.createKind(kindInput);
  await page.goto(`/activity-kinds/${kind.id}`);
  const section = page.locator('measurement-section');
  const dialog = page.getByRole('dialog');
  const opener = section.getByRole('button', {
    name: 'Add measurement',
    exact: true,
  });
  await opener.click();
  await dialog
    .getByLabel('Name', { exact: true })
    .fill('Moving time along the woodland trails and coastal paths '.repeat(2));
  await dialog
    .getByLabel('Value type', { exact: true })
    .selectOption('duration');
  await expect(dialog.getByLabel('Display format')).toHaveValue('hour-minute');
  await dialog.getByText('Advanced settings', { exact: true }).click();
  await dialog.getByLabel('Minimum (h:mm:ss)', { exact: true }).fill('0:05:00');
  await dialog
    .getByLabel('Maximum (h:mm:ss)', { exact: true })
    .fill('12:00:00');
  await page.screenshot({
    path: info.outputPath('duration-form.png'),
    fullPage: true,
  });
  await dialog
    .getByRole('button', { name: 'Add measurement', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const definition = api.measurements[0]!;
  expect(definition.minimumValue).toBe(300);
  api.history.add(definition.id);
  await section
    .getByLabel(`Measurement actions for ${definition.name}`, { exact: true })
    .click();
  await section
    .getByRole('button', { name: 'Edit measurement', exact: true })
    .click();
  await dialog.getByText('Advanced settings', { exact: true }).click();
  await dialog
    .getByLabel('Maximum (h:mm:ss)', { exact: true })
    .fill('13:00:00');
  await dialog.getByRole('button', { name: 'Save measurement' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Activities already use',
  );
  await expect(dialog.getByLabel('Value type', { exact: true })).toBeDisabled();
  await page.screenshot({
    path: info.outputPath('history-lock.png'),
    fullPage: true,
  });
  await dialog.getByRole('button', { name: 'Keep recorded settings' }).click();
  await dialog.getByRole('button', { name: 'Save measurement' }).click();
  await expect(dialog).not.toBeVisible();
  await opener.click();
  await dialog.getByLabel('Name', { exact: true }).fill('Unsaved');
  await page.keyboard.press('Escape');
  await expect(dialog).toContainText('Discard your unsaved');
  await expect(
    dialog.getByRole('button', { name: 'Keep editing' }),
  ).toBeFocused();
  await dialog.getByRole('button', { name: 'Discard changes' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('long-measurement.png'),
    fullPage: true,
  });
});
