import { Hono, type Context } from 'hono';
import { ApiError } from '../../errors.js';
import { ActivityKindListQuerySchema } from './schemas.js';
import type { ActivityKindService } from './service.js';

async function jsonBody(c: Context): Promise<unknown> {
  if (
    c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  ) {
    throw new ApiError(
      400,
      'ACTIVITY_KIND_INVALID',
      'Expected an application/json body',
    );
  }
  try {
    return await c.req.json();
  } catch {
    throw new ApiError(400, 'ACTIVITY_KIND_INVALID', 'Malformed JSON body');
  }
}

export function activityKindRoutes(service: ActivityKindService) {
  const routes = new Hono();
  routes.get('/', async (c) => {
    const queries = c.req.queries();
    if (Object.values(queries).some((values) => values.length !== 1)) {
      throw new ApiError(
        400,
        'ACTIVITY_KIND_INVALID',
        'Invalid activity kind query',
      );
    }
    const parsed = ActivityKindListQuerySchema.safeParse(c.req.query());
    if (!parsed.success)
      throw new ApiError(
        400,
        'ACTIVITY_KIND_INVALID',
        'Invalid activity kind query',
      );
    return c.json(await service.list(parsed.data.includeArchived));
  });
  routes.post('/', async (c) => {
    const kind = await service.create(await jsonBody(c));
    c.header('Location', `/api/v1/activity-kinds/${kind.id}`);
    return c.json(kind, 201);
  });
  routes.get('/:id', async (c) => c.json(await service.get(c.req.param('id'))));
  routes.patch('/:id', async (c) =>
    c.json(await service.update(c.req.param('id'), await jsonBody(c))),
  );
  routes.post('/:id/archive', async (c) =>
    c.json(await service.archive(c.req.param('id'))),
  );
  routes.post('/:id/restore', async (c) =>
    c.json(await service.restore(c.req.param('id'))),
  );
  return routes;
}
