import { z } from 'zod';
import { TagIdSchema } from './tags.js';

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
  lifecycle: z.enum(['upcoming', 'active', 'ended']).optional(),
});
export const GoalListResponseSchema = z.strictObject({
  items: z.array(GoalSchema),
});
export type CreateGoalRequest = z.infer<typeof CreateGoalRequestSchema>;
export type UpdateGoalRequest = z.infer<typeof UpdateGoalRequestSchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type GoalListQuery = z.infer<typeof GoalListQuerySchema>;
