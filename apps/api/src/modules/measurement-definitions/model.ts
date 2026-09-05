import type {
  MeasurementDefinition,
  MeasurementFields,
  CreateMeasurementDefinitionRequest,
} from '@activus/contracts';

export type MeasurementRecord = Omit<
  MeasurementDefinition,
  'isArchived' | 'createdAt' | 'updatedAt'
> & { archivedAt: Date | null; createdAt: Date; updatedAt: Date };
export interface MeasurementListOptions {
  includeArchived: boolean;
  activityVariantId?: string;
  effective: boolean;
}
export interface MeasurementRepository {
  list(
    kindId: string,
    options: MeasurementListOptions,
  ): Promise<MeasurementRecord[]>;
  find(id: string): Promise<MeasurementRecord | undefined>;
  create(
    kindId: string,
    input: CreateMeasurementDefinitionRequest,
  ): Promise<MeasurementRecord>;
  // Run validation against a locked current row, so PATCH cannot overwrite concurrent omitted fields.
  update(
    id: string,
    change: (current: MeasurementRecord) => MeasurementFields,
  ): Promise<MeasurementRecord | undefined>;
  setArchived(
    id: string,
    archived: boolean,
  ): Promise<MeasurementRecord | undefined>;
}
