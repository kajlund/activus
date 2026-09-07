import {
  MeasurementFieldsSchema,
  type MeasurementFields,
  type MeasurementUnit,
} from '@activus/contracts';

export const typeLabels = {
  decimal: 'Decimal',
  integer: 'Integer',
  duration: 'Duration',
  rating: 'Rating',
  boolean: 'Yes or no',
  text: 'Short text',
} as const;
export const typeHelp = {
  decimal: 'A number that may contain decimals, such as distance or weight.',
  integer: 'A whole number, such as steps, laps, or repetitions.',
  duration:
    'An additional period such as moving or rest time. Overall activity duration already exists.',
  rating: 'A value selected within a small fixed range.',
  boolean: 'A yes or no value.',
  text: 'A short structured value. Long observations belong in activity notes.',
};
export const aggregationLabels = {
  total: 'Total',
  average: 'Average',
  latest: 'Latest value',
  minimum: 'Minimum value',
  none: 'Do not aggregate',
};
export const bestLabels = {
  highest: 'Highest value is better',
  lowest: 'Lowest value is better',
  none: 'Do not calculate personal bests',
};
export function defaults(
  valueType: MeasurementFields['valueType'],
): MeasurementFields {
  return {
    name: '',
    valueType,
    canonicalUnit: valueType === 'duration' ? 'second' : null,
    displayUnit: valueType === 'duration' ? 'hour-minute' : null,
    precision: valueType === 'decimal' ? 2 : valueType === 'integer' ? 0 : null,
    isRequired: false,
    minimumValue: valueType === 'rating' ? 1 : null,
    maximumValue: valueType === 'rating' ? 5 : null,
    aggregation: 'none',
    personalBestDirection: 'none',
    sortOrder: 0,
  };
}
export function compatibleUnits(
  type: MeasurementFields['valueType'],
  units: MeasurementUnit[],
) {
  return units.filter((unit) =>
    type === 'duration'
      ? unit.dimension === 'duration'
      : ['decimal', 'integer'].includes(type) && unit.dimension !== 'duration',
  );
}
export function validateFields(
  fields: MeasurementFields,
  units: MeasurementUnit[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const parsed = MeasurementFieldsSchema.safeParse(fields);
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      errors[String(issue.path[0])] =
        issue.path[0] === 'name'
          ? 'Enter a name of 1–120 characters.'
          : 'Enter a valid value within the allowed range.';
  const { minimumValue: min, maximumValue: max, valueType: type } = fields;
  if (min !== null && max !== null && min > max)
    errors.maximumValue = 'Maximum must be at least the minimum.';
  if (['integer', 'duration', 'rating'].includes(type))
    for (const key of ['minimumValue', 'maximumValue'] as const)
      if (
        fields[key] !== null &&
        (!Number.isSafeInteger(fields[key]) ||
          (type === 'duration' && fields[key]! < 0))
      )
        errors[key] =
          type === 'duration'
            ? 'Use a non-negative duration with whole seconds.'
            : 'Enter a whole number.';
  if (type === 'rating' && (min !== 1 || ![5, 10].includes(max ?? 0)))
    errors.maximumValue = 'Choose a rating range of 1–5 or 1–10.';
  if (type === 'rating' && fields.aggregation === 'total')
    errors.aggregation = 'Ratings cannot be totalled.';
  if (type === 'decimal' && fields.precision === null)
    errors.precision = 'Choose precision from 0 to 6.';
  if (fields.displayUnit !== null) {
    const unit = compatibleUnits(type, units).find(
      (u) => u.id === fields.displayUnit,
    );
    if (!unit || unit.canonicalUnit !== fields.canonicalUnit)
      errors.displayUnit = 'Choose a compatible display unit.';
  } else if (fields.canonicalUnit !== null || type === 'duration')
    errors.displayUnit = 'Choose a compatible display unit.';
  if (
    ['boolean', 'text'].includes(type) &&
    (fields.aggregation !== 'none' || fields.personalBestDirection !== 'none')
  )
    errors.aggregation = 'This value type has no numeric settings.';
  return errors;
}
// Bounds in the API are canonical; controls use the chosen display unit.
export function displayBound(
  value: number | null,
  unit: MeasurementUnit | undefined,
  duration: boolean,
): string {
  if (value === null) return '';
  if (duration)
    return `${Math.floor(value / 3600)}:${String(Math.floor((value % 3600) / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  return String(
    Number((value / (unit?.factorToCanonical ?? 1)).toPrecision(15)),
  );
}
export function canonicalBound(
  value: string,
  unit: MeasurementUnit | undefined,
  duration: boolean,
): number | null {
  if (!value.trim()) return null;
  if (duration) {
    const match = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
    return match
      ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0)
      : NaN;
  }
  return Number(value) * (unit?.factorToCanonical ?? 1);
}
