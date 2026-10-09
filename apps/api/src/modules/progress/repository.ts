import { sql, type SQL } from 'drizzle-orm';
import type { ProgressQuery, ProgressMetric } from '@activus/contracts';
import type { Database } from '../../db/client.js';
import {
  activityKinds,
  activityVariants,
  measurementDefinitions,
} from '../../db/schema.js';
import type { Range } from './periods.js';

export function scope(q: ProgressQuery): SQL {
  return sql`${q.kindId ? sql`a.activity_kind_id = ${q.kindId}::uuid` : sql`true`}
    AND ${q.variantId ? sql`a.activity_variant_id = ${q.variantId}::uuid` : sql`true`}`;
}
export function aggregateExpression(metric: ProgressMetric): SQL {
  if (metric.id === 'count') return sql`count(a.id)::numeric`;
  if (metric.id === 'duration') return sql`sum(a.duration_seconds)`;
  const value = sql`coalesce(m.numeric_value, m.integer_value::numeric)`;
  switch (metric.aggregation) {
    case 'average':
      return sql`avg(${value})`;
    case 'minimum':
      return sql`min(${value})`;
    case 'latest':
      return sql`(array_agg(${value} ORDER BY a.activity_date DESC, a.started_at DESC NULLS LAST, a.created_at DESC, a.id DESC) FILTER (WHERE ${value} IS NOT NULL))[1]`;
    default:
      return sql`sum(${value})`;
  }
}
export function createProgressRepository(
  db: Pick<Database, 'select' | 'execute'>,
) {
  return {
    async metadata(q: ProgressQuery) {
      // A snapshot uses one PostgreSQL connection; issue its queries sequentially.
      const kinds = await db
        .select()
        .from(activityKinds)
        .orderBy(activityKinds.sortOrder, activityKinds.name, activityKinds.id);
      const variants = await db
        .select()
        .from(activityVariants)
        .orderBy(
          activityVariants.sortOrder,
          activityVariants.name,
          activityVariants.id,
        );
      const definitions = await db
        .select()
        .from(measurementDefinitions)
        .orderBy(
          measurementDefinitions.sortOrder,
          measurementDefinitions.name,
          measurementDefinitions.id,
        );
      const dates =
        await db.execute(sql`SELECT min(a.activity_date)::text AS earliest, max(a.activity_date)::text AS latest,
          count(a.duration_seconds)::text AS durations FROM activities a WHERE ${scope(q)}`);
      return {
        kinds,
        variants,
        definitions,
        dates: dates.rows[0] as {
          earliest: string | null;
          latest: string | null;
          durations: string;
        },
      };
    },
    async aggregate(q: ProgressQuery, metric: ProgressMetric, ranges: Range[]) {
      if (!ranges.length) return [];
      const result = await db.execute(sql`WITH ranges AS (
        SELECT * FROM (VALUES ${sql.join(
          ranges.map(
            (r, i) =>
              sql`(${i}::int, ${r.startDate}::date, ${r.endDate}::date)`,
          ),
          sql`, `,
        )}) AS r(position, start_date, end_date)
      ) SELECT r.position, (${aggregateExpression(metric)})::text AS value
        FROM ranges r LEFT JOIN activities a ON a.activity_date BETWEEN r.start_date AND r.end_date AND ${scope(q)}
        LEFT JOIN activity_measurements m ON m.activity_id = a.id AND ${metric.id === 'count' || metric.id === 'duration' ? sql`false` : sql`m.measurement_definition_id = ${metric.id}::uuid`}
        GROUP BY r.position ORDER BY r.position`);
      return result.rows.map((r) => r['value'] as string | null);
    },
    async records(q: ProgressQuery) {
      const result = await db.execute(sql`WITH ranked AS (
        SELECT d.id AS "definitionId", a.id AS "activityId", a.activity_date::text AS "activityDate",
          k.name AS "kindName", v.name AS "variantName", coalesce(m.numeric_value, m.integer_value::numeric)::text AS value,
          row_number() OVER (PARTITION BY d.id ORDER BY
            CASE WHEN d.personal_best_direction = 'highest' THEN coalesce(m.numeric_value, m.integer_value::numeric) END DESC NULLS LAST,
            CASE WHEN d.personal_best_direction = 'lowest' THEN coalesce(m.numeric_value, m.integer_value::numeric) END ASC NULLS LAST,
            a.activity_date, a.started_at ASC NULLS LAST, a.created_at, a.id) AS rank,
          d.sort_order
        FROM activities a JOIN activity_measurements m ON m.activity_id = a.id
        JOIN measurement_definitions d ON d.id = m.measurement_definition_id
        JOIN activity_kinds k ON k.id = a.activity_kind_id
        LEFT JOIN activity_variants v ON v.id = a.activity_variant_id
        WHERE ${scope(q)} AND d.personal_best_direction IN ('highest', 'lowest')
          AND coalesce(m.numeric_value, m.integer_value::numeric) IS NOT NULL
      ) SELECT * FROM ranked WHERE rank = 1 ORDER BY sort_order, "definitionId" LIMIT 6`);
      return result.rows as Array<{
        definitionId: string;
        activityId: string;
        activityDate: string;
        kindName: string;
        variantName: string | null;
        value: string;
      }>;
    },
  };
}
export type ProgressRepository = ReturnType<typeof createProgressRepository>;
export function progressSnapshot(db: Database) {
  return <T>(read: (repository: ProgressRepository) => Promise<T>) =>
    db.transaction((tx) => read(createProgressRepository(tx)), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
}
