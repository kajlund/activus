import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z
    .url()
    .refine(
      (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
      'Must be a PostgreSQL URL',
    )
    .optional(),
  WEB_ORIGIN: z
    .url()
    .refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
    }, 'Must be an HTTP(S) origin without a path or trailing slash')
    .default('http://localhost:5173'),
});

export type Config = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, string | undefined>): Config {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    // Report field names only: invalid values may contain credentials.
    throw new Error(
      `Invalid environment configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  }
  return result.data;
}
