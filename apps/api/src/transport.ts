import type { Context } from 'hono';
import { z } from 'zod';
import { ApiError } from './errors.js';

export function parseId(id: string, code: string) {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new ApiError(400, code, 'Invalid identifier');
  return parsed.data.toLowerCase();
}
export async function jsonBody(c: Context, code: string): Promise<unknown> {
  if (
    c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  )
    throw new ApiError(400, code, 'Expected an application/json body');
  try {
    return await c.req.json();
  } catch {
    throw new ApiError(400, code, 'Malformed JSON body');
  }
}
export function query<T>(c: Context, schema: z.ZodType<T>, code: string): T {
  if (Object.values(c.req.queries()).some((values) => values.length !== 1))
    throw new ApiError(400, code, 'Repeated query parameter');
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success)
    throw new ApiError(400, code, 'Invalid query parameters');
  return parsed.data;
}
