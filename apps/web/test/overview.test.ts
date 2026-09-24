import { afterEach, expect, it, vi } from 'vitest';
import { currentMonth, monthSummary } from '../src/features/overview/data.js';
import { OverviewPage } from '../src/features/overview/page.js';
import { journalFixture } from './support/journal.js';
import { fixedDetail } from './support/goal-detail.js';

afterEach(() => document.body.replaceChildren());

it('uses local calendar month boundaries, including leap years', () => {
  expect(currentMonth(new Date(2024, 1, 29, 23, 59))).toMatchObject({
    dateFrom: '2024-02-01',
    dateTo: '2024-02-29',
  });
  expect(currentMonth(new Date(2026, 11, 31))).toMatchObject({
    dateFrom: '2026-12-01',
    dateTo: '2026-12-31',
  });
});

it('reads all pages and distinguishes zero, missing duration and partial entries', async () => {
  const f = await journalFixture(3);
  const page = await f.api.listActivities({ limit: 100, offset: 0 });
  page.items[0]!.durationSeconds = 0;
  page.items[1]!.durationSeconds = null;
  page.items[1]!.isPartial = true;
  page.items[2]!.durationSeconds = 61;
  const listActivities = vi
    .fn()
    .mockResolvedValueOnce({
      items: page.items.slice(0, 2),
      pagination: { hasMore: true, nextOffset: 2 },
    })
    .mockResolvedValueOnce({
      items: page.items.slice(2),
      pagination: { hasMore: false, nextOffset: null },
    });
  const result = await monthSummary(
    { listActivities },
    currentMonth(new Date(2026, 8, 10)),
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    count: 3,
    durationSeconds: 61,
    missingDuration: 1,
    partial: 1,
    kinds: [{ id: f.kind.id, count: 3 }],
  });
  expect(listActivities.mock.calls[1]![0]).toMatchObject({
    offset: 2,
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
  });
});

it('does not publish incomplete totals if a later page fails', async () => {
  const listActivities = vi
    .fn()
    .mockResolvedValueOnce({
      items: [],
      pagination: { hasMore: true, nextOffset: 100 },
    })
    .mockRejectedValueOnce(new Error('offline'));
  await expect(
    monthSummary(
      { listActivities },
      currentMonth(),
      new AbortController().signal,
    ),
  ).rejects.toThrow('offline');
});

it('keeps other sections useful when goals fail, and recovers with retry', async () => {
  const f = await journalFixture(1);
  const page = new OverviewPage();
  const overviewGoals = vi.fn().mockRejectedValue(new Error('offline'));
  page.api = {
    listActivities: f.api.listActivities.bind(f.api),
    overviewGoals,
  };
  document.body.append(page);
  await vi.waitFor(() =>
    expect(page.shadowRoot!.textContent).toContain('Entry 01'),
  );
  const root = page.shadowRoot!;
  expect(root.querySelector('h1')?.textContent).toBe('Overview');
  expect(root.querySelectorAll('a[href="/activities/new"]')).toHaveLength(1);
  expect(root.querySelector('[role="alert"]')).not.toBeNull();
  overviewGoals.mockResolvedValue({
    items: [{ ...fixedDetail, displayCurrent: null, progress: null }],
    hasGoals: true,
  });
  root.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(() =>
    expect(root.textContent).toContain('Progress unavailable'),
  );
  expect(root.querySelector('[role="alert"]')).toBeNull();
  expect(root.textContent).not.toContain('0 of 500');
});
