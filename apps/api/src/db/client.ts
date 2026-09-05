import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Logger } from 'pino';
import type { DatabaseConfig } from '../config/env.js';
import * as schema from './schema.js';

// Calling this factory creates a lazy pool; open() explicitly verifies connectivity.
export function createDatabase(config: DatabaseConfig, logger: Logger) {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    options: '-c timezone=UTC -c statement_timeout=10000',
  });
  pool.on('error', () =>
    logger.error(
      { code: 'DATABASE_CONNECTION_ERROR' },
      'Idle database connection failed',
    ),
  );
  const db = drizzle(pool, { schema });
  let closing: Promise<void> | undefined;
  return {
    db,
    async open() {
      await pool.query('SELECT 1');
    },
    close() {
      return (closing ??= pool.end());
    },
  };
}

export type Database = ReturnType<typeof createDatabase>['db'];
