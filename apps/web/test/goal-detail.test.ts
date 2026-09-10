import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { GoalDetailPage } from '../src/features/goals/detail.js';
import {
  fixedDetail,
  recurringDetail,
  periodHistory,
  contributions,
  goalId,
} from './support/goal-detail.js';
import { ClientError } from '../src/services/configuration-api.js';
import { safeGoalDetailReturn } from '../src/features/goals/state.js';
import { exactNumber, journalDate } from '../src/features/journal/format.js';
async function settle(page: GoalDetailPage) {
  for (let i = 0; i < 80; i++) await Promise.resolve();
  await page.updateComplete;
}
async function mount(data = fixedDetail) {
  const api = {
    goalDetail: vi.fn().mockResolvedValue(data),
    goalPeriods: vi.fn().mockResolvedValue(periodHistory),
    goalContributions: vi.fn().mockResolvedValue(contributions),
    archiveGoal: vi.fn().mockResolvedValue({
      ...data.goal,
      isArchived: true,
      lifecycle: 'archived',
    }),
    restoreGoal: vi.fn().mockResolvedValue({
      ...data.goal,
      isArchived: false,
      lifecycle: 'active',
    }),
  };
  const page = new GoalDetailPage();
  page.api = api;
  page.route = `/goals/${goalId}?view=ended`;
  const onRoute = () => {
    page.route = location.pathname + location.search;
  };
  window.addEventListener('popstate', onRoute);
  page.addEventListener('remove-listener', () =>
    window.removeEventListener('popstate', onRoute),
  );
  document.body.append(page);
  await settle(page);
  return { page, api, root: page.shadowRoot! };
}
const text = (page: GoalDetailPage) =>
  page.shadowRoot!.textContent!.replace(/\s+/g, ' ');
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  document.body
    .querySelectorAll('goal-detail-page')
    .forEach((p) => p.dispatchEvent(new Event('remove-listener')));
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
});
it('shows exact fixed progress and remaining values, preserving over-target achievement', async () => {
  const { page, root, api } = await mount();
  expect(text(page)).toContain(`${exactNumber('540.125')} km of 500 km`);
  expect(text(page)).toContain('Goal reached');
  expect(root.querySelector('progress')?.value).toBe(100);
  api.goalDetail.mockResolvedValue({
    ...fixedDetail,
    displayCurrent: '214',
    displayRemaining: '286',
    progress: {
      ...fixedDetail.progress,
      currentValue: '214000',
      remainingValue: '286000',
      achieved: false,
    },
  });
  page.route += '&saved=1';
  await settle(page);
  expect(text(page)).toContain('286 km remaining');
  expect(text(page)).toContain('214 km of 500 km');
});
it('shows current-period progress and history; selection resets pagination and ignores stale activity responses', async () => {
  const { page, api, root } = await mount(recurringDetail);
  expect(text(page)).toContain('2 activities of 3 activities');
  expect(text(page)).toContain('6 of 9 completed weeks reached');
  expect(root.querySelectorAll('progress')).toHaveLength(1);
  expect(api.goalContributions).toHaveBeenLastCalledWith(
    goalId,
    { period: '2026-09-07', limit: 25, offset: 0 },
    expect.any(AbortSignal),
  );
  let resolve!: (value: unknown) => void;
  api.goalContributions.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  root.querySelectorAll<HTMLButtonElement>('.period-choice')[1]!.click();
  await settle(page);
  expect(location.search).toContain('period=2026-08-31');
  expect(api.goalContributions).toHaveBeenLastCalledWith(
    goalId,
    { period: '2026-08-31', limit: 25, offset: 0 },
    expect.any(AbortSignal),
  );
  api.goalContributions.mockResolvedValue({
    ...contributions,
    items: [],
    pagination: {
      ...contributions.pagination,
      hasMore: false,
      nextOffset: null,
    },
  });
  root.querySelectorAll<HTMLButtonElement>('.period-choice')[0]!.click();
  await settle(page);
  resolve(contributions);
  await settle(page);
  expect(text(page)).toContain('No qualifying activities');
  expect(
    root.querySelector('.period-choice[aria-pressed=true]')?.textContent,
  ).toContain(journalDate('2026-09-07'));
});
it('preserves progress and loaded rows when loading more activities or periods fails', async () => {
  const { page, api, root } = await mount(recurringDetail);
  api.goalContributions.mockRejectedValue(new Error('offline'));
  api.goalPeriods.mockRejectedValue(new Error('offline'));
  const button = (label: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === label,
    )!;
  button('Load more activities').click();
  button('Load older periods').click();
  await settle(page);
  expect(text(page)).toContain('Three walks each week');
  expect(text(page)).toContain('2 activities of 3 activities');
  expect(text(page)).toContain('A walk around the lake');
  expect(root.querySelectorAll('.period-choice')).toHaveLength(2);
  expect(text(page)).toContain('Retry activities');
  expect(text(page)).toContain('Retry periods');
});
it('distinguishes missing contributions from recorded zero and progress unavailable', async () => {
  const { page, api } = await mount();
  api.goalDetail.mockResolvedValue({
    ...fixedDetail,
    progress: null,
    displayCurrent: null,
    displayRemaining: null,
  });
  api.goalContributions.mockResolvedValue({
    ...contributions,
    items: [
      {
        ...contributions.items[0],
        canonicalContribution: null,
        displayContribution: null,
      },
      {
        ...contributions.items[0],
        activity: {
          ...contributions.items[0]!.activity,
          id: '22222222-2222-4222-8222-222222222222',
        },
        canonicalContribution: '0',
        displayContribution: '0',
      },
    ],
  });
  page.route += '&saved=1';
  await settle(page);
  expect(text(page)).toContain('No recorded contribution');
  expect(text(page)).toContain('0 km');
  expect(text(page)).toContain('Progress unavailable');
  expect(page.shadowRoot!.querySelector('progress')).toBeNull();
});
it('retains archived definitions and references when restore conflicts', async () => {
  const { page, api, root } = await mount({
    ...fixedDetail,
    goal: { ...fixedDetail.goal, isArchived: true, lifecycle: 'archived' },
    archivedReferences: ['Walking', 'Distance', 'With dog'],
  });
  api.restoreGoal.mockRejectedValue(
    new ClientError(
      'conflict',
      'GOAL_RESTORE_BLOCKED',
      undefined,
      undefined,
      'Activity kind is archived',
    ),
  );
  root.querySelector<HTMLButtonElement>('.lifecycle-action')!.click();
  await settle(page);
  expect(text(page)).toContain(
    'Archived configuration retained: Walking, Distance, With dog',
  );
  expect(text(page)).toContain('Activity kind is archived');
  expect(root.querySelector('h1')?.textContent).toBe('Walking distance');
  expect(
    safeGoalDetailReturn(`https://elsewhere/goals/${goalId}`),
  ).toBeUndefined();
  expect(
    safeGoalDetailReturn(`/goals/${goalId}?view=ended&period=2026-08-31`),
  ).toContain('period=2026-08-31');
});
