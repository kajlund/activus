import { ActivityKindSchema, ActivityKindListResponseSchema, ActivityVariantSchema, ActivityVariantListResponseSchema, ApiErrorResponseSchema, type ActivityKind, type ActivityVariant, type CreateActivityKindRequest, type CreateActivityVariantRequest, type UpdateActivityKindRequest, type UpdateActivityVariantRequest } from '@activus/contracts';
import type { z } from 'zod';

export type ClientErrorKind = 'validation' | 'conflict' | 'not-found' | 'network' | 'aborted' | 'unexpected';
export class ClientError extends Error {
  constructor(public readonly kind: ClientErrorKind, public readonly code: string, public readonly requestId?: string) { super(code); }
}
const messages: Record<string, string> = {
  ACTIVITY_KIND_NAME_CONFLICT: 'This name is already used, including by an archived activity kind. Choose another name or restore the existing kind.',
  ACTIVITY_VARIANT_NAME_CONFLICT: 'This name is already used for this kind, including by an archived variant.',
  ACTIVITY_KIND_ARCHIVED: 'Restore the activity kind before adding or restoring variants or selecting a default.',
  ACTIVITY_VARIANT_ARCHIVED: 'Restore the variant before making it the default.',
  CONFIGURATION_WRITE_CONFLICT: 'Configuration changed while saving. Review the current state before trying again.',
  ACTIVITY_KIND_INVALID: 'Check the activity-kind fields and try again.',
  ACTIVITY_VARIANT_INVALID: 'Check the variant fields and try again.',
};
export function clientMessage(error: unknown) {
  if (!(error instanceof ClientError)) return 'Something went wrong. Please try again.';
  return messages[error.code] ?? ({ validation: 'Check the entered values and try again.', conflict: 'This change conflicts with the current configuration.', 'not-found': 'This item could not be found. It may no longer be available.', network: 'The server could not be reached. Check your connection. If you were saving, check the current state before trying again.', aborted: 'The request was cancelled.', unexpected: 'An unexpected response was received. Please try again.' }[error.kind]);
}
export interface ConfigurationApi {
  listKinds(archived: boolean, signal?: AbortSignal): Promise<{ items: ActivityKind[] }>;
  getKind(id: string, signal?: AbortSignal): Promise<ActivityKind>;
  createKind(input: CreateActivityKindRequest, signal?: AbortSignal): Promise<ActivityKind>;
  updateKind(id: string, input: UpdateActivityKindRequest, signal?: AbortSignal): Promise<ActivityKind>;
  archiveKind(id: string, signal?: AbortSignal): Promise<ActivityKind>;
  restoreKind(id: string, signal?: AbortSignal): Promise<ActivityKind>;
  listVariants(kindId: string, archived: boolean, signal?: AbortSignal): Promise<{ items: ActivityVariant[] }>;
  createVariant(kindId: string, input: CreateActivityVariantRequest, signal?: AbortSignal): Promise<ActivityVariant>;
  updateVariant(id: string, input: UpdateActivityVariantRequest, signal?: AbortSignal): Promise<ActivityVariant>;
  archiveVariant(id: string, signal?: AbortSignal): Promise<ActivityVariant>;
  restoreVariant(id: string, signal?: AbortSignal): Promise<ActivityVariant>;
}
export function createConfigurationApi(options: { fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number } = {}): ConfigurationApi {
  const transport = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  async function request<T>(path: string, schema: z.ZodType<T>, method: string, input?: unknown, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, options.timeoutMs ?? 15000);
    let requestId: string | undefined;
    try {
      const response = await transport(`${options.baseUrl ?? '/api/v1'}${path}`, { method, signal: controller.signal, ...(input === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }) });
      const header = response.headers.get('X-Request-Id');
      if (header && /^[0-9a-f-]{36}$/i.test(header)) requestId = header;
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = ApiErrorResponseSchema.safeParse(body);
        if (!parsed.success) throw new ClientError('unexpected', 'INVALID_ERROR_RESPONSE', requestId);
        throw new ClientError(response.status === 404 ? 'not-found' : response.status === 409 ? 'conflict' : response.status === 400 || response.status === 422 ? 'validation' : 'unexpected', parsed.data.error.code, parsed.data.error.requestId);
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new ClientError('unexpected', 'INVALID_RESPONSE', requestId);
      return parsed.data;
    } catch (error) {
      if (error instanceof ClientError) throw error;
      if (controller.signal.aborted) throw new ClientError(signal?.aborted ? 'aborted' : 'network', signal?.aborted ? 'ABORTED' : 'TIMEOUT', requestId);
      throw new ClientError(error instanceof SyntaxError ? 'unexpected' : 'network', error instanceof SyntaxError ? 'INVALID_JSON' : 'NETWORK_ERROR', requestId);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  const kindPath = (id: string) => `/activity-kinds/${encodeURIComponent(id)}`;
  const variantPath = (id: string) => `/activity-variants/${encodeURIComponent(id)}`;
  return {
    listKinds: (archived, signal) => request(`/activity-kinds?includeArchived=${archived}`, ActivityKindListResponseSchema, 'GET', undefined, signal),
    getKind: (id, signal) => request(kindPath(id), ActivityKindSchema, 'GET', undefined, signal),
    createKind: (input, signal) => request('/activity-kinds', ActivityKindSchema, 'POST', input, signal),
    updateKind: (id, input, signal) => request(kindPath(id), ActivityKindSchema, 'PATCH', input, signal),
    archiveKind: (id, signal) => request(`${kindPath(id)}/archive`, ActivityKindSchema, 'POST', undefined, signal),
    restoreKind: (id, signal) => request(`${kindPath(id)}/restore`, ActivityKindSchema, 'POST', undefined, signal),
    listVariants: (id, archived, signal) => request(`${kindPath(id)}/variants?includeArchived=${archived}`, ActivityVariantListResponseSchema, 'GET', undefined, signal),
    createVariant: (id, input, signal) => request(`${kindPath(id)}/variants`, ActivityVariantSchema, 'POST', input, signal),
    updateVariant: (id, input, signal) => request(variantPath(id), ActivityVariantSchema, 'PATCH', input, signal),
    archiveVariant: (id, signal) => request(`${variantPath(id)}/archive`, ActivityVariantSchema, 'POST', undefined, signal),
    restoreVariant: (id, signal) => request(`${variantPath(id)}/restore`, ActivityVariantSchema, 'POST', undefined, signal),
  };
}
export const configurationApi = createConfigurationApi();
