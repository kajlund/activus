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

  describe('Static client and SPA fallback', () => {
    it('serves index.html, static assets, and handles SPA navigation fallback', async () => {
      const { mkdtemp, writeFile, mkdir, rm } =
        await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');

      const tempDir = await mkdtemp(join(tmpdir(), 'activus-web-'));
      try {
        await writeFile(
          join(tempDir, 'index.html'),
          '<!doctype html><html><body>Lit App</body></html>',
          'utf-8',
        );
        await mkdir(join(tempDir, 'assets'));
        await writeFile(
          join(tempDir, 'assets', 'sample.js'),
          'console.log("sample");',
          'utf-8',
        );

        const app = createApp(
          parseEnv({ NODE_ENV: 'production' }),
          pino({ level: 'silent' }),
          { staticDir: tempDir },
        );

        // Root serves index.html
        const rootRes = await app.request('/');
        expect(rootRes.status).toBe(200);
        expect(rootRes.headers.get('content-type')).toContain('text/html');
        expect(await rootRes.text()).toContain('Lit App');

        // SPA route fallback serves index.html
        const spaRes = await app.request('/activities');
        expect(spaRes.status).toBe(200);
        expect(spaRes.headers.get('content-type')).toContain('text/html');
        expect(await spaRes.text()).toContain('Lit App');

        // Existing static file
        const assetRes = await app.request('/assets/sample.js');
        expect(assetRes.status).toBe(200);
        expect(await assetRes.text()).toContain('console.log("sample");');

        // Missing static file with extension returns 404 (not index.html)
        const missingAssetRes = await app.request('/assets/nonexistent.js');
        expect(missingAssetRes.status).toBe(404);

        // Missing API route returns JSON 404 (not index.html)
        const missingApiRes = await app.request('/api/v1/nonexistent');
        expect(missingApiRes.status).toBe(404);
        expect(await missingApiRes.json()).toMatchObject({
          error: { code: 'NOT_FOUND' },
        });
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('gracefully handles non-existent staticDir without throwing', async () => {
      const app = createApp(
        parseEnv({ NODE_ENV: 'production' }),
        pino({ level: 'silent' }),
        { staticDir: 'non-existent-directory-activus-test' },
      );
      const res = await app.request('/');
      expect(res.status).toBe(404);
    });
  });
});
