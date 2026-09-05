import { Hono } from 'hono';
import { TagListQuerySchema } from '@activus/contracts';
import { jsonBody, query } from '../../transport.js';
import type { TagService } from './service.js';
export function tagRoutes(service: TagService) {
  const routes = new Hono();
  routes.get('/', async (c) =>
    c.json(await service.list(query(c, TagListQuerySchema, 'TAG_INVALID'))),
  );
  routes.post('/', async (c) => {
    const tag = await service.create(await jsonBody(c, 'TAG_INVALID'));
    c.header('Location', `/api/v1/tags/${tag.id}`);
    return c.json(tag, 201);
  });
  routes.get('/:id', async (c) => c.json(await service.get(c.req.param('id'))));
  routes.patch('/:id', async (c) =>
    c.json(
      await service.update(c.req.param('id'), await jsonBody(c, 'TAG_INVALID')),
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
