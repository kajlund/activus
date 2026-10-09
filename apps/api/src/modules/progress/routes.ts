import { Hono } from 'hono';
import { ProgressQuerySchema } from '@activus/contracts';
import { query } from '../../transport.js';
import { readProgress } from './service.js';
import type { progressSnapshot } from './repository.js';

export function progressRoutes(snapshot: ReturnType<typeof progressSnapshot>) {
  return new Hono().get('/', async (c) => {
    const input = query(c, ProgressQuerySchema, 'INVALID_PROGRESS_QUERY');
    return c.json(
      await snapshot((repository) => readProgress(repository, input)),
    );
  });
}
