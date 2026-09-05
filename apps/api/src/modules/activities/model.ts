import type { ActivityListQuery } from '@activus/contracts';
import type { TagRecord } from '../tags/model.js';
import type {
  activities,
  activityMeasurements,
  activityKinds,
  activityVariants,
  measurementDefinitions,
} from '../../db/schema.js';

// Persistence records stay inside the API; mappers expose explicit transport fields.
export type ActivityRecord = typeof activities.$inferSelect;
export type ValueRecord = typeof activityMeasurements.$inferSelect;
export type DefinitionRecord = typeof measurementDefinitions.$inferSelect;
export type KindRecord = typeof activityKinds.$inferSelect;
export type VariantRecord = typeof activityVariants.$inferSelect;
export interface ActivityBundle {
  tags: TagRecord[];
  activity: ActivityRecord;
  kind: KindRecord;
  variant: VariantRecord | null;
  measurements: { value: ValueRecord; definition: DefinitionRecord }[];
}
export type ActivityFields = Omit<
  ActivityRecord,
  'id' | 'source' | 'sourceExternalId' | 'createdAt' | 'updatedAt'
>;
export type ValueFields = Pick<
  ValueRecord,
  | 'measurementDefinitionId'
  | 'numericValue'
  | 'integerValue'
  | 'booleanValue'
  | 'textValue'
>;
export interface ActivityWriteContext {
  tags: TagRecord[];
  existing: ActivityBundle | undefined;
  kind: KindRecord | undefined;
  variants: VariantRecord[];
  definitions: DefinitionRecord[];
}
export interface ActivityWrite {
  tagIds?: string[] | undefined;
  fields: ActivityFields;
  measurements: ValueFields[] | undefined;
}
export interface ActivityRepository {
  find(id: string): Promise<ActivityBundle | undefined>;
  list(query: ActivityListQuery): Promise<ActivityBundle[]>;
  findVariant(id: string): Promise<VariantRecord | undefined>;
  // Callback executes after activity/configuration locks and before any mutations.
  write(
    id: string | undefined,
    kindId: string | undefined,
    validate: (context: ActivityWriteContext) => ActivityWrite,
    tagIds?: string[] | undefined,
  ): Promise<ActivityBundle>;
  delete(id: string): Promise<boolean>;
}
