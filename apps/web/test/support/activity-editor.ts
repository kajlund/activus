// Tests only: exercise the real Hono routes and domain services against the
// existing isolated repository doubles. No TCP connection or database is used.
import { createApp } from '../../../api/src/app.js';
import { activityDoubles } from '../../../api/test/support/activities.js';
import { validKind } from '../../../api/test/support/activity-kind-repository.js';
import {
  validMeasurement,
  validVariant,
} from '../../../api/test/support/configuration.js';
import { createConfigurationApi } from '../../src/services/configuration-api.js';
export { validMeasurement };
export async function editorFixture() {
  const deps = activityDoubles();
  const app = createApp(
    {
      NODE_ENV: 'test',
      PORT: 3000,
      LOG_LEVEL: 'silent',
      WEB_ORIGIN: 'http://localhost:5173',
    },
    undefined,
    deps,
  );
  const api = createConfigurationApi({
    baseUrl: 'http://test/api/v1',
    fetch: async (input, init) => app.request(String(input), init),
  });
  const kind = await deps.activityKinds.create({
    ...validKind,
    name: 'Walking',
  });
  const variant = await deps.variants.create(kind.id, {
    ...validVariant,
    isDefault: true,
  });
  const otherVariant = await deps.variants.create(kind.id, {
    ...validVariant,
    name: 'Treadmill',
  });
  const distance = await deps.measurements.create(kind.id, {
    ...validMeasurement,
    isRequired: true,
  });
  const incline = await deps.measurements.create(kind.id, {
    ...validMeasurement,
    name: 'Incline',
    activityVariantId: otherVariant.id,
    canonicalUnit: null,
    displayUnit: null,
    minimumValue: 0,
    maximumValue: 100,
    isRequired: false,
  });
  const tag = await deps.tags.create({ name: 'Commute', color: '#67318F' });
  const otherTag = await deps.tags.create({ name: 'With dog', color: null });
  return {
    deps,
    app,
    api,
    kind,
    variant,
    otherVariant,
    distance,
    incline,
    tag,
    otherTag,
  };
}
