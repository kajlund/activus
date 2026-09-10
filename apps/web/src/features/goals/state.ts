import type { Goal } from '@activus/contracts';
import { GoalIdSchema, GoalContributionsQuerySchema } from '@activus/contracts';
export const goalViews = ['active', 'upcoming', 'ended', 'archived'] as const;
export function goalView(route: string): Goal['lifecycle'] {
  const value = new URL(route, location.origin).searchParams.get('view');
  return goalViews.find((v) => v === value) ?? 'active';
}
export function goalsPath(view: Goal['lifecycle']) {
  return view === 'active' ? '/goals' : `/goals?view=${view}`;
}
export function goalReturn(route: string) {
  const url = new URL(route, location.origin);
  return (
    safeGoalDetailReturn(url.searchParams.get('returnTo')) ??
    goalsPath(goalView(route))
  );
}
export function selectedGoalPeriod(route: string) {
  const params = new URL(route, location.origin).searchParams;
  const period =
    params.getAll('period').length === 1 ? params.get('period') : null;
  return period && GoalContributionsQuerySchema.safeParse({ period }).success
    ? period
    : undefined;
}
export function goalDetailPath(
  id: string,
  view: Goal['lifecycle'],
  period?: string,
) {
  const params = new URLSearchParams({ view });
  if (period) params.set('period', period);
  return `/goals/${id}?${params}`;
}
export function safeGoalDetailReturn(raw: string | null): string | undefined {
  if (!raw || !raw.startsWith('/goals/') || raw.startsWith('//'))
    return undefined;
  try {
    const url = new URL(raw, location.origin);
    const id = url.pathname.split('/')[2];
    if (
      url.origin !== location.origin ||
      url.pathname.split('/').length !== 3 ||
      !GoalIdSchema.safeParse(id).success
    )
      return undefined;
    return goalDetailPath(id!, goalView(raw), selectedGoalPeriod(raw));
  } catch {
    return undefined;
  }
}
