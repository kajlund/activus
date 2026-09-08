import {
  ActivityListQuerySchema,
  type ActivityListQuery,
} from '@activus/contracts';

export const pageSize = 25;
export type Filters = Pick<
  ActivityListQuery,
  | 'dateFrom'
  | 'dateTo'
  | 'activityKindId'
  | 'activityVariantId'
  | 'tagIds'
  | 'tagMatch'
>;
const keys = [
  'dateFrom',
  'dateTo',
  'activityKindId',
  'activityVariantId',
  'tagIds',
  'tagMatch',
] as const;
export function parseJournal(search: string): {
  filters: Filters;
  normalized: boolean;
} {
  const params = new URLSearchParams(search);
  const raw: Record<string, string> = {};
  for (const key of keys)
    if (params.getAll(key).length === 1 && params.get(key))
      raw[key] = params.get(key)!;
  // Validate each independent filter before checking relationships and ranges.
  for (const key of keys) {
    if (!(key in raw) || key === 'tagMatch') continue;
    if (!ActivityListQuerySchema.safeParse({ [key]: raw[key] }).success)
      delete raw[key];
  }
  if (!raw['tagIds']) delete raw['tagMatch'];
  else if (raw['tagMatch'] !== 'all') raw['tagMatch'] = 'any';
  if (!raw['activityKindId']) delete raw['activityVariantId'];
  if (raw['dateFrom'] && raw['dateTo'] && raw['dateFrom'] > raw['dateTo']) {
    delete raw['dateFrom'];
    delete raw['dateTo'];
  }
  const parsed = ActivityListQuerySchema.parse(raw);
  const filters: Filters = Object.fromEntries(
    keys
      .filter((key) => parsed[key] !== undefined)
      .map((key) => [key, parsed[key]]),
  );
  const canonical = new URLSearchParams(
    journalPath(filters).split('?')[1] ?? '',
  );
  const cleaned = new URLSearchParams(params);
  cleaned.delete('saved');
  cleaned.delete('deleted');
  canonical.sort();
  cleaned.sort();
  return { filters, normalized: canonical.toString() !== cleaned.toString() };
}
export function journalPath(filters: Filters = {}) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = filters[key];
    if (value !== undefined && (!Array.isArray(value) || value.length))
      params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return `/activities${params.size ? `?${params}` : ''}`;
}
export function safeReturn(raw: string | null): string {
  if (
    !raw ||
    raw.length > 6000 ||
    !raw.startsWith('/activities') ||
    raw.startsWith('//')
  )
    return '/activities';
  try {
    const url = new URL(raw, 'http://local');
    if (url.origin !== 'http://local') return '/activities';
    if (url.pathname === '/activities')
      return journalPath(parseJournal(url.search).filters);
    if (/^\/activities\/[0-9a-f-]{36}$/i.test(url.pathname)) {
      const back = url.searchParams.get('returnTo');
      return `${url.pathname}${back?.startsWith('/activities?') ? `?returnTo=${encodeURIComponent(journalPath(parseJournal(back.slice(back.indexOf('?'))).filters))}` : ''}`;
    }
  } catch {
    /* Invalid URLs return to the journal. */
  }
  return '/activities';
}
export function withReturn(path: string, destination: string) {
  return `${path}${path.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(safeReturn(destination))}`;
}
export function withNotice(
  path: string,
  key: 'saved' | 'deleted',
  value: string,
) {
  const url = new URL(path, 'http://local');
  url.searchParams.set(key, value);
  return url.pathname + url.search;
}
