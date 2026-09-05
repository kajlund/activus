import { randomUUID } from 'node:crypto';
import type {
  CreateTagRequest,
  UpdateTagRequest,
  TagListQuery,
} from '@activus/contracts';
import type { TagRecord, TagRepository } from '../../src/modules/tags/model.js';
import { ApiError } from '../../src/errors.js';
export function orderTags(rows: TagRecord[]) {
  return rows.sort(
    (a, b) =>
      Buffer.compare(
        Buffer.from(a.name.toLowerCase()),
        Buffer.from(b.name.toLowerCase()),
      ) || a.id.localeCompare(b.id),
  );
}
export class FakeTagRepository implements TagRepository {
  readonly rows = new Map<string, TagRecord>();
  private available(name: string, id?: string) {
    if (
      [...this.rows.values()].some(
        (r) => r.id !== id && r.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new ApiError(409, 'TAG_NAME_CONFLICT', 'Reserved tag name');
  }
  async find(id: string) {
    return this.rows.get(id);
  }
  async list(q: TagListQuery) {
    return orderTags(
      [...this.rows.values()].filter(
        (r) =>
          (q.includeArchived || !r.archivedAt) &&
          (!q.search || r.name.toLowerCase().includes(q.search.toLowerCase())),
      ),
    );
  }
  async create(input: CreateTagRequest) {
    this.available(input.name);
    const now = new Date();
    const row = {
      ...input,
      id: randomUUID(),
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }
  async update(id: string, input: UpdateTagRequest) {
    const row = this.rows.get(id);
    if (!row) return;
    this.available(input.name ?? row.name, id);
    const next = {
      ...row,
      name: input.name ?? row.name,
      color: input.color === undefined ? row.color : input.color,
      updatedAt: new Date(),
    };
    this.rows.set(id, next);
    return next;
  }
  async setArchived(id: string, archived: boolean) {
    const row = this.rows.get(id);
    if (!row || !!row.archivedAt === archived) return row;
    this.available(row.name, id);
    const next = {
      ...row,
      archivedAt: archived ? new Date() : null,
      updatedAt: new Date(),
    };
    this.rows.set(id, next);
    return next;
  }
}
