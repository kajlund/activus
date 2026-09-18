import { randomUUID } from 'node:crypto';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  CreateGoalRequestSchema,
  GoalOverviewItemSchema,
  type GoalDetail,
} from '@activus/contracts';
import { journalFixture } from '../test/support/journal.js';
import {
  fixedDetail,
  recurringDetail,
  periodHistory,
} from '../test/support/goal-detail.js';

async function setup(page: Page) {
  const f = await journalFixture(2);
  const goals = new Map<string, GoalDetail>();
  for (const template of [fixedDetail, recurringDetail]) {
    const id = randomUUID();
    goals.set(id, {
      ...structuredClone(template),
      goal: {
        ...template.goal,
        id,
        activityKindId: f.kind.id,
        activityVariantId: f.variant.id,
        tagIds: [f.tag.id],
        measurementDefinitionId:
          template.goal.targetType === 'measurement_total'
            ? f.distance.id
            : null,
      },
    });
  }
  const first = [...goals.values()][0]!;
  const durationId = randomUUID();
  goals.set(durationId, {
    ...structuredClone(first),
    goal: {
      ...first.goal,
      id: durationId,
      name: 'Time outdoors',
      targetType: 'total_duration',
      targetValue: '3601',
      measurementDefinitionId: null,
    },
    unitSymbol: null,
    measurementName: null,
    displayCurrent: '1800',
    displayTarget: '3601',
    displayRemaining: '1801',
    progress: {
      ...fixedDetail.progress!,
      scheduleMode: 'fixed',
      targetType: 'total_duration',
      currentValue: '1800',
      targetValue: '3601',
      remainingValue: '1801',
      achieved: false,
    } as GoalDetail['progress'],
  });
  let writes = 0;
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');
    const json = (data: unknown, status = 200) =>
      route.fulfill({ json: data, status });
    if (path === '/goals/overview')
      return json({
        items: [...goals.values()]
          .filter(
            (d) =>
              d.goal.lifecycle ===
              (url.searchParams.get('lifecycle') ?? 'active'),
          )
          .map((d) => GoalOverviewItemSchema.strip().parse(d)),
        hasGoals: goals.size > 0,
      });
    if (path === '/goals' && req.method() === 'POST') {
      const input = CreateGoalRequestSchema.parse(req.postDataJSON());
      const id = randomUUID();
      const goal = {
        ...first.goal,
        ...input,
        id,
        targetValue: String(input.targetValue),
        lifecycle: 'active' as const,
      };
      goals.set(id, { ...first, goal });
      writes++;
      return json(goal, 201);
    }
    const match = /^\/goals\/([^/]+)(?:\/(.*))?$/.exec(path);
    if (match) {
      const d = goals.get(match[1]!);
      if (!d)
        return json(
          {
            error: {
              code: 'GOAL_NOT_FOUND',
              message: 'Goal not found',
              requestId: randomUUID(),
            },
          },
          404,
        );
      if (match[2] === 'detail') return json(d);
      if (match[2] === 'periods')
        return json({ ...periodHistory, nextBefore: null });
      if (match[2] === 'contributions')
        return json({
          startDate: url.searchParams.get('period') ?? d.goal.startDate,
          endDate: d.goal.endDate,
          items: [],
          pagination: {
            limit: 25,
            offset: 0,
            hasMore: false,
            nextOffset: null,
          },
        });
      if (match[2] === 'archive' || match[2] === 'restore') {
        d.goal.isArchived = match[2] === 'archive';
        d.goal.lifecycle = d.goal.isArchived ? 'archived' : 'active';
        return json(d.goal);
      }
      if (req.method() === 'PATCH') {
        const input = CreateGoalRequestSchema.parse(req.postDataJSON());
        d.goal = {
          ...d.goal,
          ...input,
          targetValue: String(input.targetValue),
        };
        writes++;
        return json(d.goal);
      }
      return json(d.goal);
    }
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
  return { ...f, goals, first, durationId, writes: () => writes };
}
async function check(page: Page, info: TestInfo, name: string, axe = false) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath(name + '.png'),
    fullPage: true,
  });
  if (axe) {
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
}

test('goal lifecycle navigation, achieved values, archive confirmation and restore', async ({
  page,
}, info) => {
  const f = await setup(page);
  await page.goto('/goals');
  await expect(page.locator('.goal-row')).toHaveCount(3);
  await expect(page.locator('.achieved')).toContainText('Reached');
  await check(page, info, 'goals-overview', true);
  await page
    .getByRole('navigation', { name: 'Goal lifecycle' })
    .getByRole('link', { name: 'Upcoming' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'No upcoming goals' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Ended', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No ended goals' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Goal lifecycle' })
    .getByRole('link', { name: 'Active', exact: true })
    .click();
  await page.getByRole('button', { name: 'Archive Walking distance' }).click();
  const dialog = page.getByRole('dialog', { name: 'Archive this goal?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await check(page, info, 'archive-confirmation', true);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Archive Walking distance' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Archive Walking distance' }).click();
  await dialog.getByRole('button', { name: 'Archive goal' }).click();
  await expect(page.locator('.goal-row')).toHaveCount(2);
  await page.getByRole('link', { name: 'Archived', exact: true }).click();
  await expect(page.locator('.goal-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Restore Walking distance' }).click();
  await expect(page).toHaveURL(/\/goals$/);
  expect(f.first.goal.isArchived).toBe(false);
});

test('fixed, recurring and duration detail keep periods, values and archived references', async ({
  page,
}, info) => {
  const f = await setup(page);
  f.first.archivedReferences = ['Walking', 'Distance'];
  for (const d of f.goals.values()) {
    await page.goto('/goals/' + d.goal.id);
    await expect(
      page.getByRole('heading', { name: d.goal.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Edit goal', exact: true }),
    ).toBeVisible();
    if (d.goal.scheduleMode === 'recurring') {
      const choices = page.locator('.period-choice');
      await expect(choices).toHaveCount(2);
      await choices.nth(1).focus();
      await page.keyboard.press('Space');
      await expect(page).toHaveURL(/period=2026-08-31/);
      await expect(choices.nth(1)).toHaveAttribute('aria-pressed', 'true');
    }
    await check(page, info, 'detail-' + d.goal.targetType, true);
  }
});

test('create each target type with native validation and retained dynamic values', async ({
  page,
}, info) => {
  const f = await setup(page);
  for (const type of [
    'activity_count',
    'total_duration',
    'measurement_total',
  ]) {
    await page.goto('/goals/new');
    await page.getByLabel('Name *', { exact: true }).fill('New ' + type);
    await page
      .getByRole('combobox', { name: 'Activity kind *', exact: true })
      .selectOption(f.kind.id);
    await page.locator('[name=value]').fill('12');
    await page.locator('[name=targetType][value=total_duration]').check();
    await page.getByLabel('Hours', { exact: true }).fill('2');
    await page.getByLabel('Seconds', { exact: true }).fill('17');
    await page.locator('[name=targetType][value=' + type + ']').check();
    if (type !== 'total_duration')
      await expect(page.locator('[name=value]')).toHaveValue('12');
    if (type === 'measurement_total') {
      await page
        .getByRole('combobox', { name: 'Measurement *', exact: true })
        .selectOption(f.distance.id);
      await expect(page.locator('#target-unit')).toHaveText('Metres');
      await page
        .getByLabel('Description', { exact: true })
        .fill('A quiet goal with all optional context.');
      await page
        .getByRole('combobox', { name: 'Variant', exact: true })
        .selectOption(f.variant.id);
      await page
        .getByRole('combobox', { name: 'Measurement *', exact: true })
        .selectOption(f.distance.id);
      await page.getByLabel('Commute', { exact: true }).check();
      await page.locator('[name=schedule][value=recurring]').check();
      for (const recurrence of ['month', 'year', 'week'])
        await page
          .getByRole('combobox', { name: 'Recurrence *', exact: true })
          .selectOption(recurrence);
    }
    await page.getByLabel('Start *', { exact: true }).fill('2026-09-01');
    await page.getByLabel('End *', { exact: true }).fill('2026-12-31');
    await check(page, info, 'create-' + type, true);
    await page
      .getByRole('button', { name: 'Create goal', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Goals', exact: true }),
    ).toBeVisible();
    const saved = [...f.goals.values()].find(
      (d) => d.goal.name === 'New ' + type,
    )!;
    expect(saved.goal.targetValue).toBe(
      type === 'total_duration' ? '7217' : '12',
    );
  }
  expect(f.writes()).toBe(3);
});

test('editing retains historical references, confirms changes and preserves failed input', async ({
  page,
}, info) => {
  const f = await setup(page);
  f.deps.activityKinds.rows.get(f.kind.id)!.archivedAt = new Date();
  f.deps.variants.rows.get(f.variant.id)!.archivedAt = new Date();
  f.deps.measurements.rows.get(f.distance.id)!.archivedAt = new Date();
  f.deps.tags.rows.get(f.tag.id)!.archivedAt = new Date();
  await page.goto('/goals/' + f.first.goal.id + '/edit');
  await expect(
    page.getByRole('combobox', { name: 'Activity kind *', exact: true }),
  ).toHaveValue(f.kind.id);
  await expect(
    page.getByRole('combobox', { name: 'Measurement *', exact: true }),
  ).toHaveValue(f.distance.id);
  await page.locator('[name=value]').fill('600000');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Recalculate past progress?',
  });
  await expect(dialog).toBeVisible();
  await check(page, info, 'recalculation-confirmation', true);
  await dialog.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.locator('[name=value]')).toHaveValue('600000');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Discard unsaved changes?' })
    .getByRole('button', { name: 'Keep editing' })
    .click();
  let fail = true;
  await page.route('**/api/v1/goals/' + f.first.goal.id, async (route) => {
    if (fail && route.request().method() === 'PATCH')
      await route.abort('failed');
    else await route.fallback();
  });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('[name=value]')).toHaveValue('600000');
  fail = false;
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('heading', { name: 'Goals', exact: true }),
  ).toBeVisible();
  expect(f.first.goal.targetValue).toBe('600000');
});

test('empty, unavailable and planned Progress states remain honest and responsive', async ({
  page,
}, info) => {
  const f = await setup(page);
  let fail = true;
  await page.route('**/api/v1/goals/overview?*', async (route) => {
    if (fail) await route.abort('failed');
    else await route.fallback();
  });
  await page.goto('/goals');
  await expect(page.getByRole('alert')).toBeVisible();
  fail = false;
  f.goals.clear();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No goals yet' }),
  ).toBeVisible();
  await page.goto('/goals/' + randomUUID());
  await expect(
    page.getByRole('heading', { name: 'Goal not found' }),
  ).toBeVisible();
  for (const path of ['/goals/new', '/progress/trends']) {
    await page.goto(path);
    for (const width of [1920, 768, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await check(
        page,
        info,
        (path.includes('progress') ? 'progress-' : 'form-') + width,
        width === 320,
      );
    }
  }
  await expect(
    page.getByRole('heading', { name: 'Progress views are planned' }),
  ).toBeVisible();
  await expect(page.locator('progress-page progress')).toHaveCount(0);
});
