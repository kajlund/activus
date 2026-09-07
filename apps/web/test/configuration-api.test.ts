import { expect, it, vi } from 'vitest';
import {
  createConfigurationApi,
  ClientError,
  clientMessage,
} from '../src/services/configuration-api.js';
import {
  kindInput,
  MemoryConfigurationApi,
} from './support/configuration-api.js';
it('validates responses and centralizes URL and JSON serialization', async () => {
  const kind = await new MemoryConfigurationApi().createKind(kindInput);
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(kind), { status: 201 }));
  const api = createConfigurationApi({ fetch: transport });
  expect(await api.createKind(kindInput)).toEqual(kind);
  expect(transport).toHaveBeenCalledWith(
    '/api/v1/activity-kinds',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(kindInput),
      signal: expect.any(AbortSignal),
    }),
  );
});
it.each([
  [400, 'validation'],
  [404, 'not-found'],
  [409, 'conflict'],
  [500, 'unexpected'],
] as const)(
  'maps status %s and preserves request ID without showing raw messages',
  async (status, kind) => {
    const id = crypto.randomUUID();
    const api = createConfigurationApi({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'UNFAMILIAR',
              message: 'Raw sensitive message',
              requestId: id,
            },
          }),
          { status },
        ),
      ),
    });
    await expect(api.listKinds(false)).rejects.toMatchObject({
      kind,
      requestId: id,
    });
    expect(
      clientMessage(new ClientError(kind, 'UNFAMILIAR', id)),
    ).not.toContain('Raw');
  },
);
it('rejects malformed successful data and JSON while retaining header request ID', async () => {
  const id = crypto.randomUUID();
  for (const body of ['{}', 'not json']) {
    const api = createConfigurationApi({
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(body, { headers: { 'X-Request-Id': id } }),
        ),
    });
    await expect(api.listKinds(false)).rejects.toMatchObject({
      kind: 'unexpected',
      requestId: id,
    });
  }
});
it('distinguishes network, external cancellation and timeouts without retrying', async () => {
  const broken = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new TypeError('offline'));
  await expect(
    createConfigurationApi({ fetch: broken }).listKinds(false),
  ).rejects.toMatchObject({ kind: 'network' });
  expect(broken).toHaveBeenCalledTimes(1);
  const waiting: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      if (init?.signal?.aborted)
        reject(new DOMException('aborted', 'AbortError'));
      else
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
    });
  const controller = new AbortController();
  const request = createConfigurationApi({ fetch: waiting }).listKinds(
    false,
    controller.signal,
  );
  controller.abort();
  await expect(request).rejects.toMatchObject({ kind: 'aborted' });
  await expect(
    createConfigurationApi({ fetch: waiting, timeoutMs: 5 }).listKinds(false),
  ).rejects.toMatchObject({ kind: 'network', code: 'TIMEOUT' });
});
