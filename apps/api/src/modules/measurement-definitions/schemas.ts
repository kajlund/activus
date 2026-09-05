import { z } from 'zod';
export {
  CreateMeasurementDefinitionRequestSchema,
  UpdateMeasurementDefinitionRequestSchema,
} from '@activus/contracts';
export const MeasurementListQuerySchema = z
  .strictObject({
    includeArchived: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    activityVariantId: z
      .uuid()
      .transform((id) => id.toLowerCase())
      .optional(),
    effective: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .refine((query) => !query.effective || query.activityVariantId !== undefined);
