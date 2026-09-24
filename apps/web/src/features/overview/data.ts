import type { ActivitySummary } from '@activus/contracts';
import type { JournalApi } from '../../services/configuration-api.js';

export function currentMonth(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  return {
    dateFrom: `${prefix}-01`,
    dateTo: `${prefix}-${new Date(year, month + 1, 0).getDate()}`,
    label: new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric',
    }).format(now),
  };
}

// Read every page before publishing totals. A failed page never becomes a
// misleading partial total. This uses the Journal's existing date semantics.
export async function monthSummary(
  api: Pick<JournalApi, 'listActivities'>,
  month: ReturnType<typeof currentMonth>,
  signal: AbortSignal,
) {
  const entries = new Map<string, ActivitySummary>();
  let offset = 0;
  for (;;) {
    signal.throwIfAborted();
    const page = await api.listActivities(
      { dateFrom: month.dateFrom, dateTo: month.dateTo, limit: 100, offset },
      signal,
    );
    for (const item of page.items) entries.set(item.id, item);
    if (!page.pagination.hasMore) break;
    const next = page.pagination.nextOffset;
    if (next === null || next <= offset || next > 1_000_000)
      throw new Error('Activity pagination could not be completed');
    offset = next;
  }
  let durationSeconds = 0;
  let missingDuration = 0;
  let partial = 0;
  const kinds = new Map<string, { id: string; name: string; count: number }>();
  for (const item of entries.values()) {
    if (item.durationSeconds === null) missingDuration++;
    else durationSeconds += item.durationSeconds;
    if (item.isPartial) partial++;
    const kind = kinds.get(item.kind.id) ?? {
      id: item.kind.id,
      name: item.kind.name,
      count: 0,
    };
    kind.count++;
    kinds.set(kind.id, kind);
  }
  return {
    count: entries.size,
    durationSeconds,
    missingDuration,
    partial,
    kinds: [...kinds.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    ),
  };
}
