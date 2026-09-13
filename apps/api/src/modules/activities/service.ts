import {
  CreateActivityRequestSchema,
  UpdateActivityRequestSchema,
  type ActivityListQuery,
  type ActivityListResponse,
} from '@activus/contracts';
import { parseId } from '../../transport.js';
import type {
  ActivityRepository,
  ActivityWrite,
  ActivityWriteContext,
} from './model.js';
import { activityError, effective, measurementValue } from './validator.js';
import { toActivity, toActivitySummary } from './mapper.js';
import { validateActivityTags, validateTagInput } from '../tags/validator.js';

function rejectSource(input: unknown) {
  if (
    input &&
    typeof input === 'object' &&
    ('source' in input ||
      'sourceExternalId' in input ||
      'source_external_id' in input)
  )
    activityError(
      'ACTIVITY_SOURCE_IDENTITY_FORBIDDEN',
      'Source identity is reserved for imports',
    );
}
export class ActivityService {
  constructor(private readonly repository: ActivityRepository) {}
  async get(id: string) {
    const bundle = await this.repository.find(parseId(id, 'ACTIVITY_INVALID'));
    if (!bundle) activityError('ACTIVITY_NOT_FOUND', 'Activity not found', 404);
    return toActivity(bundle);
  }
  async list(query: ActivityListQuery): Promise<ActivityListResponse> {
    if (query.activityVariantId) {
      const variant = await this.repository.findVariant(
        query.activityVariantId,
      );
      if (!variant)
        activityError(
          'ACTIVITY_VARIANT_NOT_FOUND',
          'Activity variant not found',
          404,
        );
      if (
        query.activityKindId &&
        query.activityKindId !== variant.activityKindId
      )
        activityError(
          'ACTIVITY_VARIANT_KIND_MISMATCH',
          'Variant does not belong to this kind',
        );
      query = { ...query, activityKindId: variant.activityKindId };
    }
    const rows = await this.repository.list(query);
    const hasMore = rows.length > query.limit;
    return {
      items: rows.slice(0, query.limit).map(toActivitySummary),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore,
        nextOffset: hasMore ? query.offset + query.limit : null,
      },
    };
  }
  async create(input: unknown) {
    validateTagInput(input);
    rejectSource(input);
    const parsed = CreateActivityRequestSchema.safeParse(input);
    if (!parsed.success)
      activityError('ACTIVITY_INVALID', 'Invalid activity input');
    return toActivity(
      await this.repository.write(
        undefined,
        parsed.data.activityKindId,
        (context) => validateActivityWrite(context, parsed.data),
        parsed.data.tagIds,
      ),
    );
  }
  async update(id: string, input: unknown) {
    validateTagInput(input);
    rejectSource(input);
    const parsed = UpdateActivityRequestSchema.safeParse(input);
    if (!parsed.success)
      activityError('ACTIVITY_INVALID', 'Invalid activity input');
    return toActivity(
      await this.repository.write(
        parseId(id, 'ACTIVITY_INVALID'),
        parsed.data.activityKindId,
        (context) => validateActivityWrite(context, parsed.data),
        parsed.data.tagIds,
      ),
    );
  }
  async delete(id: string) {
    if (!(await this.repository.delete(parseId(id, 'ACTIVITY_INVALID'))))
      activityError('ACTIVITY_NOT_FOUND', 'Activity not found', 404);
  }
}

// Shared domain validation for normal writes and controlled legacy imports.
export function validateActivityWrite(
  context: ActivityWriteContext,
  patch: import('@activus/contracts').UpdateActivityRequest,
): ActivityWrite {
  const { existing, kind, variants, definitions } = context;
  const tagIds = validateActivityTags(
    patch.tagIds,
    existing?.tags ?? [],
    context.tags,
  );
  const previous = existing?.activity;
  const raw = {
    ...previous,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ),
  };
  if (!kind)
    activityError('ACTIVITY_KIND_NOT_FOUND', 'Activity kind not found', 404);
  const kindId = kind.id;
  const variantId = raw.activityVariantId ?? null;
  const changed =
    !!previous &&
    (kindId !== previous.activityKindId ||
      variantId !== previous.activityVariantId);
  if ((!previous || changed) && kind.archivedAt)
    activityError('ACTIVITY_KIND_ARCHIVED', 'Activity kind is archived', 409);
  const variant = variantId
    ? variants.find((v) => v.id === variantId)
    : undefined;
  if (variantId && !variant)
    activityError(
      'ACTIVITY_VARIANT_KIND_MISMATCH',
      'Variant does not belong to this kind',
    );
  if ((!previous || changed) && variant?.archivedAt)
    activityError(
      'ACTIVITY_VARIANT_ARCHIVED',
      'Activity variant is archived',
      409,
    );
  const effectiveDefinitions = definitions.filter((d) =>
    effective(d, kindId, variantId),
  );
  const existingIds = new Set(
    existing?.measurements.map((m) => m.definition.id),
  );
  if (changed && patch.measurements === undefined) {
    const incompatibleDefinitionIds =
      existing?.measurements
        .filter(
          (m) =>
            !effectiveDefinitions.some(
              (d) => d.id === m.definition.id && !d.archivedAt,
            ),
        )
        .map((m) => m.definition.id) ?? [];
    activityError(
      'ACTIVITY_MEASUREMENTS_REQUIRED_FOR_KIND_CHANGE',
      'Supply the complete measurement set when changing kind or variant',
      409,
      { incompatibleDefinitionIds },
    );
  }
  let measurements: ActivityWrite['measurements'];
  if (patch.measurements !== undefined) {
    const seen = new Set<string>();
    for (const item of patch.measurements) {
      if (seen.has(item.measurementDefinitionId))
        activityError(
          'ACTIVITY_MEASUREMENT_DUPLICATE',
          'Duplicate measurement definition',
        );
      seen.add(item.measurementDefinitionId);
    }
    const incompatibleDefinitionIds = patch.measurements
      .filter(
        (m) =>
          !effectiveDefinitions.some(
            (d) =>
              d.id === m.measurementDefinitionId && (!changed || !d.archivedAt),
          ),
      )
      .map((m) => m.measurementDefinitionId);
    if (incompatibleDefinitionIds.length)
      activityError(
        changed
          ? 'ACTIVITY_MEASUREMENTS_INCOMPATIBLE'
          : 'ACTIVITY_MEASUREMENT_NOT_EFFECTIVE',
        'Measurements do not apply to the selected kind and variant',
        changed ? 409 : 400,
        { incompatibleDefinitionIds },
      );
    measurements = [];
    for (const item of patch.measurements) {
      const definition = effectiveDefinitions.find(
        (d) => d.id === item.measurementDefinitionId,
      )!;
      const value = measurementValue(item, definition);
      if (definition.archivedAt && !existingIds.has(definition.id) && value)
        activityError(
          'ACTIVITY_ARCHIVED_MEASUREMENT_ADDITION',
          'Cannot add a value for an archived definition',
          409,
        );
      if (value) measurements.push(value);
    }
  }
  const present = new Set(
    measurements?.map((v) => v.measurementDefinitionId) ?? existingIds,
  );
  if (!raw.isPartial) {
    const missingDefinitionIds = effectiveDefinitions
      .filter((d) => !d.archivedAt && d.isRequired && !present.has(d.id))
      .map((d) => d.id);
    if (missingDefinitionIds.length)
      activityError(
        'ACTIVITY_REQUIRED_MEASUREMENT_MISSING',
        'Required measurements are missing',
        400,
        { missingDefinitionIds },
      );
  }
  return {
    fields: {
      activityKindId: kindId,
      activityVariantId: variantId,
      activityDate: raw.activityDate!,
      startedAt:
        typeof raw.startedAt === 'string'
          ? new Date(raw.startedAt)
          : (raw.startedAt ?? null),
      durationSeconds: raw.durationSeconds ?? null,
      name: raw.name ?? null,
      notes: raw.notes ?? null,
      effort: raw.effort ?? null,
      feeling: raw.feeling ?? null,
      isPartial: raw.isPartial ?? false,
    },
    measurements,
    tagIds,
  };
}
