import { z } from 'zod';

export const ApiErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().uuid(),
    details: z
      .strictObject({
        incompatibleDefinitionIds: z.array(z.uuid()).optional(),
        missingDefinitionIds: z.array(z.uuid()).optional(),
      })
      .optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
