import type {
  CreateActivityKindRequest,
  UpdateActivityKindRequest,
} from '@activus/contracts';

export interface ActivityKindRecord {
  id: string;
  name: string;
  iconName: string;
  color: string;
  sortOrder: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityKindRepository {
  list(includeArchived: boolean): Promise<ActivityKindRecord[]>;
  find(id: string): Promise<ActivityKindRecord | undefined>;
  create(input: CreateActivityKindRequest): Promise<ActivityKindRecord>;
  update(
    id: string,
    input: UpdateActivityKindRequest,
  ): Promise<ActivityKindRecord | undefined>;
  setArchived(
    id: string,
    archived: boolean,
  ): Promise<ActivityKindRecord | undefined>;
}

export class ActivityKindNameConflict extends Error {}
