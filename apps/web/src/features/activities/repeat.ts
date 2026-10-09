import type {
  Activity,
  ActivityKind,
  ActivityVariant,
  ActivitySummary,
  MeasurementDefinition,
  ActivityMeasurementInput,
} from '@activus/contracts';
import {
  helsinkiDate,
  isOverallDuration,
  measurementDraftText,
  measurementInput,
  splitDuration,
} from './values.js';

export type ActivityDraft = {
  activityKindId: string;
  activityVariantId: string;
  activityDate: string;
  start: string;
  hours: string;
  minutes: string;
  seconds: string;
  name: string;
  notes: string;
  effort: string;
  feeling: string;
  tagIds: string[];
};
export const freshDraft = (today = helsinkiDate()): ActivityDraft => ({
  activityKindId: '',
  activityVariantId: '',
  activityDate: today,
  start: '',
  hours: '',
  minutes: '',
  seconds: '',
  name: '',
  notes: '',
  effort: '',
  feeling: '',
  tagIds: [],
});
export type CopyOptions = { copyValues: boolean; copyNotes: boolean };
export const emptyCopy: CopyOptions = { copyValues: false, copyNotes: false };
export type RepeatWarning = {
  code: 'kind' | 'variant' | 'measurement' | 'duration';
  message: string;
  definitionId?: string;
};
export type CopiedValue = { text: string; input: ActivityMeasurementInput };
export function initializeRepeat(
  source: Activity,
  config: {
    kinds: ActivityKind[];
    variants: ActivityVariant[];
    definitions: MeasurementDefinition[];
  },
  options: CopyOptions,
  today: string,
) {
  const draft = freshDraft(today);
  const warnings: RepeatWarning[] = [];
  const values: Record<string, string> = {};
  const copied: Record<string, CopiedValue> = {};
  draft.name = source.name ?? '';
  draft.notes = options.copyNotes ? (source.notes ?? '') : '';
  const kind = config.kinds.find(
    (k) => k.id === source.activityKindId && !k.isArchived,
  );
  if (kind) draft.activityKindId = kind.id;
  else
    warnings.push({
      code: 'kind',
      message:
        'The source activity kind is archived or unavailable. Choose an active kind.',
    });
  const variant = config.variants.find(
    (v) =>
      v.id === source.activityVariantId &&
      v.activityKindId === kind?.id &&
      !v.isArchived,
  );
  if (variant) draft.activityVariantId = variant.id;
  else if (kind && source.activityVariantId)
    warnings.push({
      code: 'variant',
      message:
        'The source variant is archived or unavailable. Choose an active variant or deliberately choose No variant.',
    });
  const definitions = config.definitions.filter(
    (d) =>
      !d.isArchived &&
      d.activityKindId === draft.activityKindId &&
      (!d.activityVariantId || d.activityVariantId === draft.activityVariantId),
  );
  if (options.copyValues) {
    let duration = source.durationSeconds;
    if (duration === null) {
      const historical = source.measurements.find(
        (m) =>
          isOverallDuration(m) &&
          definitions.some(
            (d) => d.id === m.measurementDefinitionId && isOverallDuration(d),
          ),
      );
      if (historical?.valueType === 'duration')
        duration = historical.canonicalValue;
    }
    if (duration !== null) {
      if (
        Number.isSafeInteger(duration) &&
        duration >= 0 &&
        definitions
          .filter(isOverallDuration)
          .every(
            (d) =>
              (d.minimumValue === null || duration! >= d.minimumValue) &&
              (d.maximumValue === null || duration! <= d.maximumValue),
          )
      ) {
        [draft.hours, draft.minutes, draft.seconds] = splitDuration(duration);
      } else
        warnings.push({
          code: 'duration',
          message:
            'Duration was omitted because it no longer meets the current bounds.',
        });
    }
    for (const m of source.measurements) {
      const matches = definitions.filter(
        (d) => d.id === m.measurementDefinitionId,
      );
      const d = matches.length === 1 ? matches[0] : undefined;
      try {
        if (
          !d ||
          d.valueType !== m.valueType ||
          d.canonicalUnit !== m.canonicalUnit
        )
          throw new Error('incompatible');
        const input = measurementInput(
          { ...d, displayUnit: d.canonicalUnit },
          String(m.canonicalValue),
        );
        if (!input) throw new Error('missing');
        if (isOverallDuration(d)) continue;
        const text = measurementDraftText(d, m);
        values[d.id] = text;
        copied[d.id] = { text, input };
      } catch {
        warnings.push({
          code: 'measurement',
          definitionId: m.measurementDefinitionId,
          message: `${m.name} was omitted: its definition is unavailable or the value is incompatible with the current type, unit, bounds or precision.`,
        });
      }
    }
  }
  return { draft, values, copied, warnings };
}
export function recentChoices(items: ActivitySummary[]) {
  const seen = new Set<string>();
  return items
    .filter((a) => {
      if (a.kind.isArchived || a.variant?.isArchived) return false;
      const key = JSON.stringify([
        a.kind.id,
        a.variant?.id ?? null,
        a.name?.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() ??
          '',
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}
// One-shot options only: no notes or activity payload in navigation/storage.
let pending: { id: string; options: CopyOptions } | undefined;
export function stageRepeat(id: string, options: CopyOptions) {
  pending = { id, options };
}
export function takeRepeatOptions(id: string): CopyOptions {
  const options = pending?.id === id ? pending.options : emptyCopy;
  pending = undefined;
  return { ...options };
}
