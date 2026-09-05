import { and, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  activities,
  activityMeasurements,
  activityKinds,
  activityVariants,
  measurementDefinitions,
  tags,
  activityTags,
} from '../../db/schema.js';
import { translateConfigurationError } from '../../db/configuration-errors.js';
import type { ActivityBundle, ActivityRepository } from './model.js';
import { activityError } from './validator.js';
import { requireTags } from '../tags/validator.js';

type Connection = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;
const selection = {
  activity: activities,
  kind: activityKinds,
  variant: activityVariants,
};
async function withMeasurements(
  db: Connection,
  rows: Omit<ActivityBundle, 'measurements' | 'tags'>[],
): Promise<ActivityBundle[]> {
  if (!rows.length) return [];
  const values = await db
    .select({ value: activityMeasurements, definition: measurementDefinitions })
    .from(activityMeasurements)
    .innerJoin(
      measurementDefinitions,
      eq(
        activityMeasurements.measurementDefinitionId,
        measurementDefinitions.id,
      ),
    )
    .where(
      inArray(
        activityMeasurements.activityId,
        rows.map((r) => r.activity.id),
      ),
    )
    .orderBy(
      sql`${measurementDefinitions.activityVariantId} IS NOT NULL`,
      measurementDefinitions.sortOrder,
      sql`${measurementDefinitions.name} COLLATE "C"`,
      measurementDefinitions.id,
    );
  const byActivity = new Map<string, ActivityBundle['measurements']>();
  for (const value of values) {
    const list = byActivity.get(value.value.activityId) ?? [];
    list.push(value);
    byActivity.set(value.value.activityId, list);
  }
  const assignments = await db
    .select({ activityId: activityTags.activityId, tag: tags })
    .from(activityTags)
    .innerJoin(tags, eq(activityTags.tagId, tags.id))
    .where(
      inArray(
        activityTags.activityId,
        rows.map((r) => r.activity.id),
      ),
    )
    .orderBy(sql`lower(${tags.name}) COLLATE "C"`, tags.id);
  const tagsByActivity = new Map<string, ActivityBundle['tags']>();
  for (const assignment of assignments) {
    const list = tagsByActivity.get(assignment.activityId) ?? [];
    list.push(assignment.tag);
    tagsByActivity.set(assignment.activityId, list);
  }
  return rows.map((row) => ({
    ...row,
    tags: tagsByActivity.get(row.activity.id) ?? [],
    measurements: byActivity.get(row.activity.id) ?? [],
  }));
}
async function find(db: Connection, id: string) {
  return (
    await withMeasurements(
      db,
      await db
        .select(selection)
        .from(activities)
        .innerJoin(
          activityKinds,
          eq(activities.activityKindId, activityKinds.id),
        )
        .leftJoin(
          activityVariants,
          eq(activities.activityVariantId, activityVariants.id),
        )
        .where(eq(activities.id, id)),
    )
  )[0];
}
export function createActivityRepository(db: Database): ActivityRepository {
  return {
    find: (id) =>
      db.transaction((tx) => find(tx, id), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      }),
    async findVariant(id) {
      return (
        await db
          .select()
          .from(activityVariants)
          .where(eq(activityVariants.id, id))
      )[0];
    },
    async list(query) {
      return db.transaction(
        async (tx) => {
          if (query.tagIds?.length)
            requireTags(
              query.tagIds,
              await tx
                .select()
                .from(tags)
                .where(inArray(tags.id, query.tagIds)),
            );
          const tagFilter = query.tagIds?.length
            ? query.tagMatch === 'all'
              ? sql`(SELECT count(*) FROM ${activityTags} WHERE ${activityTags.activityId} = ${activities.id} AND ${inArray(activityTags.tagId, query.tagIds)}) = ${query.tagIds.length}`
              : sql`EXISTS (SELECT 1 FROM ${activityTags} WHERE ${activityTags.activityId} = ${activities.id} AND ${inArray(activityTags.tagId, query.tagIds)})`
            : undefined;
          // Search is a literal substring: %, _ and backslash never act as wildcards.
          const search = query.search
            ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%`
            : undefined;
          const rows = await tx
            .select(selection)
            .from(activities)
            .innerJoin(
              activityKinds,
              eq(activities.activityKindId, activityKinds.id),
            )
            .leftJoin(
              activityVariants,
              eq(activities.activityVariantId, activityVariants.id),
            )
            .where(
              and(
                tagFilter,
                query.dateFrom
                  ? gte(activities.activityDate, query.dateFrom)
                  : undefined,
                query.dateTo
                  ? lte(activities.activityDate, query.dateTo)
                  : undefined,
                query.activityKindId
                  ? eq(activities.activityKindId, query.activityKindId)
                  : undefined,
                query.activityVariantId
                  ? eq(activities.activityVariantId, query.activityVariantId)
                  : undefined,
                query.isPartial === undefined
                  ? undefined
                  : eq(activities.isPartial, query.isPartial),
                search
                  ? or(
                      sql`${activities.name} ILIKE ${search} ESCAPE '\\'`,
                      sql`${activities.notes} ILIKE ${search} ESCAPE '\\'`,
                    )
                  : undefined,
              ),
            )
            .orderBy(
              desc(activities.activityDate),
              sql`${activities.startedAt} DESC NULLS LAST`,
              desc(activities.createdAt),
              desc(activities.id),
            )
            .limit(query.limit + 1)
            .offset(query.offset);
          return withMeasurements(tx, rows);
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
    async write(id, requestedKindId, validate, requestedTagIds) {
      try {
        return await db.transaction(async (tx) => {
          // Serialize PATCH read/merge/write and deletion on this activity.
          const locked = id
            ? (
                await tx
                  .select()
                  .from(activities)
                  .where(eq(activities.id, id))
                  .for('update')
              )[0]
            : undefined;
          if (id && !locked)
            activityError('ACTIVITY_NOT_FOUND', 'Activity not found', 404);
          const kindId = requestedKindId ?? locked?.activityKindId;
          if (!kindId)
            activityError('ACTIVITY_INVALID', 'Activity kind is required');
          const kindIds = [
            ...new Set([kindId, ...(locked ? [locked.activityKindId] : [])]),
          ].sort();
          // Match phase 2B configuration serialization; definitions cannot change during validation/persistence.
          const kinds = await tx
            .select()
            .from(activityKinds)
            .where(inArray(activityKinds.id, kindIds))
            .orderBy(activityKinds.id)
            .for('update');
          const existing = id ? await find(tx, id) : undefined;
          // Shared locks allow concurrent assignments while serializing archive/update against validation.
          const selectedTags = requestedTagIds?.length
            ? await tx
                .select()
                .from(tags)
                .where(inArray(tags.id, requestedTagIds))
                .orderBy(tags.id)
                .for('share')
            : [];
          const variants = await tx
            .select()
            .from(activityVariants)
            .where(eq(activityVariants.activityKindId, kindId));
          const definitions = await tx
            .select()
            .from(measurementDefinitions)
            .where(eq(measurementDefinitions.activityKindId, kindId));
          const write = validate({
            existing,
            kind: kinds.find((k) => k.id === kindId),
            variants,
            definitions,
            tags: selectedTags,
          });
          const row = id
            ? (
                await tx
                  .update(activities)
                  .set({ ...write.fields, updatedAt: sql`clock_timestamp()` })
                  .where(eq(activities.id, id))
                  .returning()
              )[0]
            : (await tx.insert(activities).values(write.fields).returning())[0];
          if (!row) throw new Error('Activity write returned no row');
          if (write.measurements !== undefined) {
            const retained = write.measurements.map(
              (v) => v.measurementDefinitionId,
            );
            await tx.delete(activityMeasurements).where(
              and(
                eq(activityMeasurements.activityId, row.id),
                retained.length
                  ? sql`${activityMeasurements.measurementDefinitionId} NOT IN (${sql.join(
                      retained.map((v) => sql`${v}::uuid`),
                      sql`, `,
                    )})`
                  : undefined,
              ),
            );
            for (const value of write.measurements) {
              await tx
                .insert(activityMeasurements)
                .values({ ...value, activityId: row.id })
                .onConflictDoUpdate({
                  target: [
                    activityMeasurements.activityId,
                    activityMeasurements.measurementDefinitionId,
                  ],
                  set: { ...value, updatedAt: sql`clock_timestamp()` },
                });
            }
          }
          if (write.tagIds !== undefined) {
            await tx.delete(activityTags).where(
              and(
                eq(activityTags.activityId, row.id),
                write.tagIds.length
                  ? sql`${activityTags.tagId} NOT IN (${sql.join(
                      write.tagIds.map((id) => sql`${id}::uuid`),
                      sql`, `,
                    )})`
                  : undefined,
              ),
            );
            if (write.tagIds.length)
              await tx
                .insert(activityTags)
                .values(
                  write.tagIds.map((tagId) => ({ activityId: row.id, tagId })),
                )
                .onConflictDoNothing();
          }
          const result = await find(tx, row.id);
          if (!result) throw new Error('Activity disappeared during write');
          return result;
        });
      } catch (error) {
        return translateConfigurationError(error);
      }
    },
    async delete(id) {
      return (
        (
          await db
            .delete(activities)
            .where(eq(activities.id, id))
            .returning({ id: activities.id })
        ).length !== 0
      );
    },
  };
}
