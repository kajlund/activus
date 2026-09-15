import { z } from 'zod';

const postgresUrl = z
  .url()
  .refine(
    (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
    'Must be a PostgreSQL URL',
  );

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: postgresUrl.optional(),
  TEST_DATABASE_URL: postgresUrl.optional(),
  WEB_ORIGIN: z
    .url()
    .refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
    }, 'Must be an HTTP(S) origin without a path or trailing slash')
    .default('http://localhost:5173'),
  STATIC_DIR: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;
export type DatabaseConfig = Config & { DATABASE_URL: string };

export function requireDatabase(config: Config): DatabaseConfig {
  if (!config.DATABASE_URL)
    throw new Error(
      'Invalid environment configuration: DATABASE_URL is required',
    );
  return { ...config, DATABASE_URL: config.DATABASE_URL };
}

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
