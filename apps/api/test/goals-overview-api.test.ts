import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import {
  GoalOverviewResponseSchema,
  UpdateGoalRequestSchema,
} from '@activus/contracts';
import type { GoalRecord, GoalRepository } from '../src/modules/goals/model.js';
import { GoalService } from '../src/modules/goals/service.js';
import { GoalProgressService } from '../src/modules/goals/progress-service.js';
import { goalRoutes } from '../src/modules/goals/routes.js';

it('does not apply creation defaults to partial goal edits', () => {
  expect(UpdateGoalRequestSchema.parse({ name: 'Renamed' })).toEqual({
    name: 'Renamed',
  });
  expect(UpdateGoalRequestSchema.safeParse({}).success).toBe(false);
  expect(
    UpdateGoalRequestSchema.parse({ activityVariantId: null, tagIds: [] }),
  ).toEqual({ activityVariantId: null, tagIds: [] });
});

it('returns unique definitions and compact fixed/recurring summaries using one aggregate batch', async () => {
  const fixed: GoalRecord = {
    id: randomUUID(),
    name: 'Distance',
    description: null,
    targetType: 'measurement_total',
    targetValue: '500000',
    measurementDefinitionId: randomUUID(),
    activityKindId: randomUUID(),
    activityVariantId: null,
    scheduleMode: 'fixed',
    recurrencePeriod: null,
    archivedAt: null,
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    createdAt: new Date(),
    updatedAt: new Date(),
    tagIds: [],
  };
  const recurring: GoalRecord = {
    ...fixed,
    id: randomUUID(),
    name: 'Weekly walks',
    targetType: 'activity_count',
    targetValue: '3',
    measurementDefinitionId: null,
    scheduleMode: 'recurring',
    recurrencePeriod: 'week',
  };
  const repository = {
    list: vi.fn().mockResolvedValue([fixed, recurring]),
    find: vi.fn().mockResolvedValue(fixed),
  } as unknown as GoalRepository;
  const data = {
    aggregate: vi.fn(),
    aggregateMany: vi.fn().mockResolvedValue([
      { goalId: fixed.id, activityDate: '2026-09-07', value: '540000' },
      { goalId: recurring.id, activityDate: '2026-09-01', value: '3' },
      { goalId: recurring.id, activityDate: '2026-09-08', value: '2' },
    ]),
    overviewMetadata: vi.fn().mockResolvedValue({
      hasGoals: true,
      rows: [fixed, recurring].map((g) => ({
        id: g.id,
        kindName: 'Walking',
        iconName: 'footprints',
        variantName: null,
        tagNames: ['Outside', 'With dog'],
        measurementName: g.measurementDefinitionId ? 'Distance' : null,
        displayUnit: g.measurementDefinitionId ? 'kilometre' : null,
        precision: 2,
      })),
    }),
  };
  const progress = new GoalProgressService(
    repository,
    data,
    () => '2026-09-10',
  );
  const app = new Hono().route(
    '/goals',
    goalRoutes(new GoalService(repository), progress),
  );
  const response = await app.request('/goals/overview?lifecycle=active');
  expect(response.status).toBe(200);
  const body = GoalOverviewResponseSchema.parse(await response.json());
  expect(body.items.map((i) => i.goal.id)).toEqual([fixed.id, recurring.id]);
  expect(body.items[0]).toMatchObject({
    displayCurrent: '540',
    displayTarget: '500',
    unitSymbol: 'km',
    progress: { achieved: true, currentValue: '540000' },
  });
  expect(body.items[1]?.progress).toMatchObject({
    currentPeriod: { currentValue: '2', targetValue: '3' },
    completedPeriods: 1,
    completedPeriodsAchieved: 1,
  });
  expect(body.items[1]?.progress).not.toHaveProperty('periods');
  expect(
    body.items.every(
      (item) =>
        item.goal.lifecycle === 'active' &&
        item.progress?.lifecycle === 'active',
    ),
  ).toBe(true);
  expect(data.aggregateMany).toHaveBeenCalledExactlyOnceWith([
    fixed.id,
    recurring.id,
  ]);
  expect(data.aggregate).not.toHaveBeenCalled();
  expect(repository.list).toHaveBeenCalledWith(
    { lifecycle: 'active', includeArchived: false },
    '2026-09-10',
  );
  expect(repository.find).not.toHaveBeenCalled();
  data.aggregateMany.mockRejectedValueOnce(new Error('unavailable'));
  const unavailable = GoalOverviewResponseSchema.parse(
    await (await app.request('/goals/overview')).json(),
  );
  expect(unavailable.items[0]?.progress).toBeNull();
  expect(unavailable.items[0]?.displayCurrent).toBeNull();
  expect(unavailable.items[0]?.goal.name).toBe('Distance');
  vi.mocked(repository.list).mockResolvedValue([
    { ...recurring, startDate: '2000-01-01' },
  ]);
  const longRunning = await progress.overview({ lifecycle: 'active' });
  const summary = longRunning.items[0]?.progress;
  expect(summary?.scheduleMode).toBe('recurring');
  if (summary?.scheduleMode === 'recurring') {
    expect(summary.currentPeriod?.currentValue).toBe('2');
    expect(summary.completedPeriods).toBeGreaterThan(520);
  }
  expect((await app.request(`/goals/${fixed.id}`)).status).toBe(200);
  for (const [today, lifecycle] of [
    ['2026-08-31', 'upcoming'],
    ['2026-09-01', 'active'],
    ['2026-09-30', 'active'],
    ['2026-10-01', 'ended'],
  ] as const) {
    const detail = await new GoalProgressService(
      repository,
      data,
      () => today,
    ).detail(fixed.id);
    expect(detail.goal.lifecycle).toBe(lifecycle);
    expect(detail.progress?.lifecycle).toBe(lifecycle);
  }
});
