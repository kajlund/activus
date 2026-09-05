import {
  MeasurementFieldsSchema,
  measurementUnits,
  type MeasurementFields,
} from '@activus/contracts';
import { ApiError } from '../../errors.js';

export function validateMeasurement(input: unknown): MeasurementFields {
  const parsed = MeasurementFieldsSchema.safeParse(input);
  if (!parsed.success) throw invalidMeasurement();
  const m = parsed.data;
  const bounds = [m.minimumValue, m.maximumValue].filter(
    (v): v is number => v !== null,
  );
  if (
    m.minimumValue !== null &&
    m.maximumValue !== null &&
    m.minimumValue > m.maximumValue
  )
    throw invalidMeasurement();
  const noUnits = m.canonicalUnit === null && m.displayUnit === null;
  if (m.valueType === 'boolean' || m.valueType === 'text') {
    if (
      !noUnits ||
      m.precision !== null ||
      bounds.length ||
      m.aggregation !== 'none' ||
      m.personalBestDirection !== 'none'
    )
      throw invalidMeasurement();
  } else if (m.valueType === 'rating') {
    if (
      !noUnits ||
      m.precision !== null ||
      m.minimumValue !== 1 ||
      ![5, 10].includes(m.maximumValue ?? 0) ||
      m.aggregation === 'total'
    )
      throw invalidMeasurement();
  } else if (m.valueType === 'duration') {
    if (
      m.canonicalUnit !== 'second' ||
      !['second', 'minute', 'hour-minute'].includes(m.displayUnit ?? '') ||
      m.precision !== null ||
      bounds.some((v) => !Number.isSafeInteger(v) || v < 0)
    )
      throw invalidMeasurement();
  } else {
    if (m.valueType === 'decimal' && m.precision === null)
      throw invalidMeasurement();
    if (
      m.valueType === 'integer' &&
      ((m.precision !== null && m.precision !== 0) ||
        bounds.some((v) => !Number.isSafeInteger(v)))
    )
      throw invalidMeasurement();
    const display = measurementUnits.find((unit) => unit.id === m.displayUnit);
    if (
      !noUnits &&
      (!display ||
        display.dimension === 'duration' ||
        display.canonicalUnit !== m.canonicalUnit)
    )
      throw invalidMeasurement();
  }
  return m;
}

export function invalidMeasurement() {
  return new ApiError(
    400,
    'MEASUREMENT_DEFINITION_INVALID',
    'Invalid measurement definition',
  );
}
export function isPrimaryEligible(m: {
  activityVariantId: string | null;
  archivedAt: Date | null;
  valueType: string;
}) {
  return (
    m.activityVariantId === null &&
    m.archivedAt === null &&
    !['boolean', 'text'].includes(m.valueType)
  );
}
