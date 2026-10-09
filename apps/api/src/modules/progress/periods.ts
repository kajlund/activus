import type { ProgressQuery } from '@activus/contracts';

export type Range = { startDate: string; endDate: string };
export const helsinkiToday = (now = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
const date = (day: string) => new Date(`${day}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().split('T')[0]!;
export function shiftDays(day: string, amount: number) {
  const d = date(day);
  d.setUTCDate(d.getUTCDate() + amount);
  return iso(d);
}
export function shiftMonths(day: string, amount: number) {
  const d = date(day),
    n = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + amount);
  const last = new Date(d);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  d.setUTCDate(Math.min(n, last.getUTCDate()));
  return iso(d);
}
export const dayCount = (r: Range) =>
  (date(r.endDate).getTime() - date(r.startDate).getTime()) / 86400000 + 1;
export function progressRanges(
  q: ProgressQuery,
  today: string,
  earliest: string | null,
) {
  const year = Number(today.slice(0, 4));
  let range: Range = {
    startDate: shiftDays(shiftMonths(today, -12), 1),
    endDate: today,
  };
  if (q.period === '30d') range.startDate = shiftDays(today, -29);
  if (q.period === '3m') range.startDate = shiftDays(shiftMonths(today, -3), 1);
  if (q.period === 'year') range.startDate = `${year}-01-01`;
  if (q.period === 'previous-year')
    range = { startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` };
  if (q.period === 'custom')
    range = { startDate: q.startDate!, endDate: q.endDate! };
  if (q.period === 'all')
    range.startDate = earliest && earliest < today ? earliest : today;
  let previousRange: Range | null = {
    startDate: shiftDays(range.startDate, -dayCount(range)),
    endDate: shiftDays(range.startDate, -1),
  };
  if (q.period === '3m' || q.period === '12m')
    previousRange.startDate = shiftMonths(
      range.startDate,
      q.period === '3m' ? -3 : -12,
    );
  if (q.period === 'year' || q.period === 'previous-year')
    previousRange = {
      startDate: shiftMonths(range.startDate, -12),
      endDate: shiftMonths(range.endDate, -12),
    };
  if (
    q.period === 'all' ||
    previousRange.startDate < '0001-01-01' ||
    previousRange.startDate.length !== 10
  )
    previousRange = null;
  return { range, previousRange };
}
export function trendBuckets(range: Range) {
  const days = dayCount(range);
  const grouping =
    days <= 45 ? 'day' : days <= 180 ? 'week' : days <= 1461 ? 'month' : 'year';
  const buckets: Range[] = [];
  let startDate = range.startDate;
  while (startDate <= range.endDate) {
    let next: string;
    if (grouping === 'day') next = shiftDays(startDate, 1);
    else if (grouping === 'week')
      next = shiftDays(startDate, 7 - ((date(startDate).getUTCDay() + 6) % 7));
    else if (grouping === 'month')
      next = shiftMonths(startDate.slice(0, 7) + '-01', 1);
    else
      next = `${String(Number(startDate.slice(0, 4)) + 1).padStart(4, '0')}-01-01`;
    const endDate =
      next.length !== 10 || next > range.endDate
        ? range.endDate
        : shiftDays(next, -1);
    buckets.push({ startDate, endDate });
    if (endDate === range.endDate) break;
    startDate = next;
  }
  return { grouping, buckets } as const;
}
