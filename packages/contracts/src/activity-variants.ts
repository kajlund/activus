import { z } from 'zod';

export const CreateActivityVariantRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(2147483647),
  isDefault: z.boolean(),
});
export type CreateActivityVariantRequest = z.infer<
  typeof CreateActivityVariantRequestSchema
>;
export const UpdateActivityVariantRequestSchema =
  CreateActivityVariantRequestSchema.partial().refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    'At least one field is required',
  );
export type UpdateActivityVariantRequest = z.infer<
  typeof UpdateActivityVariantRequestSchema
>;
export const ActivityVariantSchema = CreateActivityVariantRequestSchema.extend({
  id: z.uuid(),
  activityKindId: z.uuid(),
  isArchived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ActivityVariant = z.infer<typeof ActivityVariantSchema>;
export const ActivityVariantListResponseSchema = z.strictObject({
  items: z.array(ActivityVariantSchema),
});
export type ActivityVariantListResponse = z.infer<
  typeof ActivityVariantListResponseSchema
>;
