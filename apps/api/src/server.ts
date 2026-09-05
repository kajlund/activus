import { serve } from '@hono/node-server';
import { pino } from 'pino';
import { createApp } from './app.js';
import { parseEnv, requireDatabase } from './config/env.js';
import { loadRootEnv } from './config/load-env.js';
import { createDatabase } from './db/client.js';
import { createActivityKindRepository } from './modules/activity-kinds/repository.js';
import { createVariantRepository } from './modules/activity-variants/repository.js';
import { createMeasurementRepository } from './modules/measurement-definitions/repository.js';
import { createActivityRepository } from './modules/activities/repository.js';

loadRootEnv();
const config = requireDatabase(parseEnv(process.env));
const logger = pino({ level: config.LOG_LEVEL });
const database = createDatabase(config, logger);
try {
  await database.open();
} catch {
  logger.error(
    { code: 'DATABASE_CONNECTION_ERROR' },
    'Cannot start API: database unavailable',
  );
  await database.close();
  process.exit(1);
}
const app = createApp(config, logger, {
  activityKinds: createActivityKindRepository(database.db),
  variants: createVariantRepository(database.db),
  measurements: createMeasurementRepository(database.db),
  activities: createActivityRepository(database.db),
});
const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info({ port: info.port }, 'API listening');
});

let closing = false;
async function closeDatabase() {
  try {
    await database.close();
  } catch {
    logger.error({ code: 'DATABASE_CLOSE_ERROR' }, 'Database shutdown failed');
    process.exitCode = 1;
  }
}
function shutdown() {
  if (closing) return;
  closing = true;
  logger.info('API shutting down');
  const deadline = setTimeout(() => {
    if ('closeAllConnections' in server) server.closeAllConnections();
    logger.error({ code: 'SHUTDOWN_TIMEOUT' }, 'Shutdown deadline exceeded');
    process.exit(1);
  }, 15000);
  deadline.unref();
  server.close((error) => {
    if (error) process.exitCode = 1;
    void closeDatabase().finally(() => clearTimeout(deadline));
  });
}
server.once('error', () => {
  logger.error({ code: 'SERVER_START_ERROR' }, 'API listener failed');
  process.exitCode = 1;
  shutdown();
});
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
