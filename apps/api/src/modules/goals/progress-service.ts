import { GoalProgressQuerySchema, type GoalProgress } from '@activus/contracts';
import { ApiError } from '../../errors.js';
import { parseId } from '../../transport.js';
import { toGoal } from './mapper.js';
import type { GoalRecord, GoalRepository } from './model.js';
import type { DailyAggregate } from './progress-repository.js';
import type { createGoalProgressRepository } from './progress-repository.js';
import {
  measurementUnits,
  type GoalOverviewQuery,
  type GoalOverviewResponse,
} from '@activus/contracts';
import {
  decimal as preciseDecimal,
  divideForDisplay,
} from '../activities/decimal.js';
type Clock = () => string;
type RecurringPeriod = Extract<
  GoalProgress,
  { scheduleMode: 'recurring' }
>['periods'][number];
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const weekStart = (d: string) =>
  addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const yearStart = (d: string) => `${d.slice(0, 4)}-01-01`;
function nextPeriod(d: string, p: 'week' | 'month' | 'year') {
  if (p === 'week') return addDays(d, 7);
  if (p === 'month') {
    const x = new Date(`${d}T12:00:00Z`);
    return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1))
      .toISOString()
      .slice(0, 10);
  }
  return `${Number(d.slice(0, 4)) + 1}-01-01`;
}
function startOf(d: string, p: 'week' | 'month' | 'year') {
  return p === 'week'
    ? weekStart(d)
    : p === 'month'
      ? monthStart(d)
      : yearStart(d);
}
function decimal(v: string) {
  return BigInt(v.replace('.', ''));
}
function scale(v: string) {
  return v.includes('.') ? v.length - v.indexOf('.') - 1 : 0;
}
function arithmetic(current: string, target: string) {
  const s = Math.max(scale(current), scale(target));
  const n = (v: string) =>
    BigInt(v.replace('.', '')) * 10n ** BigInt(s - scale(v));
  const c = n(current),
    t = n(target),
    r = c > t ? 0n : t - c;
  const out = (x: bigint) => {
    const raw = x.toString().padStart(s + 1, '0');
    return s
      ? `${raw.slice(0, -s)}.${raw.slice(-s)}`.replace(/\.?0+$/, '')
      : raw;
  };
  return {
    currentValue: out(c),
    targetValue: out(t),
    remainingValue: out(r),
    achieved: c >= t,
  };
}
export class GoalProgressService {
  constructor(
    private readonly goals: GoalRepository,
    private readonly data: {
      aggregate(goal: GoalRecord): Promise<DailyAggregate[]>;
    } & Partial<
      Pick<
        ReturnType<typeof createGoalProgressRepository>,
        'aggregateMany' | 'overviewMetadata'
      >
    >,
    private readonly clock: Clock = () => new Date().toISOString().slice(0, 10),
  ) {}
  async overview(query: GoalOverviewQuery): Promise<GoalOverviewResponse> {
    if (!this.data.aggregateMany || !this.data.overviewMetadata)
      throw new Error('Overview repository unavailable');
    const records = await this.goals.list({
      lifecycle: query.lifecycle,
      includeArchived: query.lifecycle === 'archived',
    });
    const ids = records.map((g) => g.id);
    const metadata = await this.data.overviewMetadata(ids);
    let daily: Array<DailyAggregate & { goalId: string }> | null;
    try {
      daily = await this.data.aggregateMany(ids);
    } catch {
      daily = null;
    }
    return {
      hasGoals: metadata.hasGoals,
      items: records.map((record) => {
        const meta = metadata.rows.find((m) => m.id === record.id);
        if (!meta) throw new Error('Goal references unavailable');
        const unit = measurementUnits.find((u) => u.id === meta.displayUnit);
        const display = (value: string) =>
          unit
            ? divideForDisplay(
                preciseDecimal(value),
                preciseDecimal(unit.factorToCanonical),
                meta.precision ?? unit.defaultPrecision,
              )
            : value;
        const completed = {
          count: 0,
          achieved: 0,
          current: null as RecurringPeriod | null,
        };
        const result =
          daily === null
            ? null
            : this.calculate(
                record,
                daily.filter((d) => d.goalId === record.id),
                {},
                (period) => {
                  if (period.temporalState === 'current')
                    completed.current = period;
                  if (period.temporalState === 'ended') {
                    completed.count++;
                    if (period.achieved) completed.achieved++;
                  }
                },
              );
        const progress =
          result?.scheduleMode === 'recurring'
            ? {
                scheduleMode: result.scheduleMode,
                goalId: result.goalId,
                targetType: result.targetType,
                lifecycle: result.lifecycle,
                calculatedAt: result.calculatedAt,
                currentPeriod: completed.current,
                completedPeriods: completed.count,
                completedPeriodsAchieved: completed.achieved,
              }
            : result;
        const value =
          progress?.scheduleMode === 'fixed'
            ? progress.currentValue
            : progress?.currentPeriod?.currentValue;
        return {
          goal: toGoal(record),
          kindName: meta.kindName,
          iconName: meta.iconName,
          variantName: meta.variantName,
          tagNames: meta.tagNames,
          measurementName: meta.measurementName,
          unitSymbol: unit?.symbol ?? null,
          displayCurrent: value === undefined ? null : display(value),
          displayTarget: display(record.targetValue),
          progress,
        };
      }),
    };
  }
  async get(id: string, input: unknown): Promise<GoalProgress> {
    const q = GoalProgressQuerySchema.safeParse(input);
    if (!q.success)
      throw new ApiError(
        400,
        'GOAL_PROGRESS_INVALID',
        'Invalid progress query',
      );
    const goal = await this.goals.find(parseId(id, 'GOAL_INVALID'));
    if (!goal) throw new ApiError(404, 'GOAL_NOT_FOUND', 'Goal not found');
    const daily = await this.data.aggregate(goal);
    return this.calculate(goal, daily, q.data);
  }
  calculate(
    goal: GoalRecord,
    daily: DailyAggregate[],
    query: { from?: string | undefined; to?: string | undefined } = {},
    onPeriod?: (period: RecurringPeriod) => void,
  ): GoalProgress {
    const sum = (rows: DailyAggregate[]) => {
      const precision = Math.max(0, ...rows.map((x) => scale(x.value)));
      const amount = rows.reduce(
        (total, x) =>
          total + decimal(x.value) * 10n ** BigInt(precision - scale(x.value)),
        0n,
      );
      const raw = amount.toString().padStart(precision + 1, '0');
      return precision
        ? `${raw.slice(0, -precision)}.${raw.slice(-precision)}`.replace(
            /\.?0+$/,
            '',
          )
        : raw;
    };
    const lifecycle = toGoal(goal).lifecycle;
    const calculatedAt = new Date().toISOString();
    if (goal.scheduleMode === 'fixed') {
      return {
        scheduleMode: 'fixed',
        goalId: goal.id,
        targetType: goal.targetType,
        lifecycle,
        calculatedAt,
        startDate: goal.startDate,
        endDate: goal.endDate,
        ...arithmetic(sum(daily), String(goal.targetValue)),
      };
    }
    const p = goal.recurrencePeriod!;
    const first = startOf(goal.startDate, p),
      periods: Array<{
        calendarPeriodStart: string;
        calendarPeriodEnd: string;
        startDate: string;
        endDate: string;
        temporalState: 'upcoming' | 'current' | 'ended';
        currentValue: string;
        targetValue: string;
        remainingValue: string;
        achieved: boolean;
      }> = [];
    let cursor = first;
    // Overview consumes each period without retaining or returning history. The
    // detail endpoint keeps its established 520-row bound.
    while (cursor <= goal.endDate && (onPeriod || periods.length < 520)) {
      const fullEnd = addDays(nextPeriod(cursor, p), -1),
        start = cursor < goal.startDate ? goal.startDate : cursor,
        end = fullEnd > goal.endDate ? goal.endDate : fullEnd;
      if (
        (!query.from || end >= query.from) &&
        (!query.to || start <= query.to)
      ) {
        const current = sum(
          daily.filter((x) => x.activityDate >= start && x.activityDate <= end),
        );
        const period: RecurringPeriod = {
          calendarPeriodStart: cursor,
          calendarPeriodEnd: fullEnd,
          startDate: start,
          endDate: end,
          temporalState:
            this.clock() < start
              ? 'upcoming'
              : this.clock() > end
                ? 'ended'
                : 'current',
          ...arithmetic(current, String(goal.targetValue)),
        };
        if (onPeriod) onPeriod(period);
        else periods.push(period);
      }
      cursor = nextPeriod(cursor, p);
    }
    return {
      scheduleMode: 'recurring',
      goalId: goal.id,
      targetType: goal.targetType,
      lifecycle,
      calculatedAt,
      periods,
      summary: {
        periodCount: periods.length,
        periodsAchieved: periods.filter((x) => x.achieved).length,
        periodsEndedUnachieved: periods.filter(
          (x) => x.temporalState === 'ended' && !x.achieved,
        ).length,
      },
    };
  }
}
