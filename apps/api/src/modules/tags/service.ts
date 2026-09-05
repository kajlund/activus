import {
  CreateTagRequestSchema,
  UpdateTagRequestSchema,
  type TagListQuery,
} from '@activus/contracts';
import { ApiError } from '../../errors.js';
import { parseId } from '../../transport.js';
import type { TagRecord, TagRepository } from './model.js';
import { toTag } from './mapper.js';
export class TagService {
  constructor(private readonly repository: TagRepository) {}
  private require(row: TagRecord | undefined) {
    if (!row) throw new ApiError(404, 'TAG_NOT_FOUND', 'Tag not found');
    return toTag(row);
  }
  async list(query: TagListQuery) {
    return { items: (await this.repository.list(query)).map(toTag) };
  }
  async get(id: string) {
    return this.require(await this.repository.find(parseId(id, 'TAG_INVALID')));
  }
  async create(input: unknown) {
    const parsed = CreateTagRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new ApiError(400, 'TAG_INVALID', 'Invalid tag input');
    return toTag(await this.repository.create(parsed.data));
  }
  async update(id: string, input: unknown) {
    const parsed = UpdateTagRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new ApiError(400, 'TAG_INVALID', 'Invalid tag input');
    return this.require(
      await this.repository.update(parseId(id, 'TAG_INVALID'), parsed.data),
    );
  }
  async archive(id: string) {
    return this.require(
      await this.repository.setArchived(parseId(id, 'TAG_INVALID'), true),
    );
  }
  async restore(id: string) {
    return this.require(
      await this.repository.setArchived(parseId(id, 'TAG_INVALID'), false),
    );
  }
}
