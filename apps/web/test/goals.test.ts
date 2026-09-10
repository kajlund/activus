import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { GoalOverviewItem } from '@activus/contracts';
import { GoalsPage } from '../src/features/goals/page.js';
import { goalView } from '../src/features/goals/state.js';
import { ClientError } from '../src/services/configuration-api.js';
const id = '11111111-1111-4111-8111-111111111111';
const item: GoalOverviewItem = {
  goal: {
    id,
    name: 'Walking distance',
    description: null,
    activityKindId: id,
    activityVariantId: null,
    tagIds: [],
    targetType: 'measurement_total',
    targetValue: '500000',
    measurementDefinitionId: id,
    scheduleMode: 'fixed',
    recurrencePeriod: null,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    isArchived: false,
    lifecycle: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  kindName: 'Walking',
  iconName: 'footprints',
  variantName: null,
  tagNames: ['Outside', 'With dog'],
  measurementName: 'Distance',
  unitSymbol: 'km',
  displayCurrent: '540',
  displayTarget: '500',
  progress: {
    scheduleMode: 'fixed',
    goalId: id,
    targetType: 'measurement_total',
    lifecycle: 'active',
    calculatedAt: '2026-09-10T00:00:00.000Z',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    currentValue: '540000',
    targetValue: '500000',
    remainingValue: '0',
    achieved: true,
  },
};
async function settle(page: GoalsPage) {
  for (let i = 0; i < 30; i++) await Promise.resolve();
  await page.updateComplete;
}
async function mount(items = [item], view = 'active') {
  const api = {
    overviewGoals: vi.fn().mockResolvedValue({ items, hasGoals: true }),
    archiveGoal: vi.fn().mockResolvedValue({
      ...item.goal,
      isArchived: true,
      lifecycle: 'archived',
    }),
    restoreGoal: vi.fn().mockResolvedValue(item.goal),
  };
  const page = new GoalsPage();
  page.api = api;
  page.route = `/goals?view=${view}`;
  document.body.append(page);
  await settle(page);
  return { page, api, root: page.shadowRoot! };
}
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
});
it('selects every lifecycle through the typed API, reflects URL state and defaults invalid views', async () => {
  const { page, api, root } = await mount();
  for (const view of ['active', 'upcoming', 'ended', 'archived']) {
    api.overviewGoals.mockResolvedValue({
      items: [
        {
          ...item,
          goal: { ...item.goal, name: `${view} goal`, lifecycle: view },
        },
      ],
      hasGoals: true,
    });
    page.route = `/goals?view=${view}&test=1`;
    await settle(page);
    expect(api.overviewGoals).toHaveBeenLastCalledWith(
      { lifecycle: view },
      expect.any(AbortSignal),
    );
    expect(root.querySelector('h2')?.textContent).toBe(`${view} goal`);
    expect(root.querySelector('nav [aria-current=page]')?.textContent).toBe(
      view[0]!.toUpperCase() + view.slice(1),
    );
  }
  expect(goalView('/goals?view=invalid')).toBe('active');
});
it('keeps over-target values, caps only the visual bar, and distinguishes unavailable from zero', async () => {
  const { root, page, api } = await mount();
  expect(root.textContent).toContain('540 of 500 km');
  expect(root.querySelector('progress')?.value).toBe(100);
  api.overviewGoals.mockResolvedValue({
    hasGoals: true,
    items: [
      {
        ...item,
        displayCurrent: '0',
        progress: { ...item.progress, currentValue: '0', achieved: false },
      },
      {
        ...item,
        goal: { ...item.goal, id: '22222222-2222-4222-8222-222222222222' },
        progress: null,
        displayCurrent: null,
      },
    ],
  });
  page.route = '/goals';
  await settle(page);
  expect(root.textContent).toContain('0 of 500 km');
  expect(root.textContent).toContain('Progress unavailable');
  expect(root.querySelectorAll('progress')).toHaveLength(1);
});
it('shows recurring current-period facts and completed periods, without a cumulative bar', async () => {
  const recurring: GoalOverviewItem = {
    ...item,
    goal: {
      ...item.goal,
      scheduleMode: 'recurring',
      recurrencePeriod: 'week',
      targetType: 'activity_count',
      targetValue: '3',
    },
    displayCurrent: '2',
    displayTarget: '3',
    progress: {
      scheduleMode: 'recurring',
      goalId: id,
      targetType: 'activity_count',
      lifecycle: 'active',
      calculatedAt: '2026-09-10T00:00:00.000Z',
      completedPeriods: 9,
      completedPeriodsAchieved: 6,
      currentPeriod: {
        startDate: '2026-09-07',
        endDate: '2026-09-13',
        calendarPeriodStart: '2026-09-07',
        calendarPeriodEnd: '2026-09-13',
        temporalState: 'current',
        currentValue: '2',
        targetValue: '3',
        remainingValue: '1',
        achieved: false,
      },
    },
  };
  const { root, page, api } = await mount([recurring]);
  expect(root.textContent).toContain('This week: 2 of 3 activities');
  expect(root.textContent).toContain('6 of 9 completed weeks reached');
  expect(root.querySelector('progress')?.value).toBeCloseTo(66.67, 1);
  api.overviewGoals.mockResolvedValue({
    items: [{ ...recurring, goal: { ...recurring.goal, lifecycle: 'ended' } }],
    hasGoals: true,
  });
  page.route = '/goals?view=ended';
  await settle(page);
  expect(root.querySelector('progress')).toBeNull();
  expect(root.textContent).toContain('6 of 9 completed weeks reached');
});
it('confirms archive, preserves the row on failure, and removes it only after success', async () => {
  const { page, api, root } = await mount();
  root.querySelector<HTMLButtonElement>('li button')!.click();
  await settle(page);
  expect(root.querySelector('dialog')?.open).toBe(true);
  api.archiveGoal.mockRejectedValueOnce(new Error('offline'));
  root.querySelector<HTMLButtonElement>('dialog button:last-child')!.click();
  await settle(page);
  expect(root.querySelectorAll('li')).toHaveLength(1);
  expect(root.querySelector('[role=alert]')).not.toBeNull();
  root.querySelector<HTMLButtonElement>('dialog button:last-child')!.click();
  await settle(page);
  expect(root.querySelectorAll('li')).toHaveLength(0);
  expect(root.querySelector('dialog')).toBeNull();
});
it('keeps a blocked restore visible with the backend conflict message', async () => {
  const { page, api, root } = await mount(
    [
      {
        ...item,
        goal: { ...item.goal, isArchived: true, lifecycle: 'archived' },
      },
    ],
    'archived',
  );
  api.restoreGoal.mockRejectedValue(
    new ClientError(
      'conflict',
      'GOAL_RESTORE_BLOCKED',
      undefined,
      undefined,
      'Activity kind is archived',
    ),
  );
  root.querySelector<HTMLButtonElement>('li button')!.click();
  await settle(page);
  expect(root.querySelectorAll('li')).toHaveLength(1);
  expect(root.querySelector('[role=alert]')?.textContent).toContain(
    'Activity kind is archived',
  );
});
it('ignores stale lifecycle responses and distinguishes first use from an empty view', async () => {
  const { page, api, root } = await mount();
  let resolve!: (value: unknown) => void;
  api.overviewGoals.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  page.route = '/goals?view=upcoming';
  await settle(page);
  api.overviewGoals.mockResolvedValue({ items: [], hasGoals: true });
  page.route = '/goals?view=ended';
  await settle(page);
  resolve({ items: [item], hasGoals: true });
  await settle(page);
  expect(root.textContent).toContain('No ended goals');
  expect(root.querySelectorAll('li')).toHaveLength(0);
  api.overviewGoals.mockResolvedValue({ items: [], hasGoals: false });
  page.route = '/goals';
  await settle(page);
  expect(root.textContent).toContain('Create your first goal');
});
