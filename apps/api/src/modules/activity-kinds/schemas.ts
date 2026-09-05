import { z } from 'zod';

export {
  CreateActivityKindRequestSchema,
  UpdateActivityKindRequestSchema,
} from '@activus/contracts';
export const ActivityKindIdSchema = z
  .uuid()
  .transform((id) => id.toLowerCase());
export const ActivityKindListQuerySchema = z.strictObject({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
