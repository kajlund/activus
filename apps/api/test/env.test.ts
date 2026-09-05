import { expect, it } from 'vitest';
import { parseEnv, requireDatabase } from '../src/config/env.js';

it('allows app-only tests without a database', () => {
  expect(parseEnv({}).DATABASE_URL).toBeUndefined();
});

it('requires a validated database URL for real startup', () => {
  expect(() => requireDatabase(parseEnv({}))).toThrow(
    'DATABASE_URL is required',
  );
  expect(
    requireDatabase(
      parseEnv({ DATABASE_URL: 'postgresql://localhost/activus' }),
    ).DATABASE_URL,
  ).toBe('postgresql://localhost/activus');
});

it.each([
  { NODE_ENV: 'invalid' },
  { PORT: '0' },
  { PORT: '65536' },
  { PORT: 'abc' },
  { LOG_LEVEL: 'invalid' },
  { DATABASE_URL: 'https://example.com' },
  { WEB_ORIGIN: 'https://example.com/path' },
])('rejects invalid environment values: %o', (input) => {
  expect(() => parseEnv(input)).toThrow('Invalid environment configuration');
});
