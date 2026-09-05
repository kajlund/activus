import { expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

it('allows startup without a database', () => {
  expect(parseEnv({}).DATABASE_URL).toBeUndefined();
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
