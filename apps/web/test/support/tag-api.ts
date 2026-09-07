import {
  CreateTagRequestSchema,
  type Tag,
  type CreateTagRequest,
  type UpdateTagRequest,
} from '@activus/contracts';
import {
  ClientError,
  type TagApi,
} from '../../src/services/configuration-api.js';
export class MemoryTagApi implements TagApi {
  tags: Tag[] = [];
  async listTags(archived: boolean, search?: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    return {
      items: this.tags
        .filter(
          (t) =>
            (archived || !t.isArchived) &&
            (!search || t.name.toLowerCase().includes(search.toLowerCase())),
        )
        .sort((a, b) => {
          const x = a.name.toLowerCase();
          const y = b.name.toLowerCase();
          return x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id);
        })
        .map((t) => ({ ...t })),
    };
  }
  async getTag(id: string) {
    const tag = this.tags.find((t) => t.id === id);
    if (!tag) throw new ClientError('not-found', 'TAG_NOT_FOUND');
    return { ...tag };
  }
  private available(name: string, id?: string) {
    if (
      this.tags.some(
        (t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new ClientError('conflict', 'TAG_NAME_CONFLICT');
  }
  async createTag(input: CreateTagRequest) {
    const value = CreateTagRequestSchema.parse(input);
    this.available(value.name);
    const tag: Tag = {
      ...value,
      id: crypto.randomUUID(),
      isArchived: false,
      createdAt: '2026-09-07T12:00:00.000Z',
      updatedAt: '2026-09-07T12:00:00.000Z',
    };
    this.tags.push(tag);
    return { ...tag };
  }
  async updateTag(id: string, input: UpdateTagRequest) {
    const old = await this.getTag(id);
    const value = CreateTagRequestSchema.parse({
      name: old.name,
      color: old.color,
      ...input,
    });
    return this.replace({ ...old, ...value });
  }
  private replace(tag: Tag) {
    this.available(tag.name, tag.id);
    this.tags = this.tags.map((t) => (t.id === tag.id ? tag : t));
    return { ...tag };
  }
  async archiveTag(id: string) {
    return this.replace({ ...(await this.getTag(id)), isArchived: true });
  }
  async restoreTag(id: string) {
    return this.replace({ ...(await this.getTag(id)), isArchived: false });
  }
}
