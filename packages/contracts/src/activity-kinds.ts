import { z } from 'zod';

// A deliberately small supported Lucide catalogue, not arbitrary SVG or icon names.
export const activityKindIconNames = [
  'activity',
  'footprints',
  'bike',
  'waves',
  'dumbbell',
  'person-standing',
] as const;
export const ActivityKindIconSchema = z.enum(activityKindIconNames);
const name = z.string().trim().min(1).max(120);
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toUpperCase());
const sortOrder = z.number().int().min(0).max(2147483647);

export const CreateActivityKindRequestSchema = z.strictObject({
  name,
  iconName: ActivityKindIconSchema,
  color,
  sortOrder,
});
export type CreateActivityKindRequest = z.infer<
  typeof CreateActivityKindRequestSchema
>;
export const UpdateActivityKindRequestSchema =
  CreateActivityKindRequestSchema.extend({
    primaryMeasurementDefinitionId: z.uuid().nullable(),
  })
    .partial()
    .refine(
      (value) => Object.values(value).some((field) => field !== undefined),
      'At least one field is required',
    );
export type UpdateActivityKindRequest = z.infer<
  typeof UpdateActivityKindRequestSchema
>;

export const ActivityKindSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  iconName: ActivityKindIconSchema,
  color: z.string().regex(/^#[0-9A-F]{6}$/),
  sortOrder,
  isArchived: z.boolean(),
  primaryMeasurementDefinitionId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ActivityKind = z.infer<typeof ActivityKindSchema>;
export const ActivityKindListResponseSchema = z.strictObject({
  items: z.array(ActivityKindSchema),
});
export type ActivityKindListResponse = z.infer<
  typeof ActivityKindListResponseSchema
>;
