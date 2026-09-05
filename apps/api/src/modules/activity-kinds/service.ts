import {
  CreateActivityKindRequestSchema,
  UpdateActivityKindRequestSchema,
} from '@activus/contracts';
import { ApiError } from '../../errors.js';
import {
  ActivityKindNameConflict,
  type ActivityKindRecord,
  type ActivityKindRepository,
} from './model.js';
import { toActivityKind } from './mapper.js';
import { ActivityKindIdSchema } from './schemas.js';
import type { MeasurementRepository } from '../measurement-definitions/model.js';
import { isPrimaryEligible } from '../measurement-definitions/validator.js';

export class ActivityKindService {
  constructor(
    private readonly repository: ActivityKindRepository,
    private readonly measurements?: Pick<MeasurementRepository, 'find'>,
  ) {}

  async list(includeArchived = false) {
    // Ordering is part of the repository contract and uses PostgreSQL's C collation.
    return {
      items: (await this.repository.list(includeArchived)).map(toActivityKind),
    };
  }

  async get(id: string) {
    return toActivityKind(
      this.requireRecord(await this.repository.find(this.parseId(id))),
    );
  }

  async create(input: unknown) {
    const parsed = CreateActivityKindRequestSchema.safeParse(input);
    if (!parsed.success) throw this.invalid();
    return this.write(() => this.repository.create(parsed.data));
  }

  async update(id: string, input: unknown) {
    const parsed = UpdateActivityKindRequestSchema.safeParse(input);
    if (!parsed.success) throw this.invalid();
    const validId = this.parseId(id);
    if (parsed.data.primaryMeasurementDefinitionId) {
      const definition = await this.measurements?.find(
        parsed.data.primaryMeasurementDefinitionId.toLowerCase(),
      );
      if (
        !definition ||
        definition.activityKindId !== validId ||
        !isPrimaryEligible(definition)
      )
        throw new ApiError(
          400,
          'PRIMARY_MEASUREMENT_INVALID',
          'Primary measurement must be an active numeric parent definition of this kind',
        );
    }
    return this.write(() => this.repository.update(validId, parsed.data));
  }

  async archive(id: string) {
    return this.changeArchive(id, true);
  }
  async restore(id: string) {
    return this.changeArchive(id, false);
  }

  private async changeArchive(id: string, archived: boolean) {
    const validId = this.parseId(id);
    return this.write(() => this.repository.setArchived(validId, archived));
  }

  private async write(action: () => Promise<ActivityKindRecord | undefined>) {
    try {
      return toActivityKind(this.requireRecord(await action()));
    } catch (error) {
      if (error instanceof ActivityKindNameConflict) {
        throw new ApiError(
          409,
          'ACTIVITY_KIND_NAME_CONFLICT',
          'An activity kind already reserves this name',
        );
      }
      throw error;
    }
  }

  private requireRecord(record: ActivityKindRecord | undefined) {
    if (!record)
      throw new ApiError(
        404,
        'ACTIVITY_KIND_NOT_FOUND',
        'Activity kind not found',
      );
    return record;
  }

  private parseId(id: string) {
    const parsed = ActivityKindIdSchema.safeParse(id);
    if (!parsed.success) throw this.invalid();
    return parsed.data;
  }

  private invalid() {
    return new ApiError(
      400,
      'ACTIVITY_KIND_INVALID',
      'Invalid activity kind input',
    );
  }
}
