import { test, expect, type Page } from '@playwright/test';
import { fixture } from './fixture.js';

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test('open Tags through Settings, create a colour tag by keyboard and edit it', async ({
  page,
}, info) => {
  await fixture(page);
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Tags', exact: true }).click();
  await expect(page).toHaveURL(/\/tags$/);
  await expect(
    page.getByRole('heading', { name: 'No tags yet' }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('tags-empty.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'New tag', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
  await dialog.getByLabel('Name', { exact: true }).fill('Commute');
  await dialog.getByRole('radio', { name: 'No colour', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    dialog.getByRole('radio', { name: 'Purple #67318F', exact: true }),
  ).toBeChecked();
  await dialog
    .getByRole('radio', { name: 'Blue #527FA5', exact: true })
    .check();
  await expect(
    dialog.getByText('Selected: Blue', { exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('tags-form.png') });
  await dialog.getByRole('button', { name: 'Create tag', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Create tag', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'New tag', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Edit tag Commute', exact: true })
    .click();
  await dialog.getByLabel('Name', { exact: true }).fill('With dog');
  await dialog.getByRole('radio', { name: 'No colour', exact: true }).check();
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Tags', exact: true }),
  ).toContainText('With dog');
  await expect(page.getByRole('img', { name: /Colour/ })).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('tags-populated.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByText('With dog', { exact: true })).toBeVisible();
  await noOverflow(page);
});

test('archive, include archived tags, refresh and restore to the active list', async ({
  page,
}, info) => {
  const { tags } = await fixture(page);
  await tags.createTag({ name: 'Holiday', color: '#8069A5' });
  await page.goto('/tags');
  await page.getByRole('button', { name: 'Archive tag', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Historical activities keep this tag');
  await expect(
    dialog.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: info.outputPath('tags-archive-confirmation.png'),
  });
  await dialog
    .getByRole('button', { name: 'Archive tag', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No active tags' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Tags', exact: true }),
  ).toBeFocused();
  await page.getByRole('checkbox', { name: 'Include archived tags' }).check();
  await expect(page).toHaveURL(/archived=true/);
  await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('tags-archived.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByText('Holiday', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore tag', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Restore tag', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText('No archived tags.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: 'Include archived tags' }).uncheck();
  await expect(page.getByText('Holiday', { exact: true })).toBeVisible();
  await expect(page.getByText('Archived', { exact: true })).not.toBeVisible();
  await noOverflow(page);
});

test('search combines with archived visibility and supports back, forward and clear', async ({
  page,
}) => {
  const { tags } = await fixture(page);
  await tags.createTag({ name: 'Race', color: null });
  const old = await tags.createTag({ name: 'Race holiday', color: null });
  await tags.archiveTag(old.id);
  await tags.createTag({ name: 'Commute', color: null });
  await page.goto('/tags');
  const search = page.getByRole('searchbox', { name: 'Search tags' });
  await search.fill('Race');
  await expect(page).toHaveURL(/search=Race/);
  await expect(search).toBeFocused();
  await expect(
    page.getByText('Race holiday', { exact: true }),
  ).not.toBeVisible();
  await page.getByRole('checkbox', { name: 'Include archived tags' }).check();
  await expect(page.getByText('Race holiday', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page).toHaveURL(/\/tags\?archived=true$/);
  await page.goBack();
  await expect(search).toHaveValue('Race');
  await expect(
    page.getByRole('checkbox', { name: 'Include archived tags' }),
  ).toBeChecked();
  await page.goBack();
  await expect(
    page.getByRole('checkbox', { name: 'Include archived tags' }),
  ).not.toBeChecked();
  await page.goForward();
  await expect(page.getByText('Race holiday', { exact: true })).toBeVisible();
  await page.reload();
  await expect(search).toHaveValue('Race');
  await search.fill('unmatched');
  await expect(
    page.getByRole('heading', { name: 'No matching tags' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear search', exact: true })
    .first()
    .click();
  await expect(page.getByText('Commute', { exact: true })).toBeVisible();
  await noOverflow(page);
});

test('long names, loading, read errors and rejected forms remain usable', async ({
  page,
}, info) => {
  const { tags } = await fixture(page);
  const long = 'Personal context from the woodland trails and coastal paths '
    .repeat(3)
    .slice(0, 120);
  await tags.createTag({ name: long, color: '#A66B3F' });
  await tags.createTag({ name: 'Recovery', color: null });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/tags?*', async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto('/tags');
  await expect(page.getByText('Loading tags…', { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('tags-loading.png'),
    fullPage: true,
  });
  release();
  await expect(page.getByText(long, { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('tags-long-name.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'New tag', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create tag', exact: true }).click();
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
  await expect(
    dialog.getByText('Enter a name of 1–120 characters.', { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill('Recovery');
  await dialog.getByRole('button', { name: 'Create tag', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('already used');
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(
    'Recovery',
  );
  await page.screenshot({ path: info.outputPath('tags-conflict.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toContainText('Discard your unsaved tag changes?');
  await dialog
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.route('**/api/v1/tags?*', async (route) => route.abort());
  await page.getByRole('searchbox', { name: 'Search tags' }).fill('Recovery');
  await expect(page.getByRole('alert')).toContainText(
    'server could not be reached',
  );
  await expect(page.getByText(long, { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('tags-read-error.png'),
    fullPage: true,
  });
  await page.unroute('**/api/v1/tags?*');
  await page.getByRole('button', { name: 'Retry tags', exact: true }).click();
  await expect(page.getByRole('alert')).not.toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Tags', exact: true }),
  ).toContainText('Recovery');
  await noOverflow(page);
});
