import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { pino } from 'pino';
import { parseEnv, requireDatabase } from '../config/env.js';
import { loadRootEnv } from '../config/load-env.js';
import { createDatabase } from './client.js';

loadRootEnv();
const config = requireDatabase(parseEnv(process.env));
const logger = pino({ level: config.LOG_LEVEL });
const database = createDatabase(config, logger);
try {
  await database.open();
  await migrate(database.db, {
    migrationsFolder: fileURLToPath(
      new URL('../../../../drizzle', import.meta.url),
    ),
  });
  logger.info('Database migrations applied');
} catch {
  logger.error(
    { code: 'DATABASE_MIGRATION_FAILED' },
    'Migration failed; verify database access and migration state',
  );
  process.exitCode = 1;
} finally {
  await database.close();
}
