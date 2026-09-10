import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  activities,
  activityMeasurements,
  activityTags,
  goalTags,
  goals,
  activityKinds,
  activityVariants,
  measurementDefinitions,
  tags,
} from '../../db/schema.js';
import type { GoalRecord } from './model.js';

export type DailyAggregate = { activityDate: string; value: string };
export function createGoalProgressRepository(db: Database) {
  return {
    async overviewMetadata(ids: string[]) {
      const result =
        await db.execute(sql`SELECT ${goals.id} AS id, ${activityKinds.name} AS "kindName", ${activityKinds.iconName} AS "iconName", ${activityVariants.name} AS "variantName", ${measurementDefinitions.name} AS "measurementName", ${measurementDefinitions.displayUnit} AS "displayUnit", ${measurementDefinitions.precision} AS precision,
        ARRAY(SELECT ${tags.name} FROM ${goalTags} JOIN ${tags} ON ${tags.id} = ${goalTags.tagId} WHERE ${goalTags.goalId} = ${goals.id} ORDER BY ${tags.name}) AS "tagNames"
        FROM ${goals} JOIN ${activityKinds} ON ${activityKinds.id} = ${goals.activityKindId}
        LEFT JOIN ${activityVariants} ON ${activityVariants.id} = ${goals.activityVariantId}
        LEFT JOIN ${measurementDefinitions} ON ${measurementDefinitions.id} = ${goals.measurementDefinitionId}
        WHERE ${
          ids.length
            ? sql`${goals.id} IN (${sql.join(
                ids.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})`
            : sql`false`
        }`);
      const existence = await db.execute(
        sql`SELECT EXISTS(SELECT 1 FROM ${goals}) AS present`,
      );
      return {
        rows: result.rows as Array<{
          id: string;
          kindName: string;
          iconName: string;
          variantName: string | null;
          measurementName: string | null;
          displayUnit: string | null;
          precision: number | null;
          tagNames: string[];
        }>,
        hasGoals: existence.rows[0]?.['present'] === true,
      };
    },
    async aggregateMany(
      ids: string[],
    ): Promise<Array<DailyAggregate & { goalId: string }>> {
      if (!ids.length) return [];
      const result =
        await db.execute(sql`SELECT ${goals.id} AS "goalId", ${activities.activityDate} AS "activityDate",
        (CASE WHEN ${goals.targetType} = 'activity_count' THEN count(DISTINCT ${activities.id})
          WHEN ${goals.targetType} = 'total_duration' THEN coalesce(sum(${activities.durationSeconds}), 0)
          ELSE coalesce(sum(coalesce(${activityMeasurements.numericValue}, ${activityMeasurements.integerValue}::numeric)), 0) END)::text AS value
        FROM ${goals} JOIN ${activities} ON ${activities.activityKindId} = ${goals.activityKindId}
          AND (${goals.activityVariantId} IS NULL OR ${activities.activityVariantId} = ${goals.activityVariantId})
          AND ${activities.activityDate} BETWEEN ${goals.startDate} AND ${goals.endDate}
        LEFT JOIN ${activityMeasurements} ON ${activityMeasurements.activityId} = ${activities.id} AND ${activityMeasurements.measurementDefinitionId} = ${goals.measurementDefinitionId}
        WHERE ${goals.id} IN (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          AND NOT EXISTS(SELECT 1 FROM ${goalTags} WHERE ${goalTags.goalId} = ${goals.id} AND NOT EXISTS(SELECT 1 FROM ${activityTags} WHERE ${activityTags.activityId} = ${activities.id} AND ${activityTags.tagId} = ${goalTags.tagId}))
        GROUP BY ${goals.id}, ${activities.activityDate} ORDER BY ${goals.id}, ${activities.activityDate}`);
      return result.rows as Array<DailyAggregate & { goalId: string }>;
    },
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
