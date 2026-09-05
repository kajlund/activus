import type {
  ActivityVariant,
  CreateActivityVariantRequest,
  UpdateActivityVariantRequest,
} from '@activus/contracts';

export type VariantRecord = Omit<
  ActivityVariant,
  'isArchived' | 'createdAt' | 'updatedAt'
> & { archivedAt: Date | null; createdAt: Date; updatedAt: Date };
export interface VariantRepository {
  list(kindId: string, includeArchived: boolean): Promise<VariantRecord[]>;
  find(id: string): Promise<VariantRecord | undefined>;
  create(
    kindId: string,
    input: CreateActivityVariantRequest,
  ): Promise<VariantRecord>;
  update(
    id: string,
    input: UpdateActivityVariantRequest,
  ): Promise<VariantRecord | undefined>;
  setArchived(
    id: string,
    archived: boolean,
  ): Promise<VariantRecord | undefined>;
}
