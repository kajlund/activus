import { z } from 'zod';

export const ApiErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().uuid(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
