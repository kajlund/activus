import { afterEach, expect, it, vi } from 'vitest';
import type { ProgressResponse } from '@activus/contracts';
import { ProgressPage } from '../src/features/progress/page.js';

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
});
it('keeps the newest filters when older requests finish late and provides a chart alternative', async () => {
  history.replaceState(null, '', '/progress/trends');
  const metric = {
    id: 'count',
    name: 'Activities',
    aggregation: 'total' as const,
    displayUnit: null,
    precision: 0,
  };
  const response: ProgressResponse = {
    range: { startDate: '2026-01-01', endDate: '2026-09-30' },
    previousRange: null,
    grouping: 'month',
    kinds: [],
    variants: [],
    metrics: [metric],
    metricId: 'count',
    summaries: [
      {
        metric,
        value: { canonical: '2', display: '2' },
        previous: null,
        changePercent: null,
      },
    ],
    trend: [
      {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        value: { canonical: '2', display: '2' },
      },
    ],
    records: [],
  };
  let resolveOld!: (value: ProgressResponse) => void;
  const progress = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<ProgressResponse>((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValue(response);
  const page = new ProgressPage();
  page.api = { progress };
  document.body.append(page);
  await page.updateComplete;
  const period = page.shadowRoot!.querySelector('select')!;
  period.value = 'year';
  period.dispatchEvent(new Event('change'));
  await vi.waitFor(() =>
    expect(page.shadowRoot!.querySelector('table')).not.toBeNull(),
  );
  resolveOld({ ...response, metricId: 'stale' });
  await page.updateComplete;
  await Promise.resolve();
  expect(location.search).toContain('period=year');
  expect(progress.mock.calls[0]?.[1].aborted).toBe(true);
  expect(
    page.shadowRoot!.querySelector('svg')?.getAttribute('aria-label'),
  ).toContain('Activities');
  expect(page.shadowRoot!.textContent).toContain(
    'No eligible personal records yet.',
  );
  expect(page.shadowRoot!.querySelector('select')?.value).toBe('year');
});
