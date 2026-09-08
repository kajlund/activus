import {
  ActivityKindSchema,
  ActivityKindListResponseSchema,
  ActivityVariantSchema,
  ActivityVariantListResponseSchema,
  ApiErrorResponseSchema,
  type ActivityKind,
  type ActivityVariant,
  type CreateActivityKindRequest,
  type CreateActivityVariantRequest,
  type UpdateActivityKindRequest,
  type UpdateActivityVariantRequest,
} from '@activus/contracts';
import {
  GoalSchema,
  type Goal,
  type CreateGoalRequest,
  type UpdateGoalRequest,
} from '@activus/contracts';
import type { z } from 'zod';
import { z as schema } from 'zod';
import {
  ActivitySchema,
  ActivityListResponseSchema,
  type ActivityListResponse,
  type ActivityListQuery,
  type Activity,
  type CreateActivityRequest,
  type UpdateActivityRequest,
  type ApiErrorResponse,
} from '@activus/contracts';
export interface ActivityApi {
  getActivity(id: string, signal?: AbortSignal): Promise<Activity>;
  createActivity(
    input: CreateActivityRequest,
    signal?: AbortSignal,
  ): Promise<Activity>;
  updateActivity(
    id: string,
    input: UpdateActivityRequest,
    signal?: AbortSignal,
  ): Promise<Activity>;
}
export interface GoalApi {
  getGoal(id: string, signal?: AbortSignal): Promise<Goal>;
  createGoal(input: CreateGoalRequest, signal?: AbortSignal): Promise<Goal>;
  updateGoal(
    id: string,
    input: UpdateGoalRequest,
    signal?: AbortSignal,
  ): Promise<Goal>;
}
export interface JournalApi {
  listActivities(
    query: ActivityListQuery,
    signal?: AbortSignal,
  ): Promise<ActivityListResponse>;
  deleteActivity(id: string, signal?: AbortSignal): Promise<void>;
}
import {
  TagSchema,
  TagListResponseSchema,
  type Tag,
  type TagListResponse,
  type CreateTagRequest,
  type UpdateTagRequest,
} from '@activus/contracts';
export interface TagApi {
  listTags(
    archived: boolean,
    search?: string,
    signal?: AbortSignal,
  ): Promise<TagListResponse>;
  createTag(input: CreateTagRequest, signal?: AbortSignal): Promise<Tag>;
  updateTag(
    id: string,
    input: UpdateTagRequest,
    signal?: AbortSignal,
  ): Promise<Tag>;
  archiveTag(id: string, signal?: AbortSignal): Promise<Tag>;
  restoreTag(id: string, signal?: AbortSignal): Promise<Tag>;
}
import {
  MeasurementDefinitionSchema,
  MeasurementDefinitionListResponseSchema,
  MeasurementUnitListResponseSchema,
  type MeasurementDefinition,
  type MeasurementDefinitionListResponse,
  type MeasurementUnit,
  type CreateMeasurementDefinitionRequest,
  type UpdateMeasurementDefinitionRequest,
} from '@activus/contracts';

export interface MeasurementApi {
  units(): Promise<{ items: MeasurementUnit[] }>;
  listMeasurements(
    kindId: string,
    archived: boolean,
    variantId?: string,
    signal?: AbortSignal,
  ): Promise<MeasurementDefinitionListResponse>;
  createMeasurement(
    kindId: string,
    input: CreateMeasurementDefinitionRequest,
    signal?: AbortSignal,
  ): Promise<MeasurementDefinition>;
  updateMeasurement(
    id: string,
    input: UpdateMeasurementDefinitionRequest,
    signal?: AbortSignal,
  ): Promise<MeasurementDefinition>;
  archiveMeasurement(
    id: string,
    signal?: AbortSignal,
  ): Promise<MeasurementDefinition>;
  restoreMeasurement(
    id: string,
    signal?: AbortSignal,
  ): Promise<MeasurementDefinition>;
}

export type ClientErrorKind =
  | 'validation'
  | 'conflict'
  | 'not-found'
  | 'network'
  | 'aborted'
  | 'unexpected';
export class ClientError extends Error {
  constructor(
    public readonly kind: ClientErrorKind,
    public readonly code: string,
    public readonly requestId?: string,
    public readonly details?: ApiErrorResponse['error']['details'],
  ) {
    super(code);
  }
}
const messages: Record<string, string> = {
  ORIGIN_NOT_ALLOWED:
    'This page is not allowed to change data. Open Activus at its configured web address.',
  ACTIVITY_REQUIRED_MEASUREMENT_MISSING:
    'Enter the required measurements marked below.',
  ACTIVITY_MEASUREMENT_VALUE_INVALID:
    'Review measurement values, units, ranges and precision. Your entries have been kept.',
  ACTIVITY_MEASUREMENTS_INCOMPATIBLE:
    'The current configuration does not accept some measurements. Review the kind and variant before saving again.',
  HISTORICAL_DEFINITION_MISSING:
    'Some stored measurement definitions could not be loaded. Saving is unavailable until their configuration can be read.',
  TAG_ARCHIVED:
    'A selected tag has been archived. Remove it before saving, unless it was already attached to this activity.',
  ACTIVITY_TAG_INVALID: 'Choose up to 100 available tags.',
  TAG_NAME_CONFLICT:
    'This name is already used by a tag, including archived tags. Choose another name or restore the existing tag.',
  TAG_INVALID: 'Check the tag name and colour, then try again.',
  MEASUREMENT_DEFINITION_HAS_HISTORY:
    'Activities already use this measurement. Type, unit dimension, precision and bounds cannot change. Keep those settings and save your other changes, or archive and replace the measurement.',
  MEASUREMENT_DEFINITION_IS_PRIMARY:
    'Clear or replace the primary measurement before archiving it.',
  MEASUREMENT_DEFINITION_NAME_CONFLICT:
    'This name is reserved by another measurement in this kind or its inherited configuration, including archived definitions. Review the measurements with archived items shown, then rename the conflicting definition before restoring.',
  MEASUREMENT_DEFINITION_INVALID:
    'Check the measurement type, compatible unit, precision and bounds in Advanced settings.',
  PRIMARY_MEASUREMENT_INVALID:
    'Choose an active parent measurement that records a number, duration or rating.',
  ACTIVITY_KIND_NAME_CONFLICT:
    'This name is already used, including by an archived activity kind. Choose another name or restore the existing kind.',
  ACTIVITY_VARIANT_NAME_CONFLICT:
    'This name is already used for this kind, including by an archived variant.',
  ACTIVITY_KIND_ARCHIVED:
    'Restore the activity kind before adding or restoring variants or selecting a default.',
  ACTIVITY_VARIANT_ARCHIVED:
    'Restore the variant before making it the default.',
  MEASUREMENT_DEFINITION_ARCHIVED:
    'The target measurement is archived. Keep the stored measurement or choose an active one before saving.',
  GOAL_VARIANT_MISMATCH:
    'The selected variant is no longer valid for this activity kind. Your changes have been kept.',
  GOAL_MEASUREMENT_INCOMPATIBLE:
    'The target measurement is no longer valid for this activity kind and variant. Your changes have been kept.',
  CONFIGURATION_WRITE_CONFLICT:
    'Configuration changed while saving. Review the current state before trying again.',
  ACTIVITY_KIND_INVALID: 'Check the activity-kind fields and try again.',
  ACTIVITY_VARIANT_INVALID: 'Check the variant fields and try again.',
};
export function clientMessage(error: unknown) {
  if (!(error instanceof ClientError))
    return 'Something went wrong. Please try again.';
  return (
    messages[error.code] ??
    {
      validation: 'Check the entered values and try again.',
      conflict: 'This change conflicts with the current configuration.',
      'not-found':
        'This item could not be found. It may no longer be available.',
      network:
        'The server could not be reached. Check your connection. If you were saving, check the current state before trying again.',
      aborted: 'The request was cancelled.',
      unexpected: 'An unexpected response was received. Please try again.',
    }[error.kind]
  );
}
export interface ConfigurationApi {
  listKinds(
    archived: boolean,
    signal?: AbortSignal,
  ): Promise<{ items: ActivityKind[] }>;
  getKind(id: string, signal?: AbortSignal): Promise<ActivityKind>;
  createKind(
    input: CreateActivityKindRequest,
    signal?: AbortSignal,
  ): Promise<ActivityKind>;
  updateKind(
    id: string,
    input: UpdateActivityKindRequest,
    signal?: AbortSignal,
  ): Promise<ActivityKind>;
  archiveKind(id: string, signal?: AbortSignal): Promise<ActivityKind>;
  restoreKind(id: string, signal?: AbortSignal): Promise<ActivityKind>;
  listVariants(
    kindId: string,
    archived: boolean,
    signal?: AbortSignal,
  ): Promise<{ items: ActivityVariant[] }>;
  createVariant(
    kindId: string,
    input: CreateActivityVariantRequest,
    signal?: AbortSignal,
  ): Promise<ActivityVariant>;
  updateVariant(
    id: string,
    input: UpdateActivityVariantRequest,
    signal?: AbortSignal,
  ): Promise<ActivityVariant>;
  archiveVariant(id: string, signal?: AbortSignal): Promise<ActivityVariant>;
  restoreVariant(id: string, signal?: AbortSignal): Promise<ActivityVariant>;
}
export function createConfigurationApi(
  options: { fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number } = {},
): ConfigurationApi &
  MeasurementApi &
  TagApi &
  ActivityApi &
  JournalApi &
  GoalApi {
  const transport =
    options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    method: string,
    input?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, options.timeoutMs ?? 15000);
    let requestId: string | undefined;
    try {
      const response = await transport(
        `${options.baseUrl ?? '/api/v1'}${path}`,
        {
          method,
          signal: controller.signal,
          ...(input === undefined
            ? {}
            : {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
              }),
        },
      );
      const header = response.headers.get('X-Request-Id');
      if (header && /^[0-9a-f-]{36}$/i.test(header)) requestId = header;
      const body: unknown =
        response.status === 204 ? undefined : await response.json();
      if (!response.ok) {
        const parsed = ApiErrorResponseSchema.safeParse(body);
        if (!parsed.success)
          throw new ClientError(
            'unexpected',
            'INVALID_ERROR_RESPONSE',
            requestId,
          );
        throw new ClientError(
          response.status === 404
            ? 'not-found'
            : response.status === 409
              ? 'conflict'
              : response.status === 400 || response.status === 422
                ? 'validation'
                : 'unexpected',
          parsed.data.error.code,
          parsed.data.error.requestId,
          parsed.data.error.details,
        );
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success)
        throw new ClientError('unexpected', 'INVALID_RESPONSE', requestId);
      return parsed.data;
    } catch (error) {
      if (error instanceof ClientError) throw error;
      if (controller.signal.aborted)
        throw new ClientError(
          signal?.aborted ? 'aborted' : 'network',
          signal?.aborted ? 'ABORTED' : 'TIMEOUT',
          requestId,
        );
      throw new ClientError(
        error instanceof SyntaxError ? 'unexpected' : 'network',
        error instanceof SyntaxError ? 'INVALID_JSON' : 'NETWORK_ERROR',
        requestId,
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  const kindPath = (id: string) => `/activity-kinds/${encodeURIComponent(id)}`;
  const variantPath = (id: string) =>
    `/activity-variants/${encodeURIComponent(id)}`;
  const measurementPath = (id: string) =>
    `/measurement-definitions/${encodeURIComponent(id)}`;
  let units: Promise<{ items: MeasurementUnit[] }> | undefined;
  return {
    getGoal: (id, signal) =>
      request(
        `/goals/${encodeURIComponent(id)}`,
        GoalSchema,
        'GET',
        undefined,
        signal,
      ),
    createGoal: (input, signal) =>
      request('/goals', GoalSchema, 'POST', input, signal),
    updateGoal: (id, input, signal) =>
      request(
        `/goals/${encodeURIComponent(id)}`,
        GoalSchema,
        'PATCH',
        input,
        signal,
      ),
    listActivities: (query, signal) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined)
          params.set(
            key,
            Array.isArray(value) ? value.join(',') : String(value),
          );
      return request(
        `/activities?${params}`,
        ActivityListResponseSchema,
        'GET',
        undefined,
        signal,
      );
    },
    deleteActivity: (id, signal) =>
      request(
        `/activities/${encodeURIComponent(id)}`,
        schema.undefined(),
        'DELETE',
        undefined,
        signal,
      ),
    getActivity: (id, signal) =>
      request(
        `/activities/${encodeURIComponent(id)}`,
        ActivitySchema,
        'GET',
        undefined,
        signal,
      ),
    createActivity: (input, signal) =>
      request('/activities', ActivitySchema, 'POST', input, signal),
    updateActivity: (id, input, signal) =>
      request(
        `/activities/${encodeURIComponent(id)}`,
        ActivitySchema,
        'PATCH',
        input,
        signal,
      ),
    listTags: (archived, search, signal) =>
      request(
        `/tags?includeArchived=${archived}${search?.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`,
        TagListResponseSchema,
        'GET',
        undefined,
        signal,
      ),
    createTag: (input, signal) =>
      request('/tags', TagSchema, 'POST', input, signal),
    updateTag: (id, input, signal) =>
      request(
        `/tags/${encodeURIComponent(id)}`,
        TagSchema,
        'PATCH',
        input,
        signal,
      ),
    archiveTag: (id, signal) =>
      request(
        `/tags/${encodeURIComponent(id)}/archive`,
        TagSchema,
        'POST',
        undefined,
        signal,
      ),
    restoreTag: (id, signal) =>
      request(
        `/tags/${encodeURIComponent(id)}/restore`,
        TagSchema,
        'POST',
        undefined,
        signal,
      ),
    units: () =>
      (units ??= request(
        '/measurement-units',
        MeasurementUnitListResponseSchema,
        'GET',
      ).catch((error: unknown) => {
        units = undefined;
        throw error;
      })),
    listMeasurements: (id, archived, variantId, signal) =>
      request(
        `${kindPath(id)}/measurements?includeArchived=${archived}${variantId ? `&activityVariantId=${encodeURIComponent(variantId)}&effective=true` : ''}`,
        MeasurementDefinitionListResponseSchema,
        'GET',
        undefined,
        signal,
      ),
    createMeasurement: (id, input, signal) =>
      request(
        `${kindPath(id)}/measurements`,
        MeasurementDefinitionSchema,
        'POST',
        input,
        signal,
      ),
    updateMeasurement: (id, input, signal) =>
      request(
        measurementPath(id),
        MeasurementDefinitionSchema,
        'PATCH',
        input,
        signal,
      ),
    archiveMeasurement: (id, signal) =>
      request(
        `${measurementPath(id)}/archive`,
        MeasurementDefinitionSchema,
        'POST',
        undefined,
        signal,
      ),
    restoreMeasurement: (id, signal) =>
      request(
        `${measurementPath(id)}/restore`,
        MeasurementDefinitionSchema,
        'POST',
        undefined,
        signal,
      ),
    listKinds: (archived, signal) =>
      request(
        `/activity-kinds?includeArchived=${archived}`,
        ActivityKindListResponseSchema,
        'GET',
        undefined,
        signal,
      ),
    getKind: (id, signal) =>
      request(kindPath(id), ActivityKindSchema, 'GET', undefined, signal),
    createKind: (input, signal) =>
      request('/activity-kinds', ActivityKindSchema, 'POST', input, signal),
    updateKind: (id, input, signal) =>
      request(kindPath(id), ActivityKindSchema, 'PATCH', input, signal),
    archiveKind: (id, signal) =>
      request(
        `${kindPath(id)}/archive`,
        ActivityKindSchema,
        'POST',
        undefined,
        signal,
      ),
    restoreKind: (id, signal) =>
      request(
        `${kindPath(id)}/restore`,
        ActivityKindSchema,
        'POST',
        undefined,
        signal,
      ),
    listVariants: (id, archived, signal) =>
      request(
        `${kindPath(id)}/variants?includeArchived=${archived}`,
        ActivityVariantListResponseSchema,
        'GET',
        undefined,
        signal,
      ),
    createVariant: (id, input, signal) =>
      request(
        `${kindPath(id)}/variants`,
        ActivityVariantSchema,
        'POST',
        input,
        signal,
      ),
    updateVariant: (id, input, signal) =>
      request(variantPath(id), ActivityVariantSchema, 'PATCH', input, signal),
    archiveVariant: (id, signal) =>
      request(
        `${variantPath(id)}/archive`,
        ActivityVariantSchema,
        'POST',
        undefined,
        signal,
      ),
    restoreVariant: (id, signal) =>
      request(
        `${variantPath(id)}/restore`,
        ActivityVariantSchema,
        'POST',
        undefined,
        signal,
      ),
  };
}
export const configurationApi = createConfigurationApi();
