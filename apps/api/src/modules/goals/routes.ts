import { Hono } from 'hono';
import { GoalListQuerySchema } from '@activus/contracts';
import { jsonBody, query } from '../../transport.js';
import type { GoalService } from './service.js';
export function goalRoutes(service: GoalService) {
  const routes = new Hono();
  routes.get('/', (c) =>
    c.json(service.list(query(c, GoalListQuerySchema, 'GOAL_INVALID'))),
  );
  routes.post('/', async (c) => {
    const goal = await service.create(await jsonBody(c, 'GOAL_INVALID'));
    c.header('Location', `/api/v1/goals/${goal.id}`);
    return c.json(goal, 201);
  });
  routes.get('/:id', (c) => c.json(service.get(c.req.param('id'))));
  routes.patch('/:id', async (c) =>
    c.json(
      await service.update(
        c.req.param('id'),
        await jsonBody(c, 'GOAL_INVALID'),
      ),
    ),
  );
  routes.post('/:id/archive', (c) =>
    c.json(service.archive(c.req.param('id'))),
  );
  routes.post('/:id/restore', (c) =>
    c.json(service.restore(c.req.param('id'))),
  );
  return routes;
}
