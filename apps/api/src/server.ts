import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { pino } from 'pino';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';

const envFile = new URL('../../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const config = parseEnv(process.env);
const logger = pino({ level: config.LOG_LEVEL });
const app = createApp(config, logger);
const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info({ port: info.port }, 'API listening');
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  logger.info('API shutting down');
  const deadline = setTimeout(() => {
    if ('closeAllConnections' in server) server.closeAllConnections();
    process.exitCode = 1;
  }, 5000);
  deadline.unref();
  server.close((error) => {
    clearTimeout(deadline);
    if (error) process.exitCode = 1;
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
