import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { TagListQuerySchema } from '@activus/contracts';
import { TagService } from './service.js';
import { FakeTagRepository } from '../../../test/support/tags.js';
import { translateConfigurationError } from '../../db/configuration-errors.js';
let repo: FakeTagRepository;
let service: TagService;
beforeEach(() => {
  repo = new FakeTagRepository();
  service = new TagService(repo);
});
it('normalizes names and colours and preserves omitted PATCH fields', async () => {
  const tag = await service.create({ name: '  Commute  ', color: '#aabbcc' });
  expect(tag).toMatchObject({
    name: 'Commute',
    color: '#AABBCC',
    isArchived: false,
  });
  expect(await service.update(tag.id, { name: '  Travel ' })).toMatchObject({
    name: 'Travel',
    color: '#AABBCC',
  });
  expect(await service.update(tag.id, { color: null })).toMatchObject({
    name: 'Travel',
    color: null,
  });
  expect(await service.create({ name: 'Recovery' })).toMatchObject({
    color: null,
  });
});
it.each([
  { name: '' },
  { name: ' \t ' },
  { name: 'a'.repeat(121) },
  { name: 'x', color: '#abc' },
  { name: 'x', color: 'red' },
  { name: 'x', color: '#GGFFFF' },
  { name: 'x', sortOrder: 0 },
  { name: 'x', iconName: 'activity' },
])('rejects invalid input %o', async (input) => {
  await expect(service.create(input)).rejects.toMatchObject({
    code: 'TAG_INVALID',
    status: 400,
  });
});
it('lists normalized alphabetical order and literal bounded name search', async () => {
  for (const name of ['Zulu', 'beta', 'Alpha', '100%_ recovery'])
    await service.create({ name });
  expect(
    (await service.list(TagListQuerySchema.parse({}))).items.map((t) => t.name),
  ).toEqual(['100%_ recovery', 'Alpha', 'beta', 'Zulu']);
  expect(
    (await service.list(TagListQuerySchema.parse({ search: 'RECOVERY' })))
      .items,
  ).toHaveLength(1);
});
it('archives/restores idempotently and reserves historical names', async () => {
  const tag = await service.create({ name: 'Race' });
  const archived = await service.archive(tag.id);
  expect(await service.archive(tag.id)).toEqual(archived);
  expect((await service.list(TagListQuerySchema.parse({}))).items).toEqual([]);
  expect(
    (await service.list(TagListQuerySchema.parse({ includeArchived: 'true' })))
      .items,
  ).toEqual([archived]);
  await expect(service.create({ name: 'RACE' })).rejects.toMatchObject({
    code: 'TAG_NAME_CONFLICT',
  });
  const restored = await service.restore(tag.id);
  expect(await service.restore(tag.id)).toEqual(restored);
});
it('maps wrapped uniqueness errors, including restore failures, without leaking database details', async () => {
  const tag = await service.create({ name: 'Race' });
  vi.spyOn(repo, 'setArchived').mockImplementation(async () =>
    translateConfigurationError({
      cause: { code: '23505', constraint: 'tags_name_unique' },
    }),
  );
  await expect(service.restore(tag.id)).rejects.toMatchObject({
    code: 'TAG_NAME_CONFLICT',
    status: 409,
  });
});
it('rejects empty PATCH, invalid UUIDs and missing tags', async () => {
  const tag = await service.create({ name: 'Race' });
  await expect(service.update(tag.id, {})).rejects.toMatchObject({
    code: 'TAG_INVALID',
  });
  await expect(service.get('bad')).rejects.toMatchObject({
    code: 'TAG_INVALID',
  });
  await expect(service.get(randomUUID())).rejects.toMatchObject({
    code: 'TAG_NOT_FOUND',
  });
});
