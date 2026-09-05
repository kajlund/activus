import {
  CreateMeasurementDefinitionRequestSchema,
  UpdateMeasurementDefinitionRequestSchema,
  type MeasurementDefinitionListResponse,
} from '@activus/contracts';
import { ApiError } from '../../errors.js';
import { parseId } from '../../transport.js';
import type { ActivityKindRepository } from '../activity-kinds/model.js';
import type { VariantRepository } from '../activity-variants/model.js';
import type { MeasurementListOptions, MeasurementRepository } from './model.js';
import { toMeasurement, fieldsOf } from './mapper.js';
import { invalidMeasurement, validateMeasurement } from './validator.js';

export class MeasurementService {
  constructor(
    private readonly repository: MeasurementRepository,
    private readonly kinds: Pick<ActivityKindRepository, 'find'>,
    private readonly variants: Pick<VariantRepository, 'find'>,
  ) {}
  private async parent(
    kindId: string,
    variantId: string | null,
    active: boolean,
  ) {
    const kind = await this.kinds.find(
      parseId(kindId, 'MEASUREMENT_DEFINITION_INVALID'),
    );
    if (!kind)
      throw new ApiError(
        404,
        'ACTIVITY_KIND_NOT_FOUND',
        'Activity kind not found',
      );
    if (active && kind.archivedAt)
      throw new ApiError(
        409,
        'ACTIVITY_KIND_ARCHIVED',
        'Activity kind is archived',
      );
    if (variantId !== null) {
      const variant = await this.variants.find(
        parseId(variantId, 'MEASUREMENT_DEFINITION_INVALID'),
      );
      if (!variant || variant.activityKindId !== kind.id)
        throw new ApiError(
          400,
          'MEASUREMENT_DEFINITION_VARIANT_MISMATCH',
          'Variant does not belong to this kind',
        );
      if (active && variant.archivedAt)
        throw new ApiError(
          409,
          'ACTIVITY_VARIANT_ARCHIVED',
          'Activity variant is archived',
        );
    }
    return kind;
  }
  async list(
    kindId: string,
    options: MeasurementListOptions,
  ): Promise<MeasurementDefinitionListResponse> {
    if (options.effective && !options.activityVariantId)
      throw invalidMeasurement();
    const kind = await this.parent(
      kindId,
      options.activityVariantId ?? null,
      false,
    );
    const rows = await this.repository.list(kind.id, options);
    if (options.effective)
      return {
        view: 'effective',
        items: rows.map((row) => ({
          ...toMeasurement(row),
          source:
            row.activityVariantId === null ? 'inherited' : 'variant-specific',
        })),
      };
    return { view: 'definitions', items: rows.map(toMeasurement) };
  }
  private async record(id: string) {
    const row = await this.repository.find(
      parseId(id, 'MEASUREMENT_DEFINITION_INVALID'),
    );
    if (!row)
      throw new ApiError(
        404,
        'MEASUREMENT_DEFINITION_NOT_FOUND',
        'Measurement definition not found',
      );
    return row;
  }
  async get(id: string) {
    return toMeasurement(await this.record(id));
  }
  async create(kindId: string, input: unknown) {
    const parsed = CreateMeasurementDefinitionRequestSchema.safeParse(input);
    if (!parsed.success) throw invalidMeasurement();
    const { activityVariantId, ...raw } = parsed.data;
    const fields = validateMeasurement(raw);
    const variantId = activityVariantId?.toLowerCase() ?? null;
    const kind = await this.parent(kindId, variantId, true);
    return toMeasurement(
      await this.repository.create(kind.id, {
        ...fields,
        activityVariantId: variantId,
      }),
    );
  }
  async update(id: string, input: unknown) {
    const parsed = UpdateMeasurementDefinitionRequestSchema.safeParse(input);
    if (!parsed.success) throw invalidMeasurement();
    const validId = parseId(id, 'MEASUREMENT_DEFINITION_INVALID');
    const row = await this.repository.update(validId, (current) =>
      validateMeasurement({
        ...fieldsOf(current),
        ...Object.fromEntries(
          Object.entries(parsed.data).filter(
            ([, value]) => value !== undefined,
          ),
        ),
      }),
    );
    if (!row)
      throw new ApiError(
        404,
        'MEASUREMENT_DEFINITION_NOT_FOUND',
        'Measurement definition not found',
      );
    return toMeasurement(row);
  }
  async archive(id: string) {
    return this.changeArchive(id, true);
  }
  async restore(id: string) {
    return this.changeArchive(id, false);
  }
  private async changeArchive(id: string, archived: boolean) {
    const row = await this.record(id);
    const kind = await this.parent(
      row.activityKindId,
      row.activityVariantId,
      !archived && row.archivedAt !== null,
    );
    if (archived && kind.primaryMeasurementDefinitionId === row.id)
      throw new ApiError(
        409,
        'MEASUREMENT_DEFINITION_IS_PRIMARY',
        'Clear or replace the primary measurement first',
      );
    const next = await this.repository.setArchived(row.id, archived);
    if (!next)
      throw new ApiError(
        404,
        'MEASUREMENT_DEFINITION_NOT_FOUND',
        'Measurement definition not found',
      );
    return toMeasurement(next);
  }
}
