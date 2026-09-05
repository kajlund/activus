import type { Config, DatabaseConfig } from '../../src/config/env.js';

export function testDatabaseConfig(config: Config): DatabaseConfig {
  if (!config.TEST_DATABASE_URL)
    throw new Error(
      'TEST_DATABASE_URL is required for PostgreSQL integration tests',
    );
  const test = new URL(config.TEST_DATABASE_URL);
  const database = decodeURIComponent(test.pathname.slice(1));
  const username = decodeURIComponent(test.username);
  const normalDatabase = config.DATABASE_URL
    ? decodeURIComponent(new URL(config.DATABASE_URL).pathname.slice(1))
    : undefined;
  // Reject database aliases, libpq query overrides and ambiguous names before opening any connection.
  if (
    config.NODE_ENV === 'production' ||
    test.search ||
    test.hash ||
    !test.hostname ||
    !/^activus_test(?:_[a-z0-9_]+)?$/.test(database) ||
    username !== 'activus_test' ||
    database === normalDatabase
  ) {
    throw new Error(
      'Unsafe test database configuration: use a distinct activus_test database and activus_test role without URL query parameters',
    );
  }
  return { ...config, DATABASE_URL: config.TEST_DATABASE_URL };
}
