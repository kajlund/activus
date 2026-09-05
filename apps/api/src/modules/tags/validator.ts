import { ApiError } from '../../errors.js';
import type { TagRecord } from './model.js';
import { ActivityTagIdsSchema } from '@activus/contracts';
export function validateTagInput(input: unknown) {
  if (
    input &&
    typeof input === 'object' &&
    'tagIds' in input &&
    input.tagIds !== undefined &&
    !ActivityTagIdsSchema.safeParse(input.tagIds).success
  )
    throw new ApiError(400, 'ACTIVITY_TAG_INVALID', 'Invalid activity tag IDs');
}
export function requireTags(ids: string[], found: TagRecord[]) {
  if (ids.some((id) => !found.some((tag) => tag.id === id)))
    throw new ApiError(404, 'TAG_NOT_FOUND', 'Tag not found');
}
export function validateActivityTags(
  ids: string[] | undefined,
  existing: TagRecord[],
  found: TagRecord[],
) {
  if (ids === undefined) return;
  if (new Set(ids).size !== ids.length)
    throw new ApiError(400, 'ACTIVITY_TAG_DUPLICATE', 'Duplicate tag IDs');
  requireTags(ids, found);
  if (
    found.some(
      (tag) =>
        ids.includes(tag.id) &&
        tag.archivedAt &&
        !existing.some((old) => old.id === tag.id),
    )
  )
    throw new ApiError(
      409,
      'TAG_ARCHIVED',
      'Cannot newly assign an archived tag',
    );
  return ids;
}
