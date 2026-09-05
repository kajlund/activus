import { expect, it } from 'vitest';
import { ActivityKindNameConflict } from './model.js';
import { translateRepositoryError } from './repository.js';

it('maps PostgreSQL unique violations through a Drizzle cause wrapper', () => {
  expect(() =>
    translateRepositoryError({
      cause: { code: '23505', constraint: 'activity_kinds_name_unique' },
    }),
  ).toThrow(ActivityKindNameConflict);
});

it('does not misclassify unrelated PostgreSQL errors as name conflicts', () => {
  const error = new Error('unrelated');
  expect(() => translateRepositoryError(error)).toThrow(error);
  const otherIndex = { code: '23505', constraint: 'other_index' };
  try {
    translateRepositoryError(otherIndex);
  } catch (caught) {
    expect(caught).toBe(otherIndex);
  }
});
