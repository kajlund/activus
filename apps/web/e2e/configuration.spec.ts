import { test, expect } from '@playwright/test';
import { kindInput } from '../test/support/configuration-api.js';
import { fixture } from './fixture.js';
import type { Page } from '@playwright/test';
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test('create and edit a kind, manage variants and refresh a detail deep link', async ({
  page,
}, info) => {
  await fixture(page);
  await page.goto('/activity-kinds');
  await expect(
    page.getByRole('heading', { name: 'No activity kinds yet' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Add activity kind', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
  await dialog.getByLabel('Name', { exact: true }).fill('Walking');
  await dialog
    .getByRole('button', { name: 'Add activity kind', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Actions for Walking', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Name', { exact: true }).fill('Cycling');
  await dialog.getByLabel('Search icons', { exact: true }).fill('Bike');
  await dialog.getByLabel('Bike', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Blue #527FA5' }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('link', { name: /Cycling/ }).click();
  await expect(page).toHaveURL(/\/activity-kinds\/[0-9a-f-]+$/);
  await expect(
    page.getByRole('heading', { name: 'Cycling', exact: true }),
  ).toBeVisible();
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
  await page.getByLabel('Actions for Treadmill', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Use as default variant').check();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Default', { exact: true })).toBeVisible();
  await page.getByLabel('Actions for Treadmill', { exact: true }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(dialog).toContainText('default selection is cleared');
  await dialog.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByText('Default', { exact: true })).not.toBeVisible();
  await page.getByLabel('Show archived variants').check();
  await page.getByLabel('Actions for Treadmill', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Cycling', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Treadmill', { exact: true })).toBeVisible();
  if (info.project.name.startsWith('mobile'))
    await page.getByText('Navigation', { exact: true }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Activity kinds' }),
  ).toHaveAttribute('aria-current', 'page');
  if (info.project.name.startsWith('mobile'))
    await page.getByText('Navigation', { exact: true }).click();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('detail.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: '← Activity kinds' }).click();
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Cycling', exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole('heading', { name: 'Activity kinds', exact: true }),
  ).toBeVisible();
});
test('long names, archived state, dialogs and keyboard focus reflow', async ({
  page,
}, info) => {
  const api = await fixture(page);
  const long = 'Walking through the forest and along the coastal path — '
    .repeat(2)
    .slice(0, 120);
  const kind = await api.createKind({ ...kindInput, name: long });
  const variant = await api.createVariant(kind.id, {
    name: 'Outdoor paths and woodland trails '.repeat(3),
    sortOrder: 0,
    isDefault: true,
  });
  await api.archiveVariant(variant.id);
  await page.goto(`/activity-kinds/${kind.id}?variantsArchived=true`);
  await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('long-names-archived.png'),
    fullPage: true,
  });
  const opener = page.getByRole('button', {
    name: 'Edit activity kind',
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('kind-form.png'),
    fullPage: true,
  });
  // Native modal keyboard trap must wrap from the last action to the first input.
  await dialog.getByRole('button', { name: 'Save changes' }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await page.getByRole('button', { name: 'Add variant', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Add variant', exact: true })
    .click();
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
  await expect(
    dialog.getByText('Enter a name of 1–120 characters.'),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('variant-validation.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
});
test('empty, network error and conflict states preserve context', async ({
  page,
}, info) => {
  const api = await fixture(page);
  await page.goto('/activity-kinds');
  await expect(
    page.getByRole('heading', { name: 'No activity kinds yet' }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('empty.png'), fullPage: true });
  await api.createKind(kindInput);
  await page
    .getByRole('button', { name: 'Add activity kind', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Walking');
  await dialog
    .getByRole('button', { name: 'Add activity kind', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('already used');
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(
    'Walking',
  );
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Discard changes' }).click();
  await page.route('**/api/v1/activity-kinds?*', async (route) =>
    route.abort(),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(
    'server could not be reached',
  );
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('network-error.png'),
    fullPage: true,
  });
});
