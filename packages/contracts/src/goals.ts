import { z } from 'zod';
import { TagIdSchema } from './tags.js';
import {
  ActivitySummarySchema,
  ActivityPaginationSchema,
} from './activities.js';

export const GoalIdSchema = z.uuid().transform((v) => v.toLowerCase());
export const GoalTargetTypeSchema = z.enum([
  'activity_count',
  'total_duration',
  'measurement_total',
]);
export const GoalScheduleModeSchema = z.enum(['fixed', 'recurring']);
export const GoalRecurrencePeriodSchema = z.enum(['week', 'month', 'year']);
const DateSchema = z.iso.date();
const BaseGoalSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(10000).nullable().default(null),
  activityKindId: z.uuid().transform((v) => v.toLowerCase()),
  activityVariantId: z
    .uuid()
    .transform((v) => v.toLowerCase())
    .nullable()
    .default(null),
  tagIds: z.array(TagIdSchema).max(100).default([]),
  startDate: DateSchema,
  endDate: DateSchema,
});
const GoalRequestFieldsSchema = BaseGoalSchema.extend({
  targetType: GoalTargetTypeSchema,
  targetValue: z.union([
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    z
      .string()
      .regex(/^\d+(?:\.\d{1,6})?$/)
      .refine((v) => Number(v) > 0),
  ]),
  measurementDefinitionId: z
    .uuid()
    .transform((v) => v.toLowerCase())
    .nullable()
    .default(null),
  scheduleMode: GoalScheduleModeSchema,
  recurrencePeriod: GoalRecurrencePeriodSchema.nullable().default(null),
});
const validateGoal = (
  v: z.infer<typeof GoalRequestFieldsSchema>,
  ctx: z.RefinementCtx,
) => {
  if (v.endDate < v.startDate)
    ctx.addIssue({
      code: 'custom',
      message: 'End date must not precede start date',
    });
  if (
    (v.targetType === 'measurement_total') !==
    (v.measurementDefinitionId !== null)
  )
    ctx.addIssue({
      code: 'custom',
      message: 'Measurement reference does not match target type',
    });
  if ((v.scheduleMode === 'recurring') !== (v.recurrencePeriod !== null))
    ctx.addIssue({
      code: 'custom',
      message: 'Recurrence does not match schedule mode',
    });
  if (v.targetType !== 'measurement_total' && typeof v.targetValue !== 'number')
    ctx.addIssue({
      code: 'custom',
      message: 'Count and duration targets are integers',
    });
  if (v.targetType === 'measurement_total' && typeof v.targetValue !== 'string')
    ctx.addIssue({
      code: 'custom',
      message: 'Measurement targets are precise decimals',
    });
};
export const CreateGoalRequestSchema =
  GoalRequestFieldsSchema.superRefine(validateGoal);
export const UpdateGoalRequestSchema = GoalRequestFieldsSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  'At least one field is required',
);
export const GoalSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  targetType: GoalTargetTypeSchema,
  targetValue: z.string(),
  measurementDefinitionId: z.uuid().nullable(),
  activityKindId: z.uuid(),
  activityVariantId: z.uuid().nullable(),
  tagIds: z.array(z.uuid()),
  scheduleMode: GoalScheduleModeSchema,
  recurrencePeriod: GoalRecurrencePeriodSchema.nullable(),
  startDate: DateSchema,
  endDate: DateSchema,
  isArchived: z.boolean(),
  lifecycle: z.enum(['upcoming', 'active', 'ended', 'archived']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const GoalListQuerySchema = z.strictObject({
  includeArchived: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(false),
  lifecycle: z.enum(['upcoming', 'active', 'ended', 'archived']).optional(),
});
export const GoalListResponseSchema = z.strictObject({
  items: z.array(GoalSchema),
});
const GoalProgressBaseSchema = z.strictObject({
  startDate: DateSchema,
  endDate: DateSchema,
  targetValue: z.string(),
  currentValue: z.string(),
  remainingValue: z.string(),
  achieved: z.boolean(),
});
export const FixedGoalProgressSchema = GoalProgressBaseSchema.extend({
  scheduleMode: z.literal('fixed'),
  goalId: z.uuid(),
  targetType: GoalTargetTypeSchema,
  lifecycle: z.enum(['upcoming', 'active', 'ended', 'archived']),
  calculatedAt: z.iso.datetime(),
});
export const RecurringGoalPeriodSchema = GoalProgressBaseSchema.extend({
  temporalState: z.enum(['upcoming', 'current', 'ended']),
  calendarPeriodStart: DateSchema,
  calendarPeriodEnd: DateSchema,
});
export const RecurringGoalProgressSchema = z.strictObject({
  scheduleMode: z.literal('recurring'),
  goalId: z.uuid(),
  targetType: GoalTargetTypeSchema,
  lifecycle: z.enum(['upcoming', 'active', 'ended', 'archived']),
  calculatedAt: z.iso.datetime(),
  periods: z.array(RecurringGoalPeriodSchema),
  summary: z.strictObject({
    periodCount: z.number().int(),
    periodsAchieved: z.number().int(),
    periodsEndedUnachieved: z.number().int(),
  }),
});
export const GoalProgressSchema = z.union([
  FixedGoalProgressSchema,
  RecurringGoalProgressSchema,
]);
export const GoalProgressQuerySchema = z
  .strictObject({ from: DateSchema.optional(), to: DateSchema.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, 'Invalid period range');
export type CreateGoalRequest = z.infer<typeof CreateGoalRequestSchema>;
export type UpdateGoalRequest = z.infer<typeof UpdateGoalRequestSchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type GoalListQuery = z.infer<typeof GoalListQuerySchema>;
export type GoalProgress = z.infer<typeof GoalProgressSchema>;
export type GoalProgressQuery = z.infer<typeof GoalProgressQuerySchema>;

export const GoalOverviewQuerySchema = z.strictObject({
  lifecycle: z
    .enum(['active', 'upcoming', 'ended', 'archived'])
    .default('active'),
});
export const GoalOverviewProgressSchema = z.union([
  FixedGoalProgressSchema,
  RecurringGoalProgressSchema.omit({ periods: true, summary: true }).extend({
    currentPeriod: RecurringGoalPeriodSchema.nullable(),
    completedPeriods: z.number().int(),
    completedPeriodsAchieved: z.number().int(),
  }),
]);
export const GoalOverviewItemSchema = z.strictObject({
  goal: GoalSchema,
  kindName: z.string(),
  iconName: z.string(),
  variantName: z.string().nullable(),
  tagNames: z.array(z.string()),
  measurementName: z.string().nullable(),
  unitSymbol: z.string().nullable(),
  displayCurrent: z.string().nullable(),
  displayTarget: z.string(),
  progress: GoalOverviewProgressSchema.nullable(),
});
export const GoalOverviewResponseSchema = z.strictObject({
  items: z.array(GoalOverviewItemSchema),
  hasGoals: z.boolean(),
});
export type GoalOverviewQuery = z.infer<typeof GoalOverviewQuerySchema>;
export type GoalOverviewItem = z.infer<typeof GoalOverviewItemSchema>;
export type GoalOverviewResponse = z.infer<typeof GoalOverviewResponseSchema>;

export const GoalPeriodRangeSchema = RecurringGoalPeriodSchema.pick({
  startDate: true,
  endDate: true,
  calendarPeriodStart: true,
  calendarPeriodEnd: true,
});
export const GoalDetailSchema = GoalOverviewItemSchema.extend({
  archivedReferences: z.array(z.string()),
  displayRemaining: z.string().nullable(),
  defaultPeriod: GoalPeriodRangeSchema.nullable(),
});
const boundedInteger = (max: number) =>
  z
    .string()
    .regex(/^(0|[1-9]\d*)$/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(max));
export const GoalPeriodsQuerySchema = z.strictObject({
  before: DateSchema.optional(),
  limit: boundedInteger(50).pipe(z.number().min(1)).default(12),
});
export const GoalPeriodsResponseSchema = z.strictObject({
  items: z.array(
    RecurringGoalPeriodSchema.extend({
      displayCurrent: z.string(),
      displayTarget: z.string(),
      displayRemaining: z.string(),
    }),
  ),
  nextBefore: DateSchema.nullable(),
});
export const GoalContributionsQuerySchema = z.strictObject({
  period: DateSchema.optional(),
  limit: boundedInteger(100).pipe(z.number().min(1)).default(25),
  offset: boundedInteger(1000000).default(0),
});
export const GoalContributionsResponseSchema = z.strictObject({
  startDate: DateSchema,
  endDate: DateSchema,
  items: z.array(
    z.strictObject({
      activity: ActivitySummarySchema,
      canonicalContribution: z.string().nullable(),
      displayContribution: z.string().nullable(),
    }),
  ),
  pagination: ActivityPaginationSchema,
});
export type GoalDetail = z.infer<typeof GoalDetailSchema>;
export type GoalPeriodRange = z.infer<typeof GoalPeriodRangeSchema>;
export type GoalPeriodsQuery = z.infer<typeof GoalPeriodsQuerySchema>;
export type GoalPeriodsResponse = z.infer<typeof GoalPeriodsResponseSchema>;
export type GoalContributionsQuery = z.infer<
  typeof GoalContributionsQuerySchema
>;
export type GoalContributionsResponse = z.infer<
  typeof GoalContributionsResponseSchema
>;
