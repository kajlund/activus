import { z } from 'zod';
import { ActivityDateSchema, ExactDecimalSchema } from './activities.js';
import { MeasurementUnitIdSchema } from './measurement-units.js';

export const progressPeriods = [
  '30d',
  '3m',
  '12m',
  'year',
  'previous-year',
  'all',
  'custom',
] as const;
export const ProgressQuerySchema = z
  .strictObject({
    period: z.enum(progressPeriods).default('12m'),
    startDate: ActivityDateSchema.optional(),
    endDate: ActivityDateSchema.optional(),
    kindId: z.uuid().toLowerCase().optional(),
    variantId: z.uuid().toLowerCase().optional(),
    metricId: z
      .union([z.enum(['count', 'duration']), z.uuid().toLowerCase()])
      .optional(),
  })
  .refine((q) => !q.variantId || !!q.kindId)
  .refine(
    (q) =>
      q.period !== 'custom' ||
      (!!q.startDate && !!q.endDate && q.startDate <= q.endDate),
  );
export type ProgressQuery = z.infer<typeof ProgressQuerySchema>;
const range = z.object({
  startDate: ActivityDateSchema,
  endDate: ActivityDateSchema,
});
const choice = z.object({
  id: z.uuid(),
  name: z.string(),
  isArchived: z.boolean(),
});
export const ProgressMetricSchema = z.object({
  id: z.string(),
  name: z.string(),
  aggregation: z.enum(['total', 'average', 'latest', 'minimum']),
  displayUnit: MeasurementUnitIdSchema.nullable(),
  precision: z.number().nullable(),
});
export type ProgressMetric = z.infer<typeof ProgressMetricSchema>;
const value = z
  .object({ canonical: ExactDecimalSchema, display: ExactDecimalSchema })
  .nullable();
export const ProgressResponseSchema = z.object({
  range,
  previousRange: range.nullable(),
  grouping: z.enum(['day', 'week', 'month', 'year']),
  kinds: z.array(choice),
  variants: z.array(choice),
  metrics: z.array(ProgressMetricSchema),
  metricId: z.string(),
  summaries: z.array(
    z.object({
      metric: ProgressMetricSchema,
      value,
      previous: value,
      changePercent: ExactDecimalSchema.nullable(),
    }),
  ),
  trend: z.array(
    z.object({
      startDate: ActivityDateSchema,
      endDate: ActivityDateSchema,
      value,
    }),
  ),
  records: z.array(
    z.object({
      metric: ProgressMetricSchema,
      value,
      activityId: z.uuid(),
      activityDate: ActivityDateSchema,
      kindName: z.string(),
      variantName: z.string().nullable(),
    }),
  ),
});
export type ProgressResponse = z.infer<typeof ProgressResponseSchema>;
