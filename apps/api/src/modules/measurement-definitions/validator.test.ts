import { describe, expect, it } from 'vitest';
import {
  measurementAggregations,
  personalBestDirections,
  type MeasurementFields,
} from '@activus/contracts';
import { validateMeasurement, isPrimaryEligible } from './validator.js';

export const legalFields: MeasurementFields[] = [
  {
    name: 'Decimal',
    valueType: 'decimal',
    canonicalUnit: 'metre',
    displayUnit: 'mile',
    precision: 2,
    isRequired: false,
    minimumValue: 0.5,
    maximumValue: 100,
    aggregation: 'total',
    personalBestDirection: 'highest',
    sortOrder: 0,
  },
  {
    name: 'Count',
    valueType: 'integer',
    canonicalUnit: 'count',
    displayUnit: 'count',
    precision: 0,
    isRequired: false,
    minimumValue: 0,
    maximumValue: 100,
    aggregation: 'total',
    personalBestDirection: 'highest',
    sortOrder: 0,
  },
  {
    name: 'Duration',
    valueType: 'duration',
    canonicalUnit: 'second',
    displayUnit: 'hour-minute',
    precision: null,
    isRequired: true,
    minimumValue: 0,
    maximumValue: 3600,
    aggregation: 'total',
    personalBestDirection: 'lowest',
    sortOrder: 0,
  },
  {
    name: 'Rating',
    valueType: 'rating',
    canonicalUnit: null,
    displayUnit: null,
    precision: null,
    isRequired: false,
    minimumValue: 1,
    maximumValue: 5,
    aggregation: 'average',
    personalBestDirection: 'none',
    sortOrder: 0,
  },
  ...(['boolean', 'text'] as const).map((valueType): MeasurementFields => ({
    name: valueType,
    valueType,
    canonicalUnit: null,
    displayUnit: null,
    precision: null,
    isRequired: false,
    minimumValue: null,
    maximumValue: null,
    aggregation: 'none',
    personalBestDirection: 'none',
    sortOrder: 0,
  })),
];
describe('measurement domain combinations', () => {
  it.each(legalFields)('accepts and normalizes $valueType', (fields) => {
    expect(
      validateMeasurement({ ...fields, name: `  ${fields.name}  ` }),
    ).toEqual(fields);
  });
  for (const fields of legalFields.slice(0, 4)) {
    it.each(
      measurementAggregations.flatMap((aggregation) =>
        personalBestDirections.map((personalBestDirection) => ({
          aggregation,
          personalBestDirection,
        })),
      ),
    )(`${fields.valueType} aggregation and personal best: %o`, (choice) => {
      const action = () => validateMeasurement({ ...fields, ...choice });
      if (fields.valueType === 'rating' && choice.aggregation === 'total')
        expect(action).toThrow();
      else expect(action).not.toThrow();
    });
  }
  it.each([
    { precision: null },
    { precision: -1 },
    { precision: 7 },
    { precision: 0.5 },
    { minimumValue: 101 },
    { minimumValue: Infinity },
    { maximumValue: NaN },
    { minimumValue: -Number.MAX_VALUE },
    { canonicalUnit: 'kilometre' },
    { displayUnit: 'pound' },
    { canonicalUnit: null },
    { displayUnit: null },
  ])('rejects invalid decimal %o', (patch) =>
    expect(() =>
      validateMeasurement({ ...legalFields[0], ...patch }),
    ).toThrow(),
  );
  it.each([{ precision: 2 }, { minimumValue: 0.5 }, { maximumValue: 1.5 }])(
    'rejects fractional integer configuration %o',
    (patch) =>
      expect(() =>
        validateMeasurement({ ...legalFields[1], ...patch }),
      ).toThrow(),
  );
  it.each([
    { canonicalUnit: 'minute' },
    { displayUnit: 'metre' },
    { precision: 0 },
    { minimumValue: -1 },
    { maximumValue: 1.5 },
  ])('rejects invalid duration %o', (patch) =>
    expect(() =>
      validateMeasurement({ ...legalFields[2], ...patch }),
    ).toThrow(),
  );
  it.each([
    { minimumValue: null },
    { maximumValue: null },
    { minimumValue: 0 },
    { maximumValue: 6 },
    { precision: 0 },
    { canonicalUnit: 'count', displayUnit: 'count' },
  ])('rejects invalid rating %o', (patch) =>
    expect(() =>
      validateMeasurement({ ...legalFields[3], ...patch }),
    ).toThrow(),
  );
  for (const fields of legalFields.slice(4))
    it.each([
      { canonicalUnit: 'count' },
      { displayUnit: 'count' },
      { precision: 0 },
      { minimumValue: 0 },
      { maximumValue: 1 },
      { aggregation: 'latest' },
      { personalBestDirection: 'highest' },
    ])(`rejects irrelevant ${fields.valueType} fields %o`, (patch) =>
      expect(() => validateMeasurement({ ...fields, ...patch })).toThrow(),
    );
  it('allows unitless numbers, equal numeric bounds, and 1–10 ratings', () => {
    expect(() =>
      validateMeasurement({
        ...legalFields[0],
        canonicalUnit: null,
        displayUnit: null,
        precision: 6,
        minimumValue: 2,
        maximumValue: 2,
      }),
    ).not.toThrow();
    expect(() =>
      validateMeasurement({
        ...legalFields[1],
        canonicalUnit: null,
        displayUnit: null,
        precision: null,
      }),
    ).not.toThrow();
    expect(() =>
      validateMeasurement({ ...legalFields[3], maximumValue: 10 }),
    ).not.toThrow();
  });
  it('restricts primary eligibility to active numeric parent definitions', () => {
    for (const f of legalFields)
      expect(
        isPrimaryEligible({ ...f, activityVariantId: null, archivedAt: null }),
      ).toBe(!['boolean', 'text'].includes(f.valueType));
    expect(
      isPrimaryEligible({
        valueType: 'decimal',
        activityVariantId: 'variant',
        archivedAt: null,
      }),
    ).toBe(false);
    expect(
      isPrimaryEligible({
        valueType: 'decimal',
        activityVariantId: null,
        archivedAt: new Date(),
      }),
    ).toBe(false);
  });
});
