import { randomUUID } from 'node:crypto';
import type {
  CreateActivityVariantRequest,
  CreateMeasurementDefinitionRequest,
  MeasurementFields,
  UpdateActivityVariantRequest,
} from '@activus/contracts';
import { ApiError } from '../../src/errors.js';
import type {
  VariantRecord,
  VariantRepository,
} from '../../src/modules/activity-variants/model.js';
import type {
  MeasurementRecord,
  MeasurementRepository,
  MeasurementListOptions,
} from '../../src/modules/measurement-definitions/model.js';
import { FakeActivityKindRepository } from './activity-kind-repository.js';

export const validVariant = { name: 'Outdoor', sortOrder: 0, isDefault: false };
export const validMeasurement: CreateMeasurementDefinitionRequest = {
  name: 'Distance',
  activityVariantId: null,
  valueType: 'decimal',
  canonicalUnit: 'metre',
  displayUnit: 'kilometre',
  precision: 2,
  isRequired: false,
  minimumValue: 0,
  maximumValue: null,
  aggregation: 'total',
  personalBestDirection: 'highest',
  sortOrder: 0,
};
export function ordered<
  T extends { name: string; sortOrder: number; id: string },
>(rows: T[]) {
  return rows.sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)) ||
      a.id.localeCompare(b.id),
  );
}
// Test doubles only: real PostgreSQL constraints and transactions have a separate suite.
export class FakeVariantRepository implements VariantRepository {
  readonly rows = new Map<string, VariantRecord>();
  async find(id: string) {
    return this.rows.get(id);
  }
  async list(kindId: string, includeArchived: boolean) {
    return ordered(
      [...this.rows.values()].filter(
        (r) =>
          r.activityKindId === kindId &&
          (includeArchived || r.archivedAt === null),
      ),
    );
  }
  private nameAvailable(kindId: string, name: string, id?: string) {
    if (
      [...this.rows.values()].some(
        (r) =>
          r.id !== id &&
          r.activityKindId === kindId &&
          r.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new ApiError(
        409,
        'ACTIVITY_VARIANT_NAME_CONFLICT',
        'Reserved name',
      );
  }
  private clearDefault(kindId: string, id?: string) {
    for (const row of this.rows.values())
      if (row.activityKindId === kindId && row.id !== id && row.isDefault)
        this.rows.set(row.id, {
          ...row,
          isDefault: false,
          updatedAt: new Date(),
        });
  }
  async create(kindId: string, input: CreateActivityVariantRequest) {
    this.nameAvailable(kindId, input.name);
    if (input.isDefault) this.clearDefault(kindId);
    const now = new Date();
    const row = {
      ...input,
      id: randomUUID(),
      activityKindId: kindId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }
  async update(id: string, input: UpdateActivityVariantRequest) {
    const row = this.rows.get(id);
    if (!row) return;
    this.nameAvailable(row.activityKindId, input.name ?? row.name, id);
    if (input.isDefault) this.clearDefault(row.activityKindId, id);
    const next = {
      ...row,
      name: input.name ?? row.name,
      sortOrder: input.sortOrder ?? row.sortOrder,
      isDefault: input.isDefault ?? row.isDefault,
      updatedAt: new Date(),
    };
    this.rows.set(id, next);
    return next;
  }
  async setArchived(id: string, archived: boolean) {
    const row = this.rows.get(id);
    if (!row || (row.archivedAt !== null) === archived) return row;
    this.nameAvailable(row.activityKindId, row.name, row.id);
    const next = {
      ...row,
      archivedAt: archived ? new Date() : null,
      isDefault: false,
      updatedAt: new Date(),
    };
    this.rows.set(id, next);
    return next;
  }
}
export class FakeMeasurementRepository implements MeasurementRepository {
  readonly rows = new Map<string, MeasurementRecord>();
  async find(id: string) {
    return this.rows.get(id);
  }
  async list(kindId: string, options: MeasurementListOptions) {
    return ordered(
      [...this.rows.values()].filter(
        (r) =>
          r.activityKindId === kindId &&
          (options.includeArchived || r.archivedAt === null) &&
          (!options.activityVariantId ||
            r.activityVariantId === options.activityVariantId ||
            (options.effective && r.activityVariantId === null)),
      ),
    );
  }
  private available(
    row: Pick<
      MeasurementRecord,
      'id' | 'name' | 'activityKindId' | 'activityVariantId'
    >,
  ) {
    if (
      [...this.rows.values()].some(
        (r) =>
          r.id !== row.id &&
          r.activityKindId === row.activityKindId &&
          r.name.toLowerCase() === row.name.toLowerCase() &&
          (r.activityVariantId === null ||
            row.activityVariantId === null ||
            r.activityVariantId === row.activityVariantId),
      )
    )
      throw new ApiError(
        409,
        'MEASUREMENT_DEFINITION_NAME_CONFLICT',
        'Reserved measurement name',
      );
  }
  async create(kindId: string, input: CreateMeasurementDefinitionRequest) {
    const now = new Date();
    const row = {
      ...input,
      id: randomUUID(),
      activityKindId: kindId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.available(row);
    this.rows.set(row.id, row);
    return row;
  }
  async update(
    id: string,
    change: (current: MeasurementRecord) => MeasurementFields,
  ) {
    const row = this.rows.get(id);
    if (!row) return;
    const next = { ...row, ...change(row), updatedAt: new Date() };
    this.available(next);
    this.rows.set(id, next);
    return next;
  }
  async setArchived(id: string, archived: boolean) {
    const row = this.rows.get(id);
    if (!row || (row.archivedAt !== null) === archived) return row;
    this.available(row);
    const next = {
      ...row,
      archivedAt: archived ? new Date() : null,
      updatedAt: new Date(),
    };
    this.rows.set(id, next);
    return next;
  }
}
export function configurationDoubles() {
  return {
    activityKinds: new FakeActivityKindRepository(),
    variants: new FakeVariantRepository(),
    measurements: new FakeMeasurementRepository(),
  };
}
