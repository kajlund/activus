import { ActivityKindSchema, type ActivityKind } from '@activus/contracts';
import type { ActivityKindRecord } from './model.js';

export function toActivityKind(row: ActivityKindRecord): ActivityKind {
  return ActivityKindSchema.parse({
    id: row.id,
    name: row.name,
    iconName: row.iconName,
    color: row.color,
    sortOrder: row.sortOrder,
    isArchived: row.archivedAt !== null,
    primaryMeasurementDefinitionId: row.primaryMeasurementDefinitionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
