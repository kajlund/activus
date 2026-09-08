import { CreateActivityRequestSchema } from '@activus/contracts';
import { editorFixture } from './activity-editor.js';
export async function journalFixture(count = 30) {
  const f = await editorFixture();
  await f.api.updateKind(f.kind.id, {
    primaryMeasurementDefinitionId: f.distance.id,
  });
  const activities = [];
  for (let i = 0; i < count; i++) {
    const activity = await f.api.createActivity(
      CreateActivityRequestSchema.parse({
        activityKindId: f.kind.id,
        activityVariantId: i % 2 ? f.otherVariant.id : f.variant.id,
        activityDate: new Date(Date.UTC(2026, 8, 7 - Math.floor(i / 2)))
          .toISOString()
          .slice(0, 10),
        startedAt: i % 3 ? null : '2026-09-07T06:30:00.000Z',
        durationSeconds: i === 0 ? 0 : 3600 + i * 60,
        name: `Entry ${String(i + 1).padStart(2, '0')}`,
        notes: i === 0 ? 'Along the river\nA plain-text journal note.' : null,
        measurements: [
          {
            measurementDefinitionId: f.distance.id,
            valueType: 'decimal',
            value: String(i * 1000),
            unitId: 'metre',
          },
        ],
        tagIds: i % 2 ? [f.tag.id, f.otherTag.id] : [f.tag.id],
      }),
    );
    f.deps.rows.get(activity.id)!.createdAt = new Date('2026-09-08T12:00:00Z');
    activities.push(activity);
  }
  return { ...f, activities };
}
