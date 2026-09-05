import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { activityKinds, activityVariants } from '../../db/schema.js';
import { translateConfigurationError } from '../../db/configuration-errors.js';
import type { VariantRepository } from './model.js';

export function createVariantRepository(db: Database): VariantRepository {
  return {
    list(kindId, includeArchived) {
      return db
        .select()
        .from(activityVariants)
        .where(
          and(
            eq(activityVariants.activityKindId, kindId),
            includeArchived ? undefined : isNull(activityVariants.archivedAt),
          ),
        )
        .orderBy(
          activityVariants.sortOrder,
          sql`${activityVariants.name} COLLATE "C"`,
          activityVariants.id,
        );
    },
    async find(id) {
      return (
        await db
          .select()
          .from(activityVariants)
          .where(eq(activityVariants.id, id))
      )[0];
    },
    async create(kindId, input) {
      try {
        return await db.transaction(async (tx) => {
          await tx
            .select()
            .from(activityKinds)
            .where(eq(activityKinds.id, kindId))
            .for('update');
          if (input.isDefault)
            await tx
              .update(activityVariants)
              .set({ isDefault: false, updatedAt: sql`clock_timestamp()` })
              .where(
                and(
                  eq(activityVariants.activityKindId, kindId),
                  eq(activityVariants.isDefault, true),
                ),
              );
          const row = (
            await tx
              .insert(activityVariants)
              .values({ ...input, activityKindId: kindId })
              .returning()
          )[0];
          if (!row) throw new Error('Variant insert returned no row');
          return row;
        });
      } catch (error) {
        return translateConfigurationError(error);
      }
    },
    async update(id, input) {
      try {
        return await db.transaction(async (tx) => {
          const existing = (
            await tx
              .select()
              .from(activityVariants)
              .where(eq(activityVariants.id, id))
          )[0];
          if (!existing) return;
          await tx
            .select()
            .from(activityKinds)
            .where(eq(activityKinds.id, existing.activityKindId))
            .for('update');
          if (input.isDefault)
            await tx
              .update(activityVariants)
              .set({ isDefault: false, updatedAt: sql`clock_timestamp()` })
              .where(
                and(
                  eq(activityVariants.activityKindId, existing.activityKindId),
                  eq(activityVariants.isDefault, true),
                  sql`${activityVariants.id} <> ${id}`,
                ),
              );
          return (
            await tx
              .update(activityVariants)
              .set({ ...input, updatedAt: sql`clock_timestamp()` })
              .where(eq(activityVariants.id, id))
              .returning()
          )[0];
        });
      } catch (error) {
        return translateConfigurationError(error);
      }
    },
    async setArchived(id, archived) {
      try {
        return await db.transaction(async (tx) => {
          const existing = (
            await tx
              .select()
              .from(activityVariants)
              .where(eq(activityVariants.id, id))
          )[0];
          if (!existing) return;
          await tx
            .select()
            .from(activityKinds)
            .where(eq(activityKinds.id, existing.activityKindId))
            .for('update');
          const row = (
            await tx
              .select()
              .from(activityVariants)
              .where(eq(activityVariants.id, id))
              .for('update')
          )[0];
          if (!row || (row.archivedAt !== null) === archived) return row;
          return (
            await tx
              .update(activityVariants)
              .set({
                archivedAt: archived ? sql`clock_timestamp()` : null,
                isDefault: false,
                updatedAt: sql`clock_timestamp()`,
              })
              .where(eq(activityVariants.id, id))
              .returning()
          )[0];
        });
      } catch (error) {
        return translateConfigurationError(error);
      }
    },
  };
}
