import {
  ActivitySchema,
  ActivityMeasurementSchema,
  ActivitySummarySchema,
  measurementUnits,
} from '@activus/contracts';
import type { ActivityBundle } from './model.js';
import { decimal, decimalString, divideForDisplay } from './decimal.js';

export function toActivityMeasurement({
  definition: d,
  value: v,
}: ActivityBundle['measurements'][number]) {
  const canonicalValue =
    v.numericValue !== null
      ? decimalString(decimal(v.numericValue))
      : (v.integerValue ?? v.booleanValue ?? v.textValue);
  const unit = measurementUnits.find((u) => u.id === d.displayUnit);
  const numeric = v.numericValue !== null || v.integerValue !== null;
  const displayValue = numeric
    ? divideForDisplay(
        decimal(String(canonicalValue)),
        decimal(unit?.factorToCanonical ?? 1),
        d.precision ?? unit?.defaultPrecision ?? 0,
      )
    : canonicalValue;
  return ActivityMeasurementSchema.parse({
    measurementDefinitionId: d.id,
    name: d.name,
    valueType: d.valueType,
    isArchived: d.archivedAt !== null,
    source: d.activityVariantId === null ? 'inherited' : 'variant-specific',
    canonicalValue,
    canonicalUnit: d.canonicalUnit,
    displayValue,
    displayUnit: d.displayUnit,
  });
}
export function toActivity(bundle: ActivityBundle) {
  const { activity: a, kind: k, variant: v } = bundle;
  return ActivitySchema.parse({
    id: a.id,
    activityKindId: a.activityKindId,
    activityVariantId: a.activityVariantId,
    activityDate: a.activityDate,
    startedAt: a.startedAt?.toISOString() ?? null,
    durationSeconds: a.durationSeconds,
    name: a.name,
    notes: a.notes,
    effort: a.effort,
    feeling: a.feeling,
    isPartial: a.isPartial,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    kind: {
      id: k.id,
      name: k.name,
      iconName: k.iconName,
      color: k.color,
      isArchived: k.archivedAt !== null,
    },
    variant: v
      ? { id: v.id, name: v.name, isArchived: v.archivedAt !== null }
      : null,
    measurements: bundle.measurements.map(toActivityMeasurement),
  });
}
export function toActivitySummary(bundle: ActivityBundle) {
  const a = toActivity(bundle);
  const primaryMeasurement =
    a.measurements.find(
      (m) =>
        m.measurementDefinitionId ===
        bundle.kind.primaryMeasurementDefinitionId,
    ) ?? null;
  return ActivitySummarySchema.parse({
    id: a.id,
    activityDate: a.activityDate,
    startedAt: a.startedAt,
    name: a.name,
    kind: a.kind,
    variant: a.variant,
    durationSeconds: a.durationSeconds,
    isPartial: a.isPartial,
    hasNotes: a.notes !== null,
    primaryMeasurement,
    fallback:
      !primaryMeasurement && a.durationSeconds !== null
        ? { type: 'duration', durationSeconds: a.durationSeconds }
        : { type: 'none' },
  });
}
