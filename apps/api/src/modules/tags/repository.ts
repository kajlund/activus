import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { tags } from '../../db/schema.js';
import { translateConfigurationError } from '../../db/configuration-errors.js';
import type { TagRepository } from './model.js';
export function createTagRepository(db: Database): TagRepository {
  return {
    list(query) {
      const search = query.search
        ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%`
        : undefined;
      return db
        .select()
        .from(tags)
        .where(
          and(
            query.includeArchived ? undefined : isNull(tags.archivedAt),
            search ? sql`${tags.name} ILIKE ${search} ESCAPE '\\'` : undefined,
          ),
        )
        .orderBy(sql`lower(${tags.name}) COLLATE "C"`, tags.id);
    },
    async find(id) {
      return (await db.select().from(tags).where(eq(tags.id, id)))[0];
    },
    async create(input) {
      try {
        const row = (await db.insert(tags).values(input).returning())[0];
        if (!row) throw new Error('Tag insert returned no row');
        return row;
      } catch (error) {
        return translateConfigurationError(error);
      }
    },
    async update(id, input) {
      try {
        return (
          await db
            .update(tags)
            .set({ ...input, updatedAt: sql`clock_timestamp()` })
            .where(eq(tags.id, id))
            .returning()
        )[0];
      } catch (error) {
        return translateConfigurationError(error);
      }
    },
    async setArchived(id, archived) {
      try {
        const alreadyCurrent = archived
          ? sql`${tags.archivedAt} IS NOT NULL`
          : sql`${tags.archivedAt} IS NULL`;
        return (
          await db
            .update(tags)
            .set({
              archivedAt: archived
                ? sql`coalesce(${tags.archivedAt}, clock_timestamp())`
                : null,
              updatedAt: sql`CASE WHEN ${alreadyCurrent} THEN ${tags.updatedAt} ELSE clock_timestamp() END`,
            })
            .where(eq(tags.id, id))
            .returning()
        )[0];
      } catch (error) {
        return translateConfigurationError(error);
      }
    },
  };
}
