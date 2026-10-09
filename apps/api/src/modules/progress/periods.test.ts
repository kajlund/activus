import { expect, it } from 'vitest';
import { ProgressQuerySchema } from '@activus/contracts';
import { helsinkiToday, progressRanges, trendBuckets } from './periods.js';
import { changePercent } from './service.js';

it('uses inclusive Helsinki dates, calendar months, leap-year comparisons and bounded buckets', () => {
  expect(helsinkiToday(new Date('2026-03-28T22:30:00Z'))).toBe('2026-03-29');
  expect(helsinkiToday(new Date('2026-10-24T21:30:00Z'))).toBe('2026-10-25');
  expect(progressRanges({ period: '30d' }, '2026-03-30', null)).toEqual({
    range: { startDate: '2026-03-01', endDate: '2026-03-30' },
    previousRange: { startDate: '2026-01-30', endDate: '2026-02-28' },
  });
  expect(progressRanges({ period: '3m' }, '2026-05-31', null)).toEqual({
    range: { startDate: '2026-03-01', endDate: '2026-05-31' },
    previousRange: { startDate: '2025-12-01', endDate: '2026-02-28' },
  });
  expect(
    progressRanges({ period: 'year' }, '2024-02-29', null).previousRange,
  ).toEqual({ startDate: '2023-01-01', endDate: '2023-02-28' });
  expect(
    progressRanges({ period: 'previous-year' }, '2025-03-01', null)
      .previousRange,
  ).toEqual({ startDate: '2023-01-01', endDate: '2023-12-31' });
  expect(
    progressRanges(
      { period: 'custom', startDate: '2026-03-28', endDate: '2026-03-30' },
      '2026-04-01',
      null,
    ).previousRange,
  ).toEqual({ startDate: '2026-03-25', endDate: '2026-03-27' });
  expect(
    progressRanges({ period: 'all' }, '2026-04-01', '2020-01-01').previousRange,
  ).toBeNull();
  expect(
    progressRanges(
      { period: 'custom', startDate: '0001-01-01', endDate: '0001-01-02' },
      '2026-04-01',
      null,
    ).previousRange,
  ).toBeNull();
  expect(
    trendBuckets({ startDate: '9999-12-30', endDate: '9999-12-31' }).buckets,
  ).toHaveLength(2);
  expect(
    ProgressQuerySchema.safeParse({
      period: 'custom',
      startDate: '2026-02-30',
      endDate: '2026-03-01',
    }).success,
  ).toBe(false);
  expect(ProgressQuerySchema.safeParse({ grouping: 'bad' }).success).toBe(
    false,
  );
  expect(changePercent('10', '0')).toBeNull();
  expect(changePercent(null, '2')).toBeNull();
  expect(changePercent('112', '100')).toBe('12');
});
