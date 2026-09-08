import { GoalProgressQuerySchema, type GoalProgress } from '@activus/contracts';
import { ApiError } from '../../errors.js';
import { parseId } from '../../transport.js';
import { toGoal } from './mapper.js';
import type { GoalRecord, GoalRepository } from './model.js';
import type { DailyAggregate } from './progress-repository.js';
type Clock = () => string;
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
    },
    private readonly clock: Clock = () => new Date().toISOString().slice(0, 10),
  ) {}
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
    while (cursor <= goal.endDate && periods.length < 520) {
      const fullEnd = addDays(nextPeriod(cursor, p), -1),
        start = cursor < goal.startDate ? goal.startDate : cursor,
        end = fullEnd > goal.endDate ? goal.endDate : fullEnd;
      if (
        (!q.data.from || end >= q.data.from) &&
        (!q.data.to || start <= q.data.to)
      ) {
        const current = sum(
          daily.filter((x) => x.activityDate >= start && x.activityDate <= end),
        );
        periods.push({
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
        });
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
