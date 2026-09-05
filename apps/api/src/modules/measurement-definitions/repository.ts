import { MeasurementFieldsSchema } from '@activus/contracts';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { activityKinds, measurementDefinitions } from '../../db/schema.js';
import { translateConfigurationError } from '../../db/configuration-errors.js';
import type { MeasurementRepository, MeasurementRecord } from './model.js';

function record(
  row: typeof measurementDefinitions.$inferSelect,
): MeasurementRecord {
  const {
    id,
    activityKindId,
    activityVariantId,
    archivedAt,
    createdAt,
    updatedAt,
    ...fields
  } = row;
  return {
    ...MeasurementFieldsSchema.parse(fields),
    id,
    activityKindId,
    activityVariantId,
    archivedAt,
    createdAt,
    updatedAt,
  };
}
export function createMeasurementRepository(
  db: Database,
): MeasurementRepository {
  return {
    async list(kindId, options) {
      const variant = options.activityVariantId
        ? eq(
            measurementDefinitions.activityVariantId,
            options.activityVariantId,
          )
        : undefined;
      return (
        await db
          .select()
          .from(measurementDefinitions)
          .where(
            and(
              eq(measurementDefinitions.activityKindId, kindId),
              options.includeArchived
                ? undefined
                : isNull(measurementDefinitions.archivedAt),
              options.effective
                ? or(isNull(measurementDefinitions.activityVariantId), variant)
                : variant,
            ),
          )
          .orderBy(
            measurementDefinitions.sortOrder,
            sql`${measurementDefinitions.name} COLLATE "C"`,
            measurementDefinitions.id,
          )
      ).map(record);
    },
    async find(id) {
      const row = (
        await db
          .select()
          .from(measurementDefinitions)
          .where(eq(measurementDefinitions.id, id))
      )[0];
      return row ? record(row) : undefined;
    },
    async create(kindId, input) {
      try {
        const row = (
          await db
            .insert(measurementDefinitions)
            .values({ ...input, activityKindId: kindId })
            .returning()
        )[0];
        if (!row) throw new Error('Measurement insert returned no row');
        return record(row);
      } catch (error) {
        return translateConfigurationError(error);
      }
    },
    async update(id, change) {
      try {
        return await db.transaction(async (tx) => {
          const existing = (
            await tx
              .select()
              .from(measurementDefinitions)
              .where(eq(measurementDefinitions.id, id))
          )[0];
          if (!existing) return;
          await tx
            .select()
            .from(activityKinds)
            .where(eq(activityKinds.id, existing.activityKindId))
            .for('update');
          const current = (
            await tx
              .select()
              .from(measurementDefinitions)
              .where(eq(measurementDefinitions.id, id))
              .for('update')
          )[0];
          if (!current) return;
          const input = change(record(current));
          const row = (
            await tx
              .update(measurementDefinitions)
              .set({ ...input, updatedAt: sql`clock_timestamp()` })
              .where(eq(measurementDefinitions.id, id))
              .returning()
          )[0];
          return row ? record(row) : undefined;
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
              .from(measurementDefinitions)
              .where(eq(measurementDefinitions.id, id))
          )[0];
          if (!existing) return;
          await tx
            .select()
            .from(activityKinds)
            .where(eq(activityKinds.id, existing.activityKindId))
            .for('update');
          const current = (
            await tx
              .select()
              .from(measurementDefinitions)
              .where(eq(measurementDefinitions.id, id))
              .for('update')
          )[0];
          if (!current || (current.archivedAt !== null) === archived)
            return current ? record(current) : undefined;
          const row = (
            await tx
              .update(measurementDefinitions)
              .set({
                archivedAt: archived ? sql`clock_timestamp()` : null,
                updatedAt: sql`clock_timestamp()`,
              })
              .where(eq(measurementDefinitions.id, id))
              .returning()
          )[0];
          return row ? record(row) : undefined;
        });
      } catch (error) {
        return translateConfigurationError(error);
      }
    },
  };
}
