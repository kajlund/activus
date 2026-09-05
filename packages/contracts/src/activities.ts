import { z } from 'zod';
import { MeasurementUnitIdSchema } from './measurement-units.js';
import { activityKindIconNames } from './activity-kinds.js';

const id = z.uuid().transform((v) => v.toLowerCase());
export const ActivityDateSchema = z.iso
  .date()
  .refine((v) => v >= '0001-01-01', 'Year must be positive');
const seconds = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const rating = z.number().int().min(1).max(5);
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();
export const ExactDecimalSchema = z
  .string()
  .max(48)
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
const measurementId = { measurementDefinitionId: id };
export const ActivityMeasurementInputSchema = z.discriminatedUnion(
  'valueType',
  [
    z.strictObject({
      ...measurementId,
      valueType: z.literal('decimal'),
      value: z.union([
        ExactDecimalSchema,
        z
          .number()
          .finite()
          .min(-Number.MAX_SAFE_INTEGER)
          .max(Number.MAX_SAFE_INTEGER),
      ]),
      unitId: MeasurementUnitIdSchema.optional(),
    }),
    z.strictObject({
      ...measurementId,
      valueType: z.literal('integer'),
      value: z
        .number()
        .int()
        .min(-Number.MAX_SAFE_INTEGER)
        .max(Number.MAX_SAFE_INTEGER),
      unitId: MeasurementUnitIdSchema.optional(),
    }),
    z.strictObject({
      ...measurementId,
      valueType: z.literal('duration'),
      value: seconds,
      unitId: z.literal('second'),
    }),
    z.strictObject({
      ...measurementId,
      valueType: z.literal('rating'),
      value: z.number().int().min(1).max(10),
    }),
    z.strictObject({
      ...measurementId,
      valueType: z.literal('boolean'),
      value: z.boolean(),
    }),
    z.strictObject({
      ...measurementId,
      valueType: z.literal('text'),
      value: z.string().trim().max(500),
    }),
  ],
);
export type ActivityMeasurementInput = z.infer<
  typeof ActivityMeasurementInputSchema
>;
const common = z.strictObject({
  activityKindId: id,
  activityVariantId: id.nullable(),
  activityDate: ActivityDateSchema,
  startedAt: z.iso
    .datetime({ offset: true })
    .refine(
      (v) => !/\.\d{4}/.test(v),
      'At most millisecond precision is supported',
    )
    .transform((v) => new Date(v).toISOString())
    .nullable(),
  durationSeconds: seconds.nullable(),
  name: nullableText(200),
  notes: nullableText(10000),
  effort: rating.nullable(),
  feeling: rating.nullable(),
  isPartial: z.boolean(),
});
export const CreateActivityRequestSchema = common.extend({
  activityVariantId: common.shape.activityVariantId.default(null),
  startedAt: common.shape.startedAt.default(null),
  durationSeconds: common.shape.durationSeconds.default(null),
  name: common.shape.name.default(null),
  notes: common.shape.notes.default(null),
  effort: common.shape.effort.default(null),
  feeling: common.shape.feeling.default(null),
  isPartial: z.boolean().default(false),
  measurements: z.array(ActivityMeasurementInputSchema).max(200),
});
export type CreateActivityRequest = z.infer<typeof CreateActivityRequestSchema>;
export const UpdateActivityRequestSchema = common
  .extend({ measurements: z.array(ActivityMeasurementInputSchema).max(200) })
  .partial()
  .refine(
    (v) => Object.values(v).some((x) => x !== undefined),
    'At least one field is required',
  );
export type UpdateActivityRequest = z.infer<typeof UpdateActivityRequestSchema>;
export const ActivityKindSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  iconName: z.enum(activityKindIconNames),
  color: z.string(),
  isArchived: z.boolean(),
});
export const ActivityVariantSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  isArchived: z.boolean(),
});
export type ActivityKindSummary = z.infer<typeof ActivityKindSummarySchema>;
export type ActivityVariantSummary = z.infer<
  typeof ActivityVariantSummarySchema
>;
const valueMetadata = {
  measurementDefinitionId: z.uuid(),
  name: z.string(),
  isArchived: z.boolean(),
  source: z.enum(['inherited', 'variant-specific']),
  canonicalUnit: MeasurementUnitIdSchema.nullable(),
  displayUnit: MeasurementUnitIdSchema.nullable(),
};
export const ActivityMeasurementSchema = z.discriminatedUnion('valueType', [
  z.strictObject({
    ...valueMetadata,
    valueType: z.literal('decimal'),
    canonicalValue: ExactDecimalSchema,
    displayValue: ExactDecimalSchema,
  }),
  z.strictObject({
    ...valueMetadata,
    valueType: z.enum(['integer', 'duration', 'rating']),
    canonicalValue: z.number().int(),
    displayValue: ExactDecimalSchema,
  }),
  z.strictObject({
    ...valueMetadata,
    valueType: z.literal('boolean'),
    canonicalValue: z.boolean(),
    displayValue: z.boolean(),
  }),
  z.strictObject({
    ...valueMetadata,
    valueType: z.literal('text'),
    canonicalValue: z.string(),
    displayValue: z.string(),
  }),
]);
export type ActivityMeasurement = z.infer<typeof ActivityMeasurementSchema>;
export const ActivitySchema = common.extend({
  id: z.uuid(),
  kind: ActivityKindSummarySchema,
  variant: ActivityVariantSummarySchema.nullable(),
  measurements: z.array(ActivityMeasurementSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Activity = z.infer<typeof ActivitySchema>;
export const ActivitySummarySchema = ActivitySchema.pick({
  id: true,
  activityDate: true,
  startedAt: true,
  name: true,
  kind: true,
  variant: true,
  durationSeconds: true,
  isPartial: true,
}).extend({
  hasNotes: z.boolean(),
  primaryMeasurement: ActivityMeasurementSchema.nullable(),
  fallback: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('duration'), durationSeconds: seconds }),
    z.strictObject({ type: z.literal('none') }),
  ]),
});
export type ActivitySummary = z.infer<typeof ActivitySummarySchema>;
const integerQuery = (min: number, max: number) =>
  z
    .string()
    .regex(/^(0|[1-9]\d*)$/)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
export const ActivityListQuerySchema = z
  .strictObject({
    dateFrom: ActivityDateSchema.optional(),
    dateTo: ActivityDateSchema.optional(),
    activityKindId: id.optional(),
    activityVariantId: id.optional(),
    isPartial: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    search: z.string().trim().min(1).max(200).optional(),
    limit: integerQuery(1, 100).default(25),
    offset: integerQuery(0, 1000000).default(0),
  })
  .refine(
    (v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo,
    'Reversed date range',
  );
export type ActivityListQuery = z.infer<typeof ActivityListQuerySchema>;
export const ActivityPaginationSchema = z.strictObject({
  limit: z.number().int(),
  offset: z.number().int(),
  hasMore: z.boolean(),
  nextOffset: z.number().int().nullable(),
});
export type ActivityPagination = z.infer<typeof ActivityPaginationSchema>;
export const ActivityListResponseSchema = z.strictObject({
  items: z.array(ActivitySummarySchema),
  pagination: ActivityPaginationSchema,
});
export type ActivityListResponse = z.infer<typeof ActivityListResponseSchema>;
