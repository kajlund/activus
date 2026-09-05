import type {
  CreateTagRequest,
  UpdateTagRequest,
  TagListQuery,
} from '@activus/contracts';
export interface TagRecord {
  id: string;
  name: string;
  color: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface TagRepository {
  list(query: TagListQuery): Promise<TagRecord[]>;
  find(id: string): Promise<TagRecord | undefined>;
  create(input: CreateTagRequest): Promise<TagRecord>;
  update(id: string, input: UpdateTagRequest): Promise<TagRecord | undefined>;
  setArchived(id: string, archived: boolean): Promise<TagRecord | undefined>;
}
