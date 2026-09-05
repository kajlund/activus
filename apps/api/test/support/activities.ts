import { randomUUID } from 'node:crypto';
import type {
  ActivityRepository,
  ActivityRecord,
  ValueRecord,
  ActivityBundle,
} from '../../src/modules/activities/model.js';
import { ApiError } from '../../src/errors.js';
import { configurationDoubles } from './configuration.js';

export const validActivity = { activityDate: '2024-02-29', measurements: [] };
export function activityDoubles() {
  const config = configurationDoubles();
  const rows = new Map<string, ActivityRecord>();
  const values = new Map<string, ValueRecord[]>();
  function bundle(id: string): ActivityBundle | undefined {
    const activity = rows.get(id);
    if (!activity) return;
    const kind = config.activityKinds.rows.get(activity.activityKindId)!;
    const variant =
      config.variants.rows.get(activity.activityVariantId ?? '') ?? null;
    const measurements = (values.get(id) ?? [])
      .map((value) => ({
        value,
        definition: config.measurements.rows.get(
          value.measurementDefinitionId,
        )!,
      }))
      .sort(
        (a, b) =>
          Number(a.definition.activityVariantId !== null) -
            Number(b.definition.activityVariantId !== null) ||
          a.definition.sortOrder - b.definition.sortOrder ||
          Buffer.compare(
            Buffer.from(a.definition.name),
            Buffer.from(b.definition.name),
          ) ||
          a.definition.id.localeCompare(b.definition.id),
      );
    return { activity, kind, variant, measurements };
  }
  const repository: ActivityRepository = {
    async find(id) {
      return bundle(id);
    },
    async findVariant(id) {
      return config.variants.find(id);
    },
    async list(q) {
      return [...rows.values()]
        .filter(
          (a) =>
            (!q.dateFrom || a.activityDate >= q.dateFrom) &&
            (!q.dateTo || a.activityDate <= q.dateTo) &&
            (!q.activityKindId || a.activityKindId === q.activityKindId) &&
            (!q.activityVariantId ||
              a.activityVariantId === q.activityVariantId) &&
            (q.isPartial === undefined || a.isPartial === q.isPartial) &&
            (!q.search ||
              [a.name, a.notes].some((t) =>
                t?.toLowerCase().includes(q.search!.toLowerCase()),
              )),
        )
        .sort(
          (a, b) =>
            b.activityDate.localeCompare(a.activityDate) ||
            (b.startedAt?.getTime() ?? -Infinity) -
              (a.startedAt?.getTime() ?? -Infinity) ||
            b.createdAt.getTime() - a.createdAt.getTime() ||
            b.id.localeCompare(a.id),
        )
        .slice(q.offset, q.offset + q.limit + 1)
        .map((a) => bundle(a.id)!);
    },
    async write(id, kindId, validate) {
      const existing = id ? bundle(id) : undefined;
      if (id && !existing)
        throw new ApiError(404, 'ACTIVITY_NOT_FOUND', 'Activity not found');
      const selected = kindId ?? existing?.activity.activityKindId ?? '';
      const write = validate({
        existing,
        kind: config.activityKinds.rows.get(selected),
        variants: [...config.variants.rows.values()].filter(
          (v) => v.activityKindId === selected,
        ),
        definitions: [...config.measurements.rows.values()].filter(
          (d) => d.activityKindId === selected,
        ),
      });
      const nextId = id ?? randomUUID();
      const now = new Date();
      rows.set(nextId, {
        ...write.fields,
        id: nextId,
        source: null,
        sourceExternalId: null,
        createdAt: existing?.activity.createdAt ?? now,
        updatedAt: now,
      });
      if (write.measurements !== undefined)
        values.set(
          nextId,
          write.measurements.map((v) => ({
            ...v,
            id: randomUUID(),
            activityId: nextId,
            createdAt: now,
            updatedAt: now,
          })),
        );
      return bundle(nextId)!;
    },
    async delete(id) {
      values.delete(id);
      return rows.delete(id);
    },
  };
  return { ...config, activities: repository, rows, values };
}
