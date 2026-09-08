import { HealthResponseSchema } from '@activus/contracts';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';

const makeApp = () =>
  createApp(parseEnv({ NODE_ENV: 'production' }), pino({ level: 'silent' }));

describe('API foundation', () => {
  it('rejects cross-origin mutation requests before a handler can change data', async () => {
    const app = makeApp();
    let writes = 0;
    app.post('/api/test-write', (c) => {
      writes++;
      return c.json({ ok: true });
    });
    for (const origin of ['https://untrusted.example', 'null']) {
      const response = await app.request('/api/test-write', {
        method: 'POST',
        headers: { Origin: origin },
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: {
          code: 'ORIGIN_NOT_ALLOWED',
          requestId: response.headers.get('X-Request-Id'),
        },
      });
    }
    expect(writes).toBe(0);
  });
  it('permits configured-origin, same-origin and non-browser mutations', async () => {
    const app = makeApp();
    app.post('/api/test-write', (c) => c.json({ ok: true }));
    for (const origin of [
      undefined,
      'http://localhost:5173',
      'http://localhost',
    ]) {
      expect(
        (
          await app.request('http://localhost/api/test-write', {
            method: 'POST',
            ...(origin ? { headers: { Origin: origin } } : {}),
          })
        ).status,
      ).toBe(200);
    }
  });
  it('returns the shared health contract and a request ID', async () => {
    const response = await makeApp().request('/health');
    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
    });
    expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns a stable JSON not-found error with the same request ID', async () => {
    const response = await makeApp().request('/api/missing');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: response.headers.get('X-Request-Id'),
      },
    });
  });

  it('hides unexpected internal errors in production', async () => {
    const app = makeApp();
    app.get('/api/test-error', () => {
      throw new Error('private database credentials');
    });
    const response = await app.request('/api/test-error');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: response.headers.get('X-Request-Id'),
      },
    });
  });
});
