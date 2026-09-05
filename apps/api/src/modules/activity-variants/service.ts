import {
  CreateActivityVariantRequestSchema,
  UpdateActivityVariantRequestSchema,
} from '@activus/contracts';
import { ApiError } from '../../errors.js';
import type { ActivityKindRepository } from '../activity-kinds/model.js';
import type { VariantRepository } from './model.js';
import { toVariant } from './mapper.js';
import { parseId } from '../../transport.js';

export class VariantService {
  constructor(
    private readonly repository: VariantRepository,
    private readonly kinds: Pick<ActivityKindRepository, 'find'>,
  ) {}
  async parent(id: string, active = false) {
    const kind = await this.kinds.find(parseId(id, 'ACTIVITY_VARIANT_INVALID'));
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
    return kind;
  }
  async list(kindId: string, includeArchived: boolean) {
    const kind = await this.parent(kindId);
    return {
      items: (await this.repository.list(kind.id, includeArchived)).map(
        toVariant,
      ),
    };
  }
  private async record(id: string) {
    const row = await this.repository.find(
      parseId(id, 'ACTIVITY_VARIANT_INVALID'),
    );
    if (!row)
      throw new ApiError(
        404,
        'ACTIVITY_VARIANT_NOT_FOUND',
        'Activity variant not found',
      );
    return row;
  }
  async get(id: string) {
    return toVariant(await this.record(id));
  }
  async create(kindId: string, input: unknown) {
    const parsed = CreateActivityVariantRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new ApiError(400, 'ACTIVITY_VARIANT_INVALID', 'Invalid variant');
    const kind = await this.parent(kindId, true);
    return toVariant(await this.repository.create(kind.id, parsed.data));
  }
  async update(id: string, input: unknown) {
    const parsed = UpdateActivityVariantRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new ApiError(
        400,
        'ACTIVITY_VARIANT_INVALID',
        'Invalid variant update',
      );
    const row = await this.record(id);
    if (parsed.data.isDefault) {
      await this.parent(row.activityKindId, true);
      if (row.archivedAt)
        throw new ApiError(
          409,
          'ACTIVITY_VARIANT_ARCHIVED',
          'Activity variant is archived',
        );
    }
    const next = await this.repository.update(row.id, parsed.data);
    if (!next)
      throw new ApiError(
        404,
        'ACTIVITY_VARIANT_NOT_FOUND',
        'Activity variant not found',
      );
    return toVariant(next);
  }
  async archive(id: string) {
    return this.changeArchive(id, true);
  }
  async restore(id: string) {
    return this.changeArchive(id, false);
  }
  private async changeArchive(id: string, archived: boolean) {
    const row = await this.record(id);
    if (!archived && row.archivedAt)
      await this.parent(row.activityKindId, true);
    const next = await this.repository.setArchived(row.id, archived);
    if (!next)
      throw new ApiError(
        404,
        'ACTIVITY_VARIANT_NOT_FOUND',
        'Activity variant not found',
      );
    return toVariant(next);
  }
}
