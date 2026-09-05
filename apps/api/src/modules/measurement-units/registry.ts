import { measurementUnits, type MeasurementUnit } from '@activus/contracts';

export function unitMetadata(id: string): MeasurementUnit {
  const unit = measurementUnits.find((entry) => entry.id === id);
  if (!unit) throw new RangeError('Unsupported measurement unit');
  return unit;
}
function finite(value: number) {
  if (!Number.isFinite(value))
    throw new RangeError('A finite measurement is required');
  return value;
}
export function toCanonical(value: number, unit: string) {
  return finite(finite(value) * unitMetadata(unit).factorToCanonical);
}
export function fromCanonical(value: number, unit: string) {
  return finite(finite(value) / unitMetadata(unit).factorToCanonical);
}
