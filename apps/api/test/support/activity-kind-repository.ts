import { randomUUID } from 'node:crypto';
import type {
  CreateActivityKindRequest,
  UpdateActivityKindRequest,
} from '@activus/contracts';
import {
  ActivityKindNameConflict,
  type ActivityKindRecord,
  type ActivityKindRepository,
} from '../../src/modules/activity-kinds/model.js';

// A route/service test double only. PostgreSQL tests use the real repository separately.
export class FakeActivityKindRepository implements ActivityKindRepository {
  readonly rows = new Map<string, ActivityKindRecord>();
  async list(includeArchived: boolean) {
    return [...this.rows.values()]
      .filter((row) => includeArchived || !row.archivedAt)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)) ||
          a.id.localeCompare(b.id),
      );
  }
  async find(id: string) {
    return this.rows.get(id);
  }
  async create(input: CreateActivityKindRequest) {
    this.checkName(input.name);
    const now = new Date();
    const row = {
      ...input,
      id: randomUUID(),
      archivedAt: null,
      primaryMeasurementDefinitionId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }
  async update(id: string, input: UpdateActivityKindRequest) {
    const row = this.rows.get(id);
    if (!row) return;
    if (input.name !== undefined) this.checkName(input.name, id);
    const next = {
      ...row,
      name: input.name ?? row.name,
      iconName: input.iconName ?? row.iconName,
      color: input.color ?? row.color,
      sortOrder: input.sortOrder ?? row.sortOrder,
      primaryMeasurementDefinitionId:
        input.primaryMeasurementDefinitionId === undefined
          ? row.primaryMeasurementDefinitionId
          : input.primaryMeasurementDefinitionId,
      updatedAt: new Date(),
    };
    this.rows.set(id, next);
    return next;
  }
  async setArchived(id: string, archived: boolean) {
    const row = this.rows.get(id);
    if (!row) return;
    if (!!row.archivedAt === archived) return row;
    this.checkName(row.name, id);
    const next = {
      ...row,
      archivedAt: archived ? new Date() : null,
      updatedAt: new Date(),
    };
    this.rows.set(id, next);
    return next;
  }
  private checkName(name: string, id?: string) {
    if (
      [...this.rows.values()].some(
        (row) => row.id !== id && row.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new ActivityKindNameConflict();
  }
}

export const validKind = {
  name: 'Walking',
  iconName: 'footprints',
  color: '#67318F',
  sortOrder: 0,
} as const;
