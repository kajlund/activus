import { GoalSchema } from '@activus/contracts';
import type { GoalRecord } from './model.js';
export function toGoal(row: GoalRecord) {
  const today = new Date().toISOString().slice(0, 10);
  return GoalSchema.parse({
    ...row,
    lifecycle: row.archivedAt
      ? 'archived'
      : today < row.startDate
        ? 'upcoming'
        : today > row.endDate
          ? 'ended'
          : 'active',
    isArchived: !!row.archivedAt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
