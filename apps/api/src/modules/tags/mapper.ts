import { TagSchema, TagSummarySchema } from '@activus/contracts';
import type { TagRecord } from './model.js';
export function toTagSummary(row: TagRecord) {
  return TagSummarySchema.parse({
    id: row.id,
    name: row.name,
    color: row.color,
    isArchived: row.archivedAt !== null,
  });
}
export function toTag(row: TagRecord) {
  return TagSchema.parse({
    ...toTagSummary(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
