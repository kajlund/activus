import type { Goal } from '@activus/contracts';
export const goalViews = ['active', 'upcoming', 'ended', 'archived'] as const;
export function goalView(route: string): Goal['lifecycle'] {
  const value = new URL(route, location.origin).searchParams.get('view');
  return goalViews.find((v) => v === value) ?? 'active';
}
export function goalsPath(view: Goal['lifecycle']) {
  return view === 'active' ? '/goals' : `/goals?view=${view}`;
}
export function goalReturn(route: string) {
  return goalsPath(goalView(route));
}
