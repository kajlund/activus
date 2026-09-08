import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  activities,
  activityMeasurements,
  activityTags,
  goalTags,
} from '../../db/schema.js';
import type { GoalRecord } from './model.js';

export type DailyAggregate = { activityDate: string; value: string };
export function createGoalProgressRepository(db: Database) {
  return {
    async aggregate(goal: GoalRecord): Promise<DailyAggregate[]> {
      const value =
        goal.targetType === 'activity_count'
          ? sql`count(DISTINCT ${activities.id})`
          : goal.targetType === 'total_duration'
            ? sql`coalesce(sum(${activities.durationSeconds}), 0)`
            : sql`coalesce(sum(coalesce(${activityMeasurements.numericValue}, ${activityMeasurements.integerValue}::numeric)), 0)`;
      const measurementJoin =
        goal.targetType === 'measurement_total'
          ? sql`JOIN ${activityMeasurements} ON ${activityMeasurements.activityId} = ${activities.id} AND ${activityMeasurements.measurementDefinitionId} = ${goal.measurementDefinitionId}`
          : sql``;
      const tagFilter = sql`(SELECT count(*) FROM ${activityTags} WHERE ${activityTags.activityId} = ${activities.id} AND ${activityTags.tagId} IN (SELECT ${goalTags.tagId} FROM ${goalTags} WHERE ${goalTags.goalId} = ${goal.id})) = (SELECT count(*) FROM ${goalTags} WHERE ${goalTags.goalId} = ${goal.id})`;
      const result = await db.execute(
        sql`SELECT ${activities.activityDate} AS "activityDate", ${value}::text AS value FROM ${activities} ${measurementJoin} WHERE ${activities.activityKindId} = ${goal.activityKindId} AND (${goal.activityVariantId}::uuid IS NULL OR ${activities.activityVariantId} = ${goal.activityVariantId}) AND ${activities.activityDate} BETWEEN ${goal.startDate} AND ${goal.endDate} AND ${tagFilter} GROUP BY ${activities.activityDate} ORDER BY ${activities.activityDate}`,
      );
      return result.rows as DailyAggregate[];
    },
  };
}
