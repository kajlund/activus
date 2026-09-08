import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  activityKinds,
  activityVariants,
  goalTags,
  goals,
  measurementDefinitions,
  tags,
} from '../../db/schema.js';
import { ApiError } from '../../errors.js';
import type { GoalRepository, GoalRecord } from './model.js';
const fields = {
  id: goals.id,
  name: goals.name,
  description: goals.description,
  targetType: goals.targetType,
  targetValue: goals.targetValue,
  measurementDefinitionId: goals.measurementDefinitionId,
  activityKindId: goals.activityKindId,
  activityVariantId: goals.activityVariantId,
  scheduleMode: goals.scheduleMode,
  recurrencePeriod: goals.recurrencePeriod,
  archivedAt: goals.archivedAt,
  startDate: goals.startDate,
  endDate: goals.endDate,
  createdAt: goals.createdAt,
  updatedAt: goals.updatedAt,
};
type RawGoal = typeof goals.$inferSelect & { tagIds: string[] | null };
function normalize(row: RawGoal): GoalRecord {
  return {
    ...row,
    targetType: row.targetType as GoalRecord['targetType'],
    scheduleMode: row.scheduleMode as GoalRecord['scheduleMode'],
    recurrencePeriod: row.recurrencePeriod as GoalRecord['recurrencePeriod'],
    targetValue: String(row.targetValue),
    tagIds: row.tagIds ?? [],
  };
}
export function createGoalRepository(db: Database): GoalRepository {
  async function get(id: string) {
    const row = (
      await db
        .select({
          ...fields,
          tagIds: sql<
            string[]
          >`coalesce(array_agg(${goalTags.tagId}) filter (where ${goalTags.tagId} is not null), '{}')`,
        })
        .from(goals)
        .leftJoin(goalTags, eq(goalTags.goalId, goals.id))
        .where(eq(goals.id, id))
        .groupBy(goals.id)
    )[0];
    return row ? normalize(row) : undefined;
  }
  async function validate(
    input:
      | GoalRecord
      | {
          activityKindId: string;
          activityVariantId: string | null;
          tagIds: string[];
          targetType: string;
          measurementDefinitionId: string | null;
        },
    active: boolean,
  ) {
    const kind = (
      await db
        .select()
        .from(activityKinds)
        .where(eq(activityKinds.id, input.activityKindId))
    )[0];
    if (!kind)
      throw new ApiError(
        404,
        'ACTIVITY_KIND_NOT_FOUND',
        'Activity kind not found',
      );
    if (active && kind.archivedAt)
      throw new ApiError(
        409,
        'ACTIVITY_KIND_ARCHIVED',
        'Activity kind is archived',
      );
    if (input.activityVariantId) {
      const variant = (
        await db
          .select()
          .from(activityVariants)
          .where(eq(activityVariants.id, input.activityVariantId))
      )[0];
      if (!variant || variant.activityKindId !== kind.id)
        throw new ApiError(
          400,
          'GOAL_VARIANT_MISMATCH',
          'Variant does not belong to this kind',
        );
      if (active && variant.archivedAt)
        throw new ApiError(
          409,
          'ACTIVITY_VARIANT_ARCHIVED',
          'Activity variant is archived',
        );
    }
    const unique = [...new Set(input.tagIds)];
    if (unique.length !== input.tagIds.length)
      throw new ApiError(
        400,
        'GOAL_TAG_DUPLICATE',
        'Required tags must be unique',
      );
    if (unique.length) {
      const rows = await db.select().from(tags).where(inArray(tags.id, unique));
      if (rows.length !== unique.length)
        throw new ApiError(404, 'TAG_NOT_FOUND', 'Tag not found');
      if (active && rows.some((r) => r.archivedAt))
        throw new ApiError(409, 'TAG_ARCHIVED', 'Tag is archived');
    }
    if (input.targetType === 'measurement_total') {
      if (!input.measurementDefinitionId)
        throw new ApiError(
          400,
          'GOAL_MEASUREMENT_REQUIRED',
          'Measurement target requires a measurement definition',
        );
      const m = (
        await db
          .select()
          .from(measurementDefinitions)
          .where(eq(measurementDefinitions.id, input.measurementDefinitionId))
      )[0];
      if (!m)
        throw new ApiError(
          404,
          'MEASUREMENT_DEFINITION_NOT_FOUND',
          'Measurement definition not found',
        );
      if (active && m.archivedAt)
        throw new ApiError(
          409,
          'MEASUREMENT_DEFINITION_ARCHIVED',
          'Measurement definition is archived',
        );
      if (
        m.activityKindId !== kind.id ||
        (m.activityVariantId !== null &&
          m.activityVariantId !== input.activityVariantId) ||
        !['decimal', 'integer'].includes(m.valueType) ||
        m.aggregation !== 'total'
      )
        throw new ApiError(
          400,
          'GOAL_MEASUREMENT_INCOMPATIBLE',
          'Measurement is not an additive effective measurement for this scope',
        );
    } else if (input.measurementDefinitionId)
      throw new ApiError(
        400,
        'GOAL_MEASUREMENT_FORBIDDEN',
        'Only measurement-total goals may reference a measurement',
      );
  }
  return {
    async list(query) {
      const today = new Date().toISOString().slice(0, 10);
      const lifecycle = query.lifecycle;
      const rows = await db
        .select({
          ...fields,
          tagIds: sql<
            string[]
          >`coalesce(array_agg(${goalTags.tagId}) filter (where ${goalTags.tagId} is not null), '{}')`,
        })
        .from(goals)
        .leftJoin(goalTags, eq(goalTags.goalId, goals.id))
        .where(
          and(
            query.includeArchived ? undefined : isNull(goals.archivedAt),
            lifecycle === 'upcoming'
              ? sql`${goals.startDate}>${today}`
              : lifecycle === 'active'
                ? and(
                    sql`${goals.startDate}<=${today}`,
                    sql`${goals.endDate}>=${today}`,
                  )
                : lifecycle === 'ended'
                  ? sql`${goals.endDate}<${today}`
                  : undefined,
          ),
        )
        .groupBy(goals.id)
        .orderBy(goals.startDate, goals.id);
      return rows.map(normalize);
    },
    find: get,
    validateReferences: validate,
    async create(input) {
      const id = await db.transaction(async (tx) => {
        const row = (
          await tx
            .insert(goals)
            .values({ ...input, tagIds: undefined } as never)
            .returning()
        )[0];
        if (!row) throw new Error('Goal insert failed');
        if (input.tagIds.length)
          await tx
            .insert(goalTags)
            .values(input.tagIds.map((tagId) => ({ goalId: row.id, tagId })));
        return row.id;
      });
      return (await get(id))!;
    },
    async update(id, input) {
      const changed = await db.transaction(async (tx) => {
        const row = (
          await tx
            .update(goals)
            .set({
              ...input,
              tagIds: undefined,
              updatedAt: sql`clock_timestamp()`,
            } as never)
            .where(eq(goals.id, id))
            .returning()
        )[0];
        if (!row) return false;
        await tx.delete(goalTags).where(eq(goalTags.goalId, id));
        if (input.tagIds.length)
          await tx
            .insert(goalTags)
            .values(input.tagIds.map((tagId) => ({ goalId: id, tagId })));
        return true;
      });
      return changed ? get(id) : undefined;
    },
    async setArchived(id, archived) {
      const row = (
        await db
          .update(goals)
          .set({
            archivedAt: archived
              ? sql`coalesce(${goals.archivedAt},clock_timestamp())`
              : null,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(eq(goals.id, id))
          .returning()
      )[0];
      return row ? get(id) : undefined;
    },
  };
}
