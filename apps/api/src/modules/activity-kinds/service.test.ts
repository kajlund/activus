import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeActivityKindRepository,
  validKind,
} from '../../../test/support/activity-kind-repository.js';
import { ActivityKindNameConflict } from './model.js';
import { ActivityKindService } from './service.js';

describe('activity-kind service', () => {
  let repository: FakeActivityKindRepository;
  let service: ActivityKindService;
  beforeEach(() => {
    repository = new FakeActivityKindRepository();
    service = new ActivityKindService(repository);
  });

  it('trims names and normalizes colours before persistence', async () => {
    const result = await service.create({
      ...validKind,
      name: ' \tWalking\n',
      color: '#abcdef',
    });
    expect(result).toMatchObject({
      name: 'Walking',
      color: '#ABCDEF',
      isArchived: false,
    });
    expect(repository.rows.get(result.id)?.name).toBe('Walking');
  });

  it.each([
    { name: '' },
    { name: ' \t\n' },
    { name: 'a'.repeat(121) },
    { color: 'red' },
    { color: '#abc' },
    { color: '#ZZZZZZ' },
    { sortOrder: -1 },
    { sortOrder: 0.5 },
    { sortOrder: 2147483648 },
    { iconName: '<svg />' },
    { iconName: 'unknown-icon' },
  ])('rejects invalid domain input %o', async (invalid) => {
    await expect(
      service.create({ ...validKind, ...invalid }),
    ).rejects.toMatchObject({ status: 400, code: 'ACTIVITY_KIND_INVALID' });
    expect(repository.rows.size).toBe(0);
  });

  it('rejects empty updates and preserves omitted fields', async () => {
    const row = await service.create(validKind);
    await expect(service.update(row.id, {})).rejects.toMatchObject({
      code: 'ACTIVITY_KIND_INVALID',
    });
    expect(await service.update(row.id, { name: ' Hiking ' })).toMatchObject({
      name: 'Hiking',
      iconName: row.iconName,
      color: row.color,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
    });
  });

  it('archives and restores idempotently without removing the row', async () => {
    const row = await service.create(validKind);
    const archived = await service.archive(row.id);
    expect(archived.isArchived).toBe(true);
    expect(await service.archive(row.id)).toEqual(archived);
    expect((await service.list()).items).toEqual([]);
    expect((await service.list(true)).items).toEqual([archived]);
    const restored = await service.restore(row.id);
    expect(restored.isArchived).toBe(false);
    expect(await service.restore(row.id)).toEqual(restored);
    expect(repository.rows.size).toBe(1);
  });

  it('reserves archived names and maps duplicate conflicts', async () => {
    const row = await service.create(validKind);
    await service.archive(row.id);
    await expect(
      service.create({ ...validKind, name: 'walking' }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'ACTIVITY_KIND_NAME_CONFLICT',
    });
  });

  it('maps a restore conflict raised by persistence', async () => {
    vi.spyOn(repository, 'setArchived').mockRejectedValue(
      new ActivityKindNameConflict(),
    );
    await expect(
      service.restore('00000000-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({
      status: 409,
      code: 'ACTIVITY_KIND_NAME_CONFLICT',
    });
  });

  it('preserves deterministic repository ordering in the response', async () => {
    await service.create({ ...validKind, name: 'Zulu', sortOrder: 1 });
    await service.create({ ...validKind, name: 'Beta', sortOrder: 0 });
    await service.create({ ...validKind, name: 'Alpha', sortOrder: 0 });
    expect((await service.list()).items.map((row) => row.name)).toEqual([
      'Alpha',
      'Beta',
      'Zulu',
    ]);
  });
});
