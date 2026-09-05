import { z } from 'zod';

export const TagIdSchema = z.uuid().transform((v) => v.toLowerCase());
export const ActivityTagIdsSchema = z.array(TagIdSchema).max(100);
export const CreateTagRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .transform((v) => v.toUpperCase())
    .nullable()
    .default(null),
});
export const UpdateTagRequestSchema = CreateTagRequestSchema.extend({
  color: CreateTagRequestSchema.shape.color.removeDefault(),
})
  .partial()
  .refine(
    (v) => Object.values(v).some((x) => x !== undefined),
    'At least one field is required',
  );
export const TagSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/)
    .nullable(),
  isArchived: z.boolean(),
});
export const TagSchema = TagSummarySchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const TagListQuerySchema = z.strictObject({
  includeArchived: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(false),
  search: z.string().trim().min(1).max(120).optional(),
});
export const TagListResponseSchema = z.strictObject({
  items: z.array(TagSchema),
});
export type Tag = z.infer<typeof TagSchema>;
export type TagSummary = z.infer<typeof TagSummarySchema>;
export type CreateTagRequest = z.infer<typeof CreateTagRequestSchema>;
export type UpdateTagRequest = z.infer<typeof UpdateTagRequestSchema>;
export type TagListQuery = z.infer<typeof TagListQuerySchema>;
export type TagListResponse = z.infer<typeof TagListResponseSchema>;
