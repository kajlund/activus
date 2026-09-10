import { Hono } from 'hono';
import {
  GoalListQuerySchema,
  GoalOverviewQuerySchema,
} from '@activus/contracts';
import { jsonBody, query } from '../../transport.js';
import type { GoalService } from './service.js';
import type { GoalProgressService } from './progress-service.js';
export function goalRoutes(
  service: GoalService,
  progress?: GoalProgressService,
) {
  const routes = new Hono();
  if (progress)
    routes.get('/overview', async (c) =>
      c.json(
        await progress.overview(
          query(c, GoalOverviewQuerySchema, 'GOAL_INVALID'),
        ),
      ),
    );
  routes.get('/', async (c) =>
    c.json(await service.list(query(c, GoalListQuerySchema, 'GOAL_INVALID'))),
  );
  routes.post('/', async (c) => {
    const goal = await service.create(await jsonBody(c, 'GOAL_INVALID'));
    c.header('Location', `/api/v1/goals/${goal.id}`);
    return c.json(goal, 201);
  });
  routes.get('/:id', async (c) => c.json(await service.get(c.req.param('id'))));
  if (progress)
    routes.get('/:id/progress', async (c) =>
      c.json(await progress.get(c.req.param('id'), c.req.query())),
    );
  routes.patch('/:id', async (c) =>
    c.json(
      await service.update(
        c.req.param('id'),
        await jsonBody(c, 'GOAL_INVALID'),
      ),
    ),
  );
  routes.post('/:id/archive', async (c) =>
    c.json(await service.archive(c.req.param('id'))),
  );
  routes.post('/:id/restore', async (c) =>
    c.json(await service.restore(c.req.param('id'))),
  );
  return routes;
}
