import { Hono } from 'hono';
import { ActivityListQuerySchema } from '@activus/contracts';
import { jsonBody, query } from '../../transport.js';
import type { ActivityService } from './service.js';

export function activityRoutes(service: ActivityService) {
  const routes = new Hono();
  routes.get('/', async (c) =>
    c.json(
      await service.list(query(c, ActivityListQuerySchema, 'ACTIVITY_INVALID')),
    ),
  );
  routes.post('/', async (c) => {
    const activity = await service.create(
      await jsonBody(c, 'ACTIVITY_INVALID'),
    );
    c.header('Location', `/api/v1/activities/${activity.id}`);
    return c.json(activity, 201);
  });
  routes.get('/:id', async (c) => c.json(await service.get(c.req.param('id'))));
  routes.patch('/:id', async (c) =>
    c.json(
      await service.update(
        c.req.param('id'),
        await jsonBody(c, 'ACTIVITY_INVALID'),
      ),
    ),
  );
  routes.delete('/:id', async (c) => {
    await service.delete(c.req.param('id'));
    return c.body(null, 204);
  });
  return routes;
}
