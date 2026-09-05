import { ActivityVariantSchema } from '@activus/contracts';
import type { VariantRecord } from './model.js';

export function toVariant(row: VariantRecord) {
  const { archivedAt, createdAt, updatedAt, ...fields } = row;
  return ActivityVariantSchema.parse({
    ...fields,
    isArchived: archivedAt !== null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  });
}
