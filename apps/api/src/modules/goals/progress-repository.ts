import { sql, and, eq, desc } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  activities,
  activityMeasurements,
  goalTags,
  goals,
  activityKinds,
  activityVariants,
  measurementDefinitions,
  tags,
} from '../../db/schema.js';
import type { GoalRecord } from './model.js';
import { goalQualification } from './qualification.js';
import { withMeasurements } from '../activities/repository.js';

export type DailyAggregate = { activityDate: string; value: string };
export function createGoalProgressRepository(db: Database) {
  return {
    async overviewMetadata(ids: string[]) {
      const result =
        await db.execute(sql`SELECT ${goals.id} AS id, ${activityKinds.name} AS "kindName", ${activityKinds.iconName} AS "iconName", ${activityVariants.name} AS "variantName", ${measurementDefinitions.name} AS "measurementName", ${measurementDefinitions.displayUnit} AS "displayUnit", ${measurementDefinitions.precision} AS precision,
        array_remove(ARRAY[CASE WHEN ${activityKinds.archivedAt} IS NOT NULL THEN ${activityKinds.name} END, CASE WHEN ${activityVariants.archivedAt} IS NOT NULL THEN ${activityVariants.name} END, CASE WHEN ${measurementDefinitions.archivedAt} IS NOT NULL THEN ${measurementDefinitions.name} END], NULL) || ARRAY(SELECT ${tags.name} FROM ${goalTags} JOIN ${tags} ON ${tags.id} = ${goalTags.tagId} WHERE ${goalTags.goalId} = ${goals.id} AND ${tags.archivedAt} IS NOT NULL) AS "archivedReferences",
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
          archivedReferences: string[];
          tagNames: string[];
        }>,
        hasGoals: existence.rows[0]?.['present'] === true,
      };
    },
    async aggregateMany(
      ids: string[],
      range?: { startDate: string; endDate: string },
    ): Promise<Array<DailyAggregate & { goalId: string }>> {
      if (!ids.length) return [];
      const result =
        await db.execute(sql`SELECT ${goals.id} AS "goalId", ${activities.activityDate} AS "activityDate",
        (CASE WHEN ${goals.targetType} = 'activity_count' THEN count(DISTINCT ${activities.id})
          WHEN ${goals.targetType} = 'total_duration' THEN coalesce(sum(${activities.durationSeconds}), 0)
          ELSE coalesce(sum(coalesce(${activityMeasurements.numericValue}, ${activityMeasurements.integerValue}::numeric)), 0) END)::text AS value
        FROM ${goals} JOIN ${activities} ON ${goalQualification()}
        LEFT JOIN ${activityMeasurements} ON ${activityMeasurements.activityId} = ${activities.id} AND ${activityMeasurements.measurementDefinitionId} = ${goals.measurementDefinitionId}
        WHERE ${goals.id} IN (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
        AND ${range ? sql`${activities.activityDate} BETWEEN ${range.startDate} AND ${range.endDate}` : sql`true`}
        GROUP BY ${goals.id}, ${activities.activityDate} ORDER BY ${goals.id}, ${activities.activityDate}`);
      return result.rows as Array<DailyAggregate & { goalId: string }>;
    },
    async aggregate(
      goal: GoalRecord,
      range?: { startDate: string; endDate: string },
    ): Promise<DailyAggregate[]> {
      return this.aggregateMany([goal.id], range);
    },
    async contributions(
      goal: GoalRecord,
      start: string,
      end: string,
      limit: number,
      offset: number,
    ) {
      return db.transaction(
        async (tx) => {
          const rows = await tx
            .select({
              activity: activities,
              kind: activityKinds,
              variant: activityVariants,
            })
            .from(activities)
            .innerJoin(goals, eq(goals.id, goal.id))
            .innerJoin(
              activityKinds,
              eq(activityKinds.id, activities.activityKindId),
            )
            .leftJoin(
              activityVariants,
              eq(activityVariants.id, activities.activityVariantId),
            )
            .where(
              and(
                goalQualification(),
                sql`${activities.activityDate} BETWEEN ${start} AND ${end}`,
              ),
            )
            .orderBy(
              desc(activities.activityDate),
              sql`${activities.startedAt} DESC NULLS LAST`,
              desc(activities.createdAt),
              desc(activities.id),
            )
            .limit(limit + 1)
            .offset(offset);
          return withMeasurements(tx, rows);
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
  };
}
