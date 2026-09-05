import { Hono } from 'hono';
import { jsonBody, query } from '../../transport.js';
import { VariantListQuerySchema } from './schemas.js';
import type { VariantService } from './service.js';

export function variantRoutes(service: VariantService) {
  const routes = new Hono();
  const code = 'ACTIVITY_VARIANT_INVALID';
  routes.get('/activity-kinds/:activityKindId/variants', async (c) =>
    c.json(
      await service.list(
        c.req.param('activityKindId'),
        query(c, VariantListQuerySchema, code).includeArchived,
      ),
    ),
  );
  routes.post('/activity-kinds/:activityKindId/variants', async (c) => {
    const row = await service.create(
      c.req.param('activityKindId'),
      await jsonBody(c, code),
    );
    c.header('Location', `/api/v1/activity-variants/${row.id}`);
    return c.json(row, 201);
  });
  routes.get('/activity-variants/:id', async (c) =>
    c.json(await service.get(c.req.param('id'))),
  );
  routes.patch('/activity-variants/:id', async (c) =>
    c.json(await service.update(c.req.param('id'), await jsonBody(c, code))),
  );
  routes.post('/activity-variants/:id/archive', async (c) =>
    c.json(await service.archive(c.req.param('id'))),
  );
  routes.post('/activity-variants/:id/restore', async (c) =>
    c.json(await service.restore(c.req.param('id'))),
  );
  return routes;
}
