import type { Page } from '@playwright/test';
export async function editorSection(
  page: Page,
  section: 'activity' | 'timing' | 'measurements' | 'context',
) {
  const trigger = page.locator('activity-editor-page #' + section + '-trigger');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true')
    await trigger.click();
}
