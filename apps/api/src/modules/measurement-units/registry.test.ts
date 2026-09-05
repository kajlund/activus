import { expect, it } from 'vitest';
import {
  measurementUnits,
  MeasurementUnitListResponseSchema,
} from '@activus/contracts';
import { toCanonical, fromCanonical } from './registry.js';

it('exposes valid metadata with unique stable identities', () => {
  expect(
    MeasurementUnitListResponseSchema.parse({ items: measurementUnits }).items,
  ).toHaveLength(10);
  expect(new Set(measurementUnits.map((unit) => unit.id)).size).toBe(10);
});
it.each([
  ['kilometre', 1000],
  ['mile', 1609.344],
  ['foot', 0.3048],
  ['pound', 0.45359237],
  ['minute', 60],
  ['hour-minute', 1],
] as const)('converts one %s to its canonical value', (unit, expected) =>
  expect(toCanonical(1, unit)).toBe(expected),
);
it.each(measurementUnits)(
  'round trips $id including zero and negative boundary values',
  (unit) => {
    for (const value of [0, -1, 0.000001, 123.456, 1000000])
      expect(fromCanonical(toCanonical(value, unit.id), unit.id)).toBeCloseTo(
        value,
        8,
      );
  },
);
it('rejects unknown units, non-finite input and overflow', () => {
  expect(() => toCanonical(1, 'km')).toThrow();
  expect(() => toCanonical(Infinity, 'metre')).toThrow();
  expect(() => fromCanonical(NaN, 'metre')).toThrow();
  expect(() => toCanonical(Number.MAX_VALUE, 'mile')).toThrow();
});
