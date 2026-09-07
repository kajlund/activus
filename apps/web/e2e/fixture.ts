import {
  CreateMeasurementDefinitionRequestSchema,
  UpdateMeasurementDefinitionRequestSchema,
} from '@activus/contracts';
import { type Page } from '@playwright/test';
import { MemoryConfigurationApi } from '../test/support/configuration-api.js';
import { ClientError } from '../src/services/configuration-api.js';
import {
  CreateActivityKindRequestSchema,
  CreateActivityVariantRequestSchema,
  UpdateActivityKindRequestSchema,
  UpdateActivityVariantRequestSchema,
} from '@activus/contracts';
export async function fixture(page: Page) {
  const api = new MemoryConfigurationApi();
  // Isolated test-created API state. No request reaches the development database.
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname.replace('/api/v1', '').split('/').filter(Boolean);
    const id = path[1] ?? '';
    const operation = path[2];
    const requestId = crypto.randomUUID();
    try {
      let body: unknown;
      if (path[0] === 'activity-kinds') {
        if (!id)
          body =
            method === 'GET'
              ? await api.listKinds(
                  url.searchParams.get('includeArchived') === 'true',
                )
              : await api.createKind(
                  CreateActivityKindRequestSchema.parse(request.postDataJSON()),
                );
        else if (operation === 'measurements')
          body =
            method === 'GET'
              ? await api.listMeasurements(
                  id,
                  url.searchParams.get('includeArchived') === 'true',
                  url.searchParams.get('activityVariantId') ?? undefined,
                )
              : await api.createMeasurement(
                  id,
                  CreateMeasurementDefinitionRequestSchema.parse(
                    request.postDataJSON(),
                  ),
                );
        else if (operation === 'variants')
          body =
            method === 'GET'
              ? await api.listVariants(
                  id,
                  url.searchParams.get('includeArchived') === 'true',
                )
              : await api.createVariant(
                  id,
                  CreateActivityVariantRequestSchema.parse(
                    request.postDataJSON(),
                  ),
                );
        else if (operation === 'archive') body = await api.archiveKind(id);
        else if (operation === 'restore') body = await api.restoreKind(id);
        else
          body =
            method === 'GET'
              ? await api.getKind(id)
              : await api.updateKind(
                  id,
                  UpdateActivityKindRequestSchema.parse(request.postDataJSON()),
                );
      } else if (path[0] === 'activity-variants')
        body =
          operation === 'archive'
            ? await api.archiveVariant(id)
            : operation === 'restore'
              ? await api.restoreVariant(id)
              : await api.updateVariant(
                  id,
                  UpdateActivityVariantRequestSchema.parse(
                    request.postDataJSON(),
                  ),
                );
      else if (path[0] === 'measurement-units') body = await api.units();
      else if (path[0] === 'measurement-definitions')
        body =
          operation === 'archive'
            ? await api.archiveMeasurement(id)
            : operation === 'restore'
              ? await api.restoreMeasurement(id)
              : await api.updateMeasurement(
                  id,
                  UpdateMeasurementDefinitionRequestSchema.parse(
                    request.postDataJSON(),
                  ),
                );
      else throw new ClientError('not-found', 'NOT_FOUND');
      await route.fulfill({
        status:
          method === 'POST' && (!id || operation === 'variants') ? 201 : 200,
        json: body,
        headers: { 'X-Request-Id': requestId },
      });
    } catch (error) {
      await route.fulfill({
        status:
          error instanceof ClientError && error.kind === 'not-found'
            ? 404
            : error instanceof ClientError && error.kind === 'conflict'
              ? 409
              : 400,
        json: {
          error: {
            code:
              error instanceof ClientError
                ? error.code
                : 'ACTIVITY_KIND_INVALID',
            message: 'Test request rejected',
            requestId,
          },
        },
        headers: { 'X-Request-Id': requestId },
      });
    }
  });
  return api;
}
