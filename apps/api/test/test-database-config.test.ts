import { expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { testDatabaseConfig } from './support/test-database-config.js';

it('accepts an explicitly named, separate test database and dedicated role', () => {
  expect(
    testDatabaseConfig(
      parseEnv({
        DATABASE_URL: 'postgres://app@localhost/activus',
        TEST_DATABASE_URL: 'postgres://activus_test@localhost/activus_test',
      }),
    ).DATABASE_URL,
  ).toBe('postgres://activus_test@localhost/activus_test');
});

it.each([
  {},
  { TEST_DATABASE_URL: 'postgres://activus_test@localhost/activus' },
  { TEST_DATABASE_URL: 'postgres://postgres@localhost/activus_test' },
  {
    TEST_DATABASE_URL:
      'postgres://activus_test@localhost/activus_test?dbname=activus',
  },
  {
    TEST_DATABASE_URL: 'postgres://activus_test@localhost/activus_test',
    DATABASE_URL: 'postgres://other@127.0.0.1/activus_test',
  },
  {
    TEST_DATABASE_URL: 'postgres://activus_test@localhost/activus_test',
    NODE_ENV: 'production',
  },
])('rejects unsafe configuration before database access: %o', (input) => {
  expect(() => testDatabaseConfig(parseEnv(input))).toThrow();
});
