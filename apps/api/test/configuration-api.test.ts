import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { pino } from 'pino';
import {
  ApiErrorResponseSchema,
  ActivityVariantSchema,
  ActivityVariantListResponseSchema,
  MeasurementDefinitionSchema,
  MeasurementDefinitionListResponseSchema,
  MeasurementUnitListResponseSchema,
} from '@activus/contracts';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import {
  configurationDoubles,
  validMeasurement,
  validVariant,
} from './support/configuration.js';
import { validKind } from './support/activity-kind-repository.js';

let deps: ReturnType<typeof configurationDoubles>;
let app: ReturnType<typeof createApp>;
let kindId: string;
const request = (path: string, method = 'GET', body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = ApiErrorResponseSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(response.headers.get('X-Request-Id'));
}
beforeEach(async () => {
  deps = configurationDoubles();
  app = createApp(
    parseEnv({ NODE_ENV: 'production' }),
    pino({ level: 'silent' }),
    deps,
  );
  kindId = (await deps.activityKinds.create(validKind)).id;
});
it('covers all variant endpoints including default changes and explicit archive inclusion', async () => {
  const create = await request(`/activity-kinds/${kindId}/variants`, 'POST', {
    ...validVariant,
    isDefault: true,
  });
  expect(create.status).toBe(201);
  const variant = ActivityVariantSchema.parse(await create.json());
  expect(create.headers.get('Location')).toBe(
    `/api/v1/activity-variants/${variant.id}`,
  );
  expect(
    await (await request(`/activity-variants/${variant.id}`)).json(),
  ).toEqual(variant);
  const patch = await request(`/activity-variants/${variant.id}`, 'PATCH', {
    name: ' Trail ',
    isDefault: false,
  });
  expect(patch.status).toBe(200);
  expect(await patch.json()).toMatchObject({
    name: 'Trail',
    isDefault: false,
    activityKindId: kindId,
  });
  expect(
    (await request(`/activity-variants/${variant.id}/archive`, 'POST')).status,
  ).toBe(200);
  expect(
    ActivityVariantListResponseSchema.parse(
      await (await request(`/activity-kinds/${kindId}/variants`)).json(),
    ).items,
  ).toHaveLength(0);
  expect(
    ActivityVariantListResponseSchema.parse(
      await (
        await request(`/activity-kinds/${kindId}/variants?includeArchived=true`)
      ).json(),
    ).items,
  ).toHaveLength(1);
  expect(
    (await request(`/activity-variants/${variant.id}/restore`, 'POST')).status,
  ).toBe(200);
});
it('covers all measurement endpoints, effective view, primary selection and metadata', async () => {
  const variant = await deps.variants.create(kindId, validVariant);
  const create = await request(
    `/activity-kinds/${kindId}/measurements`,
    'POST',
    validMeasurement,
  );
  expect(create.status).toBe(201);
  const measurement = MeasurementDefinitionSchema.parse(await create.json());
  expect(create.headers.get('Location')).toBe(
    `/api/v1/measurement-definitions/${measurement.id}`,
  );
  expect(
    await (await request(`/measurement-definitions/${measurement.id}`)).json(),
  ).toEqual(measurement);
  expect(
    (
      await request(`/measurement-definitions/${measurement.id}`, 'PATCH', {
        name: 'Length',
      })
    ).status,
  ).toBe(200);
  const view = MeasurementDefinitionListResponseSchema.parse(
    await (
      await request(
        `/activity-kinds/${kindId}/measurements?activityVariantId=${variant.id}&effective=true`,
      )
    ).json(),
  );
  expect(view.view).toBe('effective');
  if (view.view === 'effective')
    expect(view.items[0]?.source).toBe('inherited');
  expect(
    (
      await request(`/activity-kinds/${kindId}`, 'PATCH', {
        primaryMeasurementDefinitionId: measurement.id,
      })
    ).status,
  ).toBe(200);
  await error(
    await request(`/measurement-definitions/${measurement.id}/archive`, 'POST'),
    409,
    'MEASUREMENT_DEFINITION_IS_PRIMARY',
  );
  await request(`/activity-kinds/${kindId}`, 'PATCH', {
    primaryMeasurementDefinitionId: null,
  });
  expect(
    (
      await request(
        `/measurement-definitions/${measurement.id}/archive`,
        'POST',
      )
    ).status,
  ).toBe(200);
  expect(
    MeasurementDefinitionListResponseSchema.parse(
      await (await request(`/activity-kinds/${kindId}/measurements`)).json(),
    ).items,
  ).toHaveLength(0);
  expect(
    MeasurementDefinitionListResponseSchema.parse(
      await (
        await request(
          `/activity-kinds/${kindId}/measurements?includeArchived=true`,
        )
      ).json(),
    ).items,
  ).toHaveLength(1);
  expect(
    (
      await request(
        `/measurement-definitions/${measurement.id}/restore`,
        'POST',
      )
    ).status,
  ).toBe(200);
  const units = await request('/measurement-units');
  expect(units.status).toBe(200);
  expect(
    MeasurementUnitListResponseSchema.parse(await units.json()).items,
  ).toHaveLength(10);
});
for (const feature of [
  {
    list: 'variants',
    item: 'activity-variants',
    body: validVariant,
    code: 'ACTIVITY_VARIANT',
  },
  {
    list: 'measurements',
    item: 'measurement-definitions',
    body: validMeasurement,
    code: 'MEASUREMENT_DEFINITION',
  },
]) {
  it.each([
    ['GET', ''],
    ['PATCH', ''],
    ['POST', '/archive'],
    ['POST', '/restore'],
  ])(`${feature.item} validates IDs: %s %s`, async (method, suffix) => {
    await error(
      await request(
        `/${feature.item}/bad${suffix}`,
        method,
        method === 'PATCH' ? { name: 'New' } : undefined,
      ),
      400,
      `${feature.code}_INVALID`,
    );
    await error(
      await request(
        `/${feature.item}/${randomUUID()}${suffix}`,
        method,
        method === 'PATCH' ? { name: 'New' } : undefined,
      ),
      404,
      `${feature.code}_NOT_FOUND`,
    );
  });
  it(`${feature.item} rejects invalid queries, bodies, missing/archived parents, empty PATCH and conflicts`, async () => {
    const path = `/activity-kinds/${kindId}/${feature.list}`;
    await error(
      await request(`/activity-kinds/${randomUUID()}/${feature.list}`),
      404,
      'ACTIVITY_KIND_NOT_FOUND',
    );
    await error(
      await request(`/activity-kinds/bad/${feature.list}`),
      400,
      `${feature.code}_INVALID`,
    );
    for (const query of [
      '?includeArchived=maybe',
      '?includeArchived=true&includeArchived=false',
      '?unknown=true',
    ])
      await error(await request(path + query), 400, `${feature.code}_INVALID`);
    for (const body of [
      {},
      null,
      { ...feature.body, name: ' ' },
      { ...feature.body, unexpected: true },
    ])
      await error(
        await request(path, 'POST', body),
        400,
        `${feature.code}_INVALID`,
      );
    await error(
      await app.request(`/api/v1${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
      400,
      `${feature.code}_INVALID`,
    );
    const response = await request(path, 'POST', feature.body);
    const row = (await response.json()) as { id: string };
    await error(
      await request(`/${feature.item}/${row.id}`, 'PATCH', {}),
      400,
      `${feature.code}_INVALID`,
    );
    await error(
      await request(`/${feature.item}/${row.id}`, 'PATCH', {
        activityKindId: kindId,
      }),
      400,
      `${feature.code}_INVALID`,
    );
    await error(
      await request(path, 'POST', feature.body),
      409,
      `${feature.code}_NAME_CONFLICT`,
    );
    await error(
      await request(`/${feature.item}/${row.id}`, 'DELETE'),
      404,
      'NOT_FOUND',
    );
    await deps.activityKinds.setArchived(kindId, true);
    await error(
      await request(path, 'POST', { ...feature.body, name: 'Another' }),
      409,
      'ACTIVITY_KIND_ARCHIVED',
    );
  });
}
it('rejects ambiguous effective queries and invalid variant ownership', async () => {
  await error(
    await request(`/activity-kinds/${kindId}/measurements?effective=true`),
    400,
    'MEASUREMENT_DEFINITION_INVALID',
  );
  await error(
    await request(
      `/activity-kinds/${kindId}/measurements?activityVariantId=bad`,
    ),
    400,
    'MEASUREMENT_DEFINITION_INVALID',
  );
  await error(
    await request(`/activity-kinds/${kindId}/measurements`, 'POST', {
      ...validMeasurement,
      activityVariantId: randomUUID(),
    }),
    400,
    'MEASUREMENT_DEFINITION_VARIANT_MISMATCH',
  );
});
