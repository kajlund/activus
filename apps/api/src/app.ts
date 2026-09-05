import { randomUUID } from 'node:crypto';
import { HealthResponseSchema } from '@activus/contracts';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { pino, type Logger } from 'pino';
import type { Config } from './config/env.js';

export function createApp(
  config: Config,
  logger: Logger = pino({ level: config.LOG_LEVEL }),
) {
  const app = new Hono<{ Variables: { requestId: string } }>();

  app.use('*', async (c, next) => {
    const requestId = randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    const start = performance.now();
    await next();
    logger.info(
      {
        requestId,
        method: c.req.method,
        route: c.req.routePath || 'unmatched',
        status: c.res.status,
        durationMs: performance.now() - start,
      },
      'Request completed',
    );
  });
  app.use('/api/*', cors({ origin: config.WEB_ORIGIN }));

  app.get('/api/health', (c) =>
    c.json(HealthResponseSchema.parse({ status: 'ok' })),
  );

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
          requestId: c.get('requestId'),
        },
      },
      404,
    ),
  );
  app.onError((_error, c) => {
    // Do not serialize arbitrary errors: their messages may contain private input.
    logger.error(
      { requestId: c.get('requestId'), code: 'INTERNAL_ERROR' },
      'Unexpected request error',
    );
    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          requestId: c.get('requestId'),
        },
      },
      500,
    );
  });

  return app;
}
