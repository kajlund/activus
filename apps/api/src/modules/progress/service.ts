import {
  ProgressResponseSchema,
  measurementUnits,
  type ProgressMetric,
  type ProgressQuery,
} from '@activus/contracts';
import { ApiError } from '../../errors.js';
import {
  decimal,
  decimalString,
  divideForDisplay,
} from '../activities/decimal.js';
import { helsinkiToday, progressRanges, trendBuckets } from './periods.js';
import type { ProgressRepository } from './repository.js';

export const countMetric: ProgressMetric = {
  id: 'count',
  name: 'Activities',
  aggregation: 'total',
  displayUnit: null,
  precision: 0,
};
export const durationMetric: ProgressMetric = {
  id: 'duration',
  name: 'Duration',
  aggregation: 'total',
  displayUnit: 'hour-minute',
  precision: 0,
};
export function progressValue(metric: ProgressMetric, value: string | null) {
  if (value === null) return null;
  const unit = measurementUnits.find((u) => u.id === metric.displayUnit);
  return {
    canonical: decimalString(decimal(value)),
    display: divideForDisplay(
      decimal(value),
      decimal(unit?.factorToCanonical ?? 1),
      metric.precision ?? unit?.defaultPrecision ?? 0,
    ),
  };
}
export function changePercent(current: string | null, previous: string | null) {
  if (current === null || previous === null) return null;
  const a = decimal(current),
    b = decimal(previous);
  if (b.coefficient <= 0n) return null;
  const scale = Math.max(a.scale, b.scale);
  const delta =
    a.coefficient * 10n ** BigInt(scale - a.scale) -
    b.coefficient * 10n ** BigInt(scale - b.scale);
  return divideForDisplay({ coefficient: delta * 100n, scale }, b, 1);
}
export async function readProgress(
  repository: ProgressRepository,
  q: ProgressQuery,
  today = helsinkiToday(),
) {
  const metadata = await repository.metadata(q);
  const kind = metadata.kinds.find((k) => k.id === q.kindId);
  if (q.kindId && !kind)
    throw new ApiError(400, 'INVALID_PROGRESS_QUERY', 'Unknown activity kind');
  const variants = metadata.variants.filter(
    (v) => v.activityKindId === q.kindId,
  );
  if (q.variantId && !variants.some((v) => v.id === q.variantId))
    throw new ApiError(
      400,
      'INVALID_PROGRESS_QUERY',
      'Variant must belong to the selected kind',
    );
  const definitions = metadata.definitions.filter(
    (d) =>
      (!q.kindId || d.activityKindId === q.kindId) &&
      (!q.variantId ||
        !d.activityVariantId ||
        d.activityVariantId === q.variantId),
  );
  const metricFor = (d: (typeof definitions)[number]): ProgressMetric => ({
    id: d.id,
    name: `${d.name}${!q.kindId ? ` · ${metadata.kinds.find((k) => k.id === d.activityKindId)?.name ?? ''}` : ''}${d.activityVariantId ? ` · ${metadata.variants.find((v) => v.id === d.activityVariantId)?.name ?? ''}` : ''}${d.archivedAt ? ' (archived)' : ''}`,
    aggregation:
      d.aggregation === 'none'
        ? 'latest'
        : (d.aggregation as ProgressMetric['aggregation']),
    displayUnit: d.displayUnit as ProgressMetric['displayUnit'],
    precision: d.precision,
  });
  const metrics = [
    countMetric,
    ...(metadata.dates.durations !== '0' ? [durationMetric] : []),
    ...definitions
      .filter(
        (d) =>
          !['boolean', 'text'].includes(d.valueType) &&
          d.aggregation !== 'none',
      )
      .map(metricFor),
  ];
  const metric = q.metricId
    ? metrics.find((m) => m.id === q.metricId)
    : (metrics.find((m) => m.id === kind?.primaryMeasurementDefinitionId) ??
      metrics.find((m) => m.id === 'duration') ??
      countMetric);
  if (!metric)
    throw new ApiError(
      400,
      'INVALID_PROGRESS_QUERY',
      'Metric is not available for this activity scope',
    );
  const { range, previousRange } = progressRanges(
    q,
    today,
    metadata.dates.earliest,
  );
  if (
    q.period === 'all' &&
    metadata.dates.latest &&
    metadata.dates.latest > range.endDate
  )
    range.endDate = metadata.dates.latest;
  const { grouping, buckets } = trendBuckets(range);
  const selectedDefinition = definitions.find((d) => d.id === metric.id);
  const selectedDuration =
    selectedDefinition?.valueType === 'duration' &&
    selectedDefinition.name.trim().toLowerCase() === 'duration' &&
    metric.aggregation === 'total';
  const summaryMetrics = [
    countMetric,
    ...(selectedDuration ? [] : [durationMetric]),
    ...(['count', 'duration'].includes(metric.id) ? [] : [metric]),
  ];
  const totals: Array<Array<string | null>> = [];
  for (const m of summaryMetrics) {
    totals.push(
      await repository.aggregate(q, m, [
        range,
        ...(previousRange ? [previousRange] : []),
      ]),
    );
  }
  const trend = await repository.aggregate(q, metric, buckets);
  const records = await repository.records(q);
  return ProgressResponseSchema.parse({
    range,
    previousRange,
    grouping,
    metricId: metric.id,
    metrics,
    kinds: metadata.kinds.map((k) => ({
      id: k.id,
      name: k.name,
      isArchived: k.archivedAt !== null,
    })),
    variants: variants.map((v) => ({
      id: v.id,
      name: v.name,
      isArchived: v.archivedAt !== null,
    })),
    summaries: summaryMetrics.map((m, i) => ({
      metric: m,
      value: progressValue(m, totals[i]?.[0] ?? null),
      previous: progressValue(m, totals[i]?.[1] ?? null),
      changePercent: changePercent(
        totals[i]?.[0] ?? null,
        totals[i]?.[1] ?? null,
      ),
    })),
    trend: buckets.map((b, i) => ({
      ...b,
      value: progressValue(metric, trend[i] ?? null),
    })),
    records: records.map((r) => {
      const d = definitions.find((d) => d.id === r.definitionId)!;
      const m = metricFor(d);
      return { ...r, metric: m, value: progressValue(m, r.value) };
    }),
  });
}
