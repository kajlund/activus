import { GoalSchema } from '@activus/contracts';
import type { GoalRecord } from './model.js';
import { utcToday } from './clock.js';
export function toGoal(row: GoalRecord, today = utcToday()) {
  const { archivedAt, ...fields } = row;
  return GoalSchema.parse({
    ...fields,
    lifecycle: row.archivedAt
      ? 'archived'
      : today < row.startDate
        ? 'upcoming'
        : today > row.endDate
          ? 'ended'
          : 'active',
    isArchived: !!archivedAt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
