import { Hono } from 'hono';
import { jsonBody, query } from '../../transport.js';
import type { MeasurementService } from './service.js';
import { MeasurementListQuerySchema } from './schemas.js';

export function measurementRoutes(service: MeasurementService) {
  const routes = new Hono();
  const code = 'MEASUREMENT_DEFINITION_INVALID';
  routes.get('/activity-kinds/:activityKindId/measurements', async (c) => {
    const parsed = query(c, MeasurementListQuerySchema, code);
    return c.json(
      await service.list(c.req.param('activityKindId'), {
        includeArchived: parsed.includeArchived,
        effective: parsed.effective,
        ...(parsed.activityVariantId
          ? { activityVariantId: parsed.activityVariantId }
          : {}),
      }),
    );
  });
  routes.post('/activity-kinds/:activityKindId/measurements', async (c) => {
    const row = await service.create(
      c.req.param('activityKindId'),
      await jsonBody(c, code),
    );
    c.header('Location', `/api/v1/measurement-definitions/${row.id}`);
    return c.json(row, 201);
  });
  routes.get('/measurement-definitions/:id', async (c) =>
    c.json(await service.get(c.req.param('id'))),
  );
  routes.patch('/measurement-definitions/:id', async (c) =>
    c.json(await service.update(c.req.param('id'), await jsonBody(c, code))),
  );
  routes.post('/measurement-definitions/:id/archive', async (c) =>
    c.json(await service.archive(c.req.param('id'))),
  );
  routes.post('/measurement-definitions/:id/restore', async (c) =>
    c.json(await service.restore(c.req.param('id'))),
  );
  return routes;
}
