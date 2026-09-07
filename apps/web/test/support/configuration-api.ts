import type {
  ActivityKind,
  ActivityVariant,
  CreateActivityKindRequest,
  CreateActivityVariantRequest,
  UpdateActivityKindRequest,
  UpdateActivityVariantRequest,
} from '@activus/contracts';
import {
  ClientError,
  type ConfigurationApi,
} from '../../src/services/configuration-api.js';
import {
  measurementUnits,
  type MeasurementDefinition,
  type MeasurementDefinitionListResponse,
  type CreateMeasurementDefinitionRequest,
  type UpdateMeasurementDefinitionRequest,
} from '@activus/contracts';
const instant = '2026-09-05T12:00:00.000Z';
export class MemoryConfigurationApi implements ConfigurationApi {
  measurements: MeasurementDefinition[] = [];
  history = new Set<string>();
  async units() {
    return { items: [...measurementUnits] };
  }
  async listMeasurements(
    kindId: string,
    archived: boolean,
    variantId?: string,
  ): Promise<MeasurementDefinitionListResponse> {
    const items = this.order(
      this.measurements.filter(
        (m) =>
          m.activityKindId === kindId &&
          (archived || !m.isArchived) &&
          (!variantId ||
            m.activityVariantId === null ||
            m.activityVariantId === variantId),
      ),
    );
    return variantId
      ? {
          view: 'effective',
          items: items.map((m) => ({
            ...m,
            source:
              m.activityVariantId === null ? 'inherited' : 'variant-specific',
          })),
        }
      : { view: 'definitions', items };
  }
  private assertMeasurementName(input: MeasurementDefinition) {
    if (
      this.measurements.some(
        (m) =>
          m.id !== input.id &&
          m.activityKindId === input.activityKindId &&
          (m.activityVariantId === input.activityVariantId ||
            m.activityVariantId === null ||
            input.activityVariantId === null) &&
          m.name.toLowerCase() === input.name.toLowerCase(),
      )
    )
      throw new ClientError('conflict', 'MEASUREMENT_DEFINITION_NAME_CONFLICT');
  }
  async createMeasurement(
    kindId: string,
    input: CreateMeasurementDefinitionRequest,
  ) {
    const value = {
      ...input,
      id: crypto.randomUUID(),
      activityKindId: kindId,
      isArchived: false,
      createdAt: instant,
      updatedAt: instant,
    };
    this.assertMeasurementName(value);
    this.measurements.push(value);
    return value;
  }
  async updateMeasurement(
    id: string,
    input: UpdateMeasurementDefinitionRequest,
  ) {
    const old = this.measurements.find((m) => m.id === id);
    if (!old)
      throw new ClientError('not-found', 'MEASUREMENT_DEFINITION_NOT_FOUND');
    const value = { ...old, ...input } as MeasurementDefinition;
    if (
      this.history.has(id) &&
      (
        [
          'valueType',
          'canonicalUnit',
          'precision',
          'minimumValue',
          'maximumValue',
        ] as const
      ).some((key) => old[key] !== value[key])
    )
      throw new ClientError('conflict', 'MEASUREMENT_DEFINITION_HAS_HISTORY');
    this.assertMeasurementName(value);
    this.measurements = this.measurements.map((m) => (m.id === id ? value : m));
    return value;
  }
  async archiveMeasurement(id: string) {
    if (this.kinds.some((k) => k.primaryMeasurementDefinitionId === id))
      throw new ClientError('conflict', 'MEASUREMENT_DEFINITION_IS_PRIMARY');
    const value = await this.updateMeasurement(id, {});
    const next = { ...value, isArchived: true };
    this.measurements = this.measurements.map((m) => (m.id === id ? next : m));
    return next;
  }
  async restoreMeasurement(id: string) {
    const value = await this.updateMeasurement(id, {});
    const next = { ...value, isArchived: false };
    this.measurements = this.measurements.map((m) => (m.id === id ? next : m));
    return next;
  }
  kinds: ActivityKind[] = [];
  variants: ActivityVariant[] = [];
  private order<T extends { sortOrder: number; name: string; id: string }>(
    rows: T[],
  ) {
    return rows.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id.localeCompare(b.id)),
    );
  }
  async listKinds(archived: boolean) {
    return {
      items: this.order(this.kinds.filter((k) => archived || !k.isArchived)),
    };
  }
  async getKind(id: string) {
    const k = this.kinds.find((k) => k.id === id);
    if (!k) throw new ClientError('not-found', 'ACTIVITY_KIND_NOT_FOUND');
    return k;
  }
  async createKind(input: CreateActivityKindRequest) {
    if (
      this.kinds.some((k) => k.name.toLowerCase() === input.name.toLowerCase())
    )
      throw new ClientError('conflict', 'ACTIVITY_KIND_NAME_CONFLICT');
    const k = {
      ...input,
      id: crypto.randomUUID(),
      isArchived: false,
      primaryMeasurementDefinitionId: null,
      createdAt: instant,
      updatedAt: instant,
    };
    this.kinds.push(k);
    return k;
  }
  async updateKind(id: string, input: UpdateActivityKindRequest) {
    const old = await this.getKind(id);
    if (
      input.name &&
      this.kinds.some(
        (k) =>
          k.id !== id && k.name.toLowerCase() === input.name!.toLowerCase(),
      )
    )
      throw new ClientError('conflict', 'ACTIVITY_KIND_NAME_CONFLICT');
    const k = { ...old, ...input } as ActivityKind;
    this.kinds = this.kinds.map((v) => (v.id === id ? k : v));
    return k;
  }
  async archiveKind(id: string) {
    const k = await this.getKind(id);
    const next = { ...k, isArchived: true };
    this.kinds = this.kinds.map((v) => (v.id === id ? next : v));
    this.variants = this.variants.map((v) =>
      v.activityKindId === id ? { ...v, isDefault: false } : v,
    );
    return next;
  }
  async restoreKind(id: string) {
    const k = await this.getKind(id);
    const next = { ...k, isArchived: false };
    this.kinds = this.kinds.map((v) => (v.id === id ? next : v));
    return next;
  }
  async listVariants(id: string, archived: boolean) {
    await this.getKind(id);
    return {
      items: this.order(
        this.variants.filter(
          (v) => v.activityKindId === id && (archived || !v.isArchived),
        ),
      ),
    };
  }
  async createVariant(id: string, input: CreateActivityVariantRequest) {
    if ((await this.getKind(id)).isArchived)
      throw new ClientError('conflict', 'ACTIVITY_KIND_ARCHIVED');
    if (
      this.variants.some(
        (v) =>
          v.activityKindId === id &&
          v.name.toLowerCase() === input.name.toLowerCase(),
      )
    )
      throw new ClientError('conflict', 'ACTIVITY_VARIANT_NAME_CONFLICT');
    if (input.isDefault)
      this.variants = this.variants.map((v) =>
        v.activityKindId === id ? { ...v, isDefault: false } : v,
      );
    const v = {
      ...input,
      id: crypto.randomUUID(),
      activityKindId: id,
      isArchived: false,
      createdAt: instant,
      updatedAt: instant,
    };
    this.variants.push(v);
    return v;
  }
  async updateVariant(id: string, input: UpdateActivityVariantRequest) {
    const old = this.variants.find((v) => v.id === id);
    if (!old) throw new ClientError('not-found', 'ACTIVITY_VARIANT_NOT_FOUND');
    if (
      input.isDefault &&
      ((await this.getKind(old.activityKindId)).isArchived || old.isArchived)
    )
      throw new ClientError('conflict', 'ACTIVITY_VARIANT_ARCHIVED');
    if (
      input.name &&
      this.variants.some(
        (v) =>
          v.id !== id &&
          v.activityKindId === old.activityKindId &&
          v.name.toLowerCase() === input.name!.toLowerCase(),
      )
    )
      throw new ClientError('conflict', 'ACTIVITY_VARIANT_NAME_CONFLICT');
    if (input.isDefault)
      this.variants = this.variants.map((v) =>
        v.activityKindId === old.activityKindId
          ? { ...v, isDefault: false }
          : v,
      );
    const next = { ...old, ...input } as ActivityVariant;
    this.variants = this.variants.map((v) => (v.id === id ? next : v));
    return next;
  }
  async archiveVariant(id: string) {
    const v = this.variants.find((v) => v.id === id);
    if (!v) throw new ClientError('not-found', 'ACTIVITY_VARIANT_NOT_FOUND');
    const next = { ...v, isArchived: true, isDefault: false };
    this.variants = this.variants.map((v) => (v.id === id ? next : v));
    return next;
  }
  async restoreVariant(id: string) {
    const v = this.variants.find((v) => v.id === id);
    if (!v) throw new ClientError('not-found', 'ACTIVITY_VARIANT_NOT_FOUND');
    if ((await this.getKind(v.activityKindId)).isArchived)
      throw new ClientError('conflict', 'ACTIVITY_KIND_ARCHIVED');
    const next = { ...v, isArchived: false, isDefault: false };
    this.variants = this.variants.map((v) => (v.id === id ? next : v));
    return next;
  }
}
export const kindInput: CreateActivityKindRequest = {
  name: 'Walking',
  iconName: 'footprints',
  color: '#67318F',
  sortOrder: 0,
};
