import { eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { activityKinds } from '../../db/schema.js';
import {
  ActivityKindNameConflict,
  type ActivityKindRepository,
} from './model.js';

// Drizzle wraps driver errors in a cause; map only this specific named index.
export function translateRepositoryError(error: unknown): never {
  let current = error;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (
      'code' in current &&
      current.code === '23505' &&
      'constraint' in current &&
      current.constraint === 'activity_kinds_name_unique'
    ) {
      throw new ActivityKindNameConflict();
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  throw error;
}

export function createActivityKindRepository(
  db: Database,
): ActivityKindRepository {
  return {
    list(includeArchived) {
      return db
        .select()
        .from(activityKinds)
        .where(includeArchived ? undefined : isNull(activityKinds.archivedAt))
        .orderBy(
          activityKinds.sortOrder,
          sql`${activityKinds.name} COLLATE "C"`,
          activityKinds.id,
        );
    },
    async find(id) {
      return (
        await db.select().from(activityKinds).where(eq(activityKinds.id, id))
      )[0];
    },
    async create(input) {
      try {
        const row = (
          await db.insert(activityKinds).values(input).returning()
        )[0];
        if (!row) throw new Error('Insert did not return an activity kind');
        return row;
      } catch (error) {
        return translateRepositoryError(error);
      }
    },
    async update(id, input) {
      try {
        return (
          await db
            .update(activityKinds)
            .set({ ...input, updatedAt: sql`clock_timestamp()` })
            .where(eq(activityKinds.id, id))
            .returning()
        )[0];
      } catch (error) {
        return translateRepositoryError(error);
      }
    },
    async setArchived(id, archived) {
      try {
        // One row-locking UPDATE avoids read/modify/write races and preserves timestamps on repeat calls.
        const alreadyCurrent = archived
          ? sql`${activityKinds.archivedAt} IS NOT NULL`
          : sql`${activityKinds.archivedAt} IS NULL`;
        return (
          await db
            .update(activityKinds)
            .set({
              archivedAt: archived
                ? sql`coalesce(${activityKinds.archivedAt}, clock_timestamp())`
                : null,
              updatedAt: sql`CASE WHEN ${alreadyCurrent} THEN ${activityKinds.updatedAt} ELSE clock_timestamp() END`,
            })
            .where(eq(activityKinds.id, id))
            .returning()
        )[0];
      } catch (error) {
        return translateRepositoryError(error);
      }
    },
  };
}
