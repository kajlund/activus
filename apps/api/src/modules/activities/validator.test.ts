import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  ActivityMeasurementInputSchema,
  type ActivityMeasurementInput,
} from '@activus/contracts';
import type { DefinitionRecord } from './model.js';
import { measurementValue } from './validator.js';
import { validMeasurement } from '../../../test/support/configuration.js';
const id = randomUUID();
const definition: DefinitionRecord = {
  ...validMeasurement,
  id,
  activityKindId: randomUUID(),
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const input = (patch: Record<string, unknown>) =>
  ActivityMeasurementInputSchema.parse({
    measurementDefinitionId: id,
    valueType: 'decimal',
    value: '1',
    ...patch,
  });
it.each([
  ['1.234', 'kilometre', '1234'],
  ['0.1', 'kilometre', '100'],
  ['1', 'mile', '1609.344'],
  ['1', 'foot', '0.3048'],
  ['-0.000000', 'metre', '0'],
  ['9007199254740990.123456', 'metre', '9007199254740990.123456'],
])('converts %s %s exactly to %s', (value, unitId, expected) => {
  expect(
    measurementValue(input({ value, unitId }), { ...definition, precision: 6 })
      ?.numericValue,
  ).toBe(expected);
});
it('converts pounds exactly when the result fits canonical precision', () => {
  const d = {
    ...definition,
    canonicalUnit: 'kilogram',
    displayUnit: 'pound',
    precision: 6,
  };
  expect(
    measurementValue(input({ value: '100', unitId: 'pound' }), d)?.numericValue,
  ).toBe('45.359237');
  expect(() =>
    measurementValue(input({ value: '1', unitId: 'pound' }), d),
  ).toThrow(
    expect.objectContaining({ code: 'ACTIVITY_MEASUREMENT_VALUE_INVALID' }),
  );
});
it('validates exact boundaries after conversion without silently rounding', () => {
  const d = { ...definition, minimumValue: 1, maximumValue: 2 };
  for (const v of ['0.999', '2.001', '1.001'])
    expect(() => measurementValue(input({ value: v }), d)).toThrow();
  for (const v of ['1', '2', '1.01'])
    expect(measurementValue(input({ value: v }), d)?.numericValue).toBe(v);
});
it('accepts unitless decimals and rejects attached units', () => {
  const d = { ...definition, canonicalUnit: null, displayUnit: null };
  expect(measurementValue(input({ value: '1.23' }), d)?.numericValue).toBe(
    '1.23',
  );
  expect(() => measurementValue(input({ unitId: 'count' }), d)).toThrow(
    expect.objectContaining({ code: 'ACTIVITY_MEASUREMENT_UNIT_MISMATCH' }),
  );
});
it('requires integral canonical results for integers', () => {
  const d = { ...definition, valueType: 'integer', precision: null };
  expect(
    measurementValue(
      input({ valueType: 'integer', value: 2, unitId: 'kilometre' }),
      d,
    )?.integerValue,
  ).toBe(2000);
  expect(() =>
    measurementValue(
      input({ valueType: 'integer', value: 1, unitId: 'foot' }),
      d,
    ),
  ).toThrow();
});
it.each([
  { valueType: 'integer', value: 1.2 },
  { valueType: 'duration', value: 1, unitId: 'minute' },
  { valueType: 'duration', value: -1, unitId: 'second' },
  { valueType: 'rating', value: 2.5 },
  { valueType: 'boolean', value: 0 },
  { valueType: 'text', value: 'a'.repeat(501) },
  { valueType: 'decimal', value: '1e2' },
  { valueType: 'decimal', value: '1', unitId: 'unsupported' },
])('rejects invalid transport value %o', (patch) =>
  expect(() => input(patch)).toThrow(),
);
it('checks rating definition bounds', () => {
  const d = {
    ...definition,
    valueType: 'rating',
    precision: null,
    canonicalUnit: null,
    displayUnit: null,
    minimumValue: 1,
    maximumValue: 5,
  };
  const m: ActivityMeasurementInput = {
    measurementDefinitionId: id,
    valueType: 'rating',
    value: 6,
  };
  expect(() => measurementValue(m, d)).toThrow();
  expect(measurementValue({ ...m, value: 5 }, d)?.integerValue).toBe(5);
});
