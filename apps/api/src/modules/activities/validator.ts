import type { ActivityMeasurementInput } from '@activus/contracts';
import { measurementUnits } from '@activus/contracts';
import { ApiError } from '../../errors.js';
import type { DefinitionRecord, ValueFields } from './model.js';
import { compare, decimal, decimalString, multiply } from './decimal.js';

export function activityError(
  code: string,
  message: string,
  status: 400 | 404 | 409 = 400,
  details?: ApiError['details'],
): never {
  throw new ApiError(status, code, message, details);
}
export function effective(
  d: DefinitionRecord,
  kindId: string,
  variantId: string | null,
) {
  return (
    d.activityKindId === kindId &&
    (d.activityVariantId === null || d.activityVariantId === variantId)
  );
}
export function measurementValue(
  input: ActivityMeasurementInput,
  definition: DefinitionRecord,
): ValueFields | undefined {
  if (input.valueType !== definition.valueType)
    activityError(
      'ACTIVITY_MEASUREMENT_TYPE_MISMATCH',
      'Value type does not match its definition',
    );
  const value: ValueFields = {
    measurementDefinitionId: definition.id,
    numericValue: null,
    integerValue: null,
    booleanValue: null,
    textValue: null,
  };
  if (input.valueType === 'text') {
    const text = input.value.trim();
    return text ? { ...value, textValue: text } : undefined;
  }
  if (input.valueType === 'boolean')
    return { ...value, booleanValue: input.value };
  const unitId = 'unitId' in input ? input.unitId : undefined;
  const unit = measurementUnits.find(
    (u) => u.id === (unitId ?? definition.canonicalUnit),
  );
  if (
    (definition.canonicalUnit === null && unitId !== undefined) ||
    (definition.canonicalUnit !== null &&
      (!unit || unit.canonicalUnit !== definition.canonicalUnit))
  )
    activityError(
      'ACTIVITY_MEASUREMENT_UNIT_MISMATCH',
      'Unit is incompatible with this definition',
    );
  try {
    const canonical = multiply(
      decimal(input.value),
      decimal(unit?.factorToCanonical ?? 1),
    );
    const precision =
      input.valueType === 'decimal' ? (definition.precision ?? 0) : 0;
    if (
      canonical.scale > precision ||
      compare(canonical, decimal(-Number.MAX_SAFE_INTEGER)) < 0 ||
      compare(canonical, decimal(Number.MAX_SAFE_INTEGER)) > 0 ||
      (definition.minimumValue !== null &&
        compare(canonical, decimal(definition.minimumValue)) < 0) ||
      (definition.maximumValue !== null &&
        compare(canonical, decimal(definition.maximumValue)) > 0)
    )
      throw new RangeError('Invalid value');
    if (input.valueType === 'duration' && canonical.coefficient < 0n)
      throw new RangeError('Invalid duration');
    return input.valueType === 'decimal'
      ? { ...value, numericValue: decimalString(canonical) }
      : { ...value, integerValue: Number(canonical.coefficient) };
  } catch {
    return activityError(
      'ACTIVITY_MEASUREMENT_VALUE_INVALID',
      'Value exceeds the canonical precision or permitted range',
    );
  }
}
