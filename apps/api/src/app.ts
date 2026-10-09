import { randomUUID } from 'node:crypto';
import { progressRoutes } from './modules/progress/routes.js';
import type { progressSnapshot } from './modules/progress/repository.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { HealthResponseSchema } from '@activus/contracts';
import type { TagRepository } from './modules/tags/model.js';
import { TagService } from './modules/tags/service.js';
import { tagRoutes } from './modules/tags/routes.js';
import type { GoalRepository } from './modules/goals/model.js';
import { GoalService } from './modules/goals/service.js';
import { goalRoutes } from './modules/goals/routes.js';
import { GoalProgressService } from './modules/goals/progress-service.js';
import { createGoalProgressRepository } from './modules/goals/progress-repository.js';
import type { ActivityRepository } from './modules/activities/model.js';
import { ActivityService } from './modules/activities/service.js';
import { activityRoutes } from './modules/activities/routes.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { pino, type Logger } from 'pino';
import type { Config } from './config/env.js';
import { ApiError } from './errors.js';
import type { ActivityKindRepository } from './modules/activity-kinds/model.js';
import { ActivityKindService } from './modules/activity-kinds/service.js';
import { activityKindRoutes } from './modules/activity-kinds/routes.js';
import type { VariantRepository } from './modules/activity-variants/model.js';
import type { MeasurementRepository } from './modules/measurement-definitions/model.js';
import { VariantService } from './modules/activity-variants/service.js';
import { MeasurementService } from './modules/measurement-definitions/service.js';
import { variantRoutes } from './modules/activity-variants/routes.js';
import { measurementRoutes } from './modules/measurement-definitions/routes.js';
import {
  measurementUnits,
  MeasurementUnitListResponseSchema,
} from '@activus/contracts';

export function createApp(
  config: Config,
  logger: Logger = pino({ level: config.LOG_LEVEL }),
  dependencies: {
    activityKinds?: ActivityKindRepository;
    variants?: VariantRepository;
    measurements?: MeasurementRepository;
    activities?: ActivityRepository;
    tags?: TagRepository;
    goals?: GoalRepository;
    goalProgress?: ReturnType<typeof createGoalProgressRepository>;
    staticDir?: string | undefined;
    progress?: ReturnType<typeof progressSnapshot>;
  } = {},
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

  app.use(
    '/api/*',
    cors({
      origin: (origin, c) => {
        if (!origin) return config.WEB_ORIGIN;
        try {
          const requestOrigin = new URL(c.req.url).origin;
          if (origin === config.WEB_ORIGIN || origin === requestOrigin) {
            return origin;
          }
        } catch {
          // ignore
        }
        return config.WEB_ORIGIN;
      },
    }),
  );
  // CORS controls response access, but does not prevent a cross-origin form POST.
  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('Origin');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
      origin &&
      origin !== config.WEB_ORIGIN &&
      origin !== new URL(c.req.url).origin
    )
      throw new ApiError(
        403,
        'ORIGIN_NOT_ALLOWED',
        'This origin is not allowed to change data',
      );
    await next();
  });

  app.get('/health', (c) =>
    c.json(HealthResponseSchema.parse({ status: 'ok' })),
  );

  if (dependencies.tags)
    app.route('/api/v1/tags', tagRoutes(new TagService(dependencies.tags)));
  if (dependencies.progress)
    app.route('/api/v1/progress', progressRoutes(dependencies.progress));
  if (dependencies.goals)
    app.route(
      '/api/v1/goals',
      goalRoutes(
        new GoalService(dependencies.goals),
        dependencies.goalProgress
          ? new GoalProgressService(
              dependencies.goals,
              dependencies.goalProgress,
            )
          : undefined,
      ),
    );

  if (dependencies.activities)
    app.route(
      '/api/v1/activities',
      activityRoutes(new ActivityService(dependencies.activities)),
    );

  if (dependencies.activityKinds) {
    app.route(
      '/api/v1/activity-kinds',
      activityKindRoutes(
        new ActivityKindService(
          dependencies.activityKinds,
          dependencies.measurements,
        ),
      ),
    );
  }

  app.get('/api/v1/measurement-units', (c) =>
    c.json(
      MeasurementUnitListResponseSchema.parse({ items: measurementUnits }),
    ),
  );
  if (dependencies.activityKinds && dependencies.variants)
    app.route(
      '/api/v1',
      variantRoutes(
        new VariantService(dependencies.variants, dependencies.activityKinds),
      ),
    );
  if (
    dependencies.activityKinds &&
    dependencies.variants &&
    dependencies.measurements
  )
    app.route(
      '/api/v1',
      measurementRoutes(
        new MeasurementService(
          dependencies.measurements,
          dependencies.activityKinds,
          dependencies.variants,
        ),
      ),
    );
  const staticDir =
    dependencies.staticDir ??
    config.STATIC_DIR ??
    (() => {
      try {
        if (
          typeof import.meta.url === 'string' &&
          import.meta.url.startsWith('file:')
        ) {
          return fileURLToPath(new URL('../../web/dist', import.meta.url));
        }
      } catch {
        // Non-file environments (e.g. bundled or jsdom tests)
      }
      return undefined;
    })();

  if (staticDir && existsSync(staticDir)) {
    app.use('/*', serveStatic({ root: staticDir }));
    app.get('*', (c, next) => {
      if (
        c.req.path.startsWith('/api/') ||
        c.req.path === '/health' ||
        /\.[a-zA-Z0-9]+$/.test(c.req.path)
      ) {
        return next();
      }
      return serveStatic({ root: staticDir, path: 'index.html' })(c, next);
    });
  }

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
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      logger.info(
        { requestId: c.get('requestId'), code: error.code },
        'Request rejected',
      );
      return c.json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
            requestId: c.get('requestId'),
          },
        },
        error.status,
      );
    }
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
