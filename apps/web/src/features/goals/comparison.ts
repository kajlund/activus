import type { CreateGoalRequest, Goal } from '@activus/contracts';

type GoalDefinition = CreateGoalRequest | Goal;
const decimal = (value: string | number) => {
  const [integer = '0', fraction = ''] = String(value).split('.');
  const whole = integer.replace(/^0+(?=\d)/, '') || '0';
  const fractional = fraction.replace(/0+$/, '');
  return fractional ? `${whole}.${fractional}` : whole;
};
export function normalizeGoalDefinition(value: GoalDefinition) {
  return {
    name: value.name.trim(),
    description: value.description?.trim() || null,
    activityKindId: value.activityKindId,
    activityVariantId: value.activityVariantId ?? null,
    tagIds: [...new Set(value.tagIds)].sort(),
    targetType: value.targetType,
    targetValue: decimal(value.targetValue),
    measurementDefinitionId: value.measurementDefinitionId ?? null,
    scheduleMode: value.scheduleMode,
    recurrencePeriod: value.recurrencePeriod ?? null,
    startDate: value.startDate,
    endDate: value.endDate,
  };
}

export function sameGoalDefinition(a: GoalDefinition, b: GoalDefinition) {
  return (
    JSON.stringify(normalizeGoalDefinition(a)) ===
    JSON.stringify(normalizeGoalDefinition(b))
  );
}

export function sameProgressCriteria(a: GoalDefinition, b: GoalDefinition) {
  const left = normalizeGoalDefinition(a);
  const right = normalizeGoalDefinition(b);
  return (
    left.activityKindId === right.activityKindId &&
    left.activityVariantId === right.activityVariantId &&
    left.tagIds.join(',') === right.tagIds.join(',') &&
    left.targetType === right.targetType &&
    left.measurementDefinitionId === right.measurementDefinitionId &&
    left.targetValue === right.targetValue &&
    left.scheduleMode === right.scheduleMode &&
    left.recurrencePeriod === right.recurrencePeriod &&
    left.startDate === right.startDate &&
    left.endDate === right.endDate
  );
}
