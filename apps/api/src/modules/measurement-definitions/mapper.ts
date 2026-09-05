import {
  MeasurementDefinitionSchema,
  type MeasurementFields,
} from '@activus/contracts';
import type { MeasurementRecord } from './model.js';

export function fieldsOf(row: MeasurementRecord): MeasurementFields {
  return {
    name: row.name,
    valueType: row.valueType,
    canonicalUnit: row.canonicalUnit,
    displayUnit: row.displayUnit,
    precision: row.precision,
    isRequired: row.isRequired,
    minimumValue: row.minimumValue,
    maximumValue: row.maximumValue,
    aggregation: row.aggregation,
    personalBestDirection: row.personalBestDirection,
    sortOrder: row.sortOrder,
  };
}
export function toMeasurement(row: MeasurementRecord) {
  return MeasurementDefinitionSchema.parse({
    ...fieldsOf(row),
    id: row.id,
    activityKindId: row.activityKindId,
    activityVariantId: row.activityVariantId,
    isArchived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
