import { z } from 'zod';
import { MeasurementUnitIdSchema } from './measurement-units.js';

export const measurementValueTypes = [
  'decimal',
  'integer',
  'duration',
  'rating',
  'boolean',
  'text',
] as const;
export const measurementAggregations = [
  'total',
  'average',
  'latest',
  'minimum',
  'none',
] as const;
export const personalBestDirections = ['highest', 'lowest', 'none'] as const;
export const MeasurementFieldsSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  valueType: z.enum(measurementValueTypes),
  canonicalUnit: MeasurementUnitIdSchema.nullable(),
  displayUnit: MeasurementUnitIdSchema.nullable(),
  precision: z.number().int().min(0).max(6).nullable(),
  isRequired: z.boolean(),
  minimumValue: z
    .number()
    .finite()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  maximumValue: z
    .number()
    .finite()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  aggregation: z.enum(measurementAggregations),
  personalBestDirection: z.enum(personalBestDirections),
  sortOrder: z.number().int().min(0).max(2147483647),
});
export type MeasurementFields = z.infer<typeof MeasurementFieldsSchema>;
export const CreateMeasurementDefinitionRequestSchema =
  MeasurementFieldsSchema.extend({
    activityVariantId: z.uuid().nullable().default(null),
  });
export type CreateMeasurementDefinitionRequest = z.infer<
  typeof CreateMeasurementDefinitionRequestSchema
>;
export const UpdateMeasurementDefinitionRequestSchema =
  MeasurementFieldsSchema.partial().refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    'At least one field is required',
  );
export type UpdateMeasurementDefinitionRequest = z.infer<
  typeof UpdateMeasurementDefinitionRequestSchema
>;
export const MeasurementDefinitionSchema = MeasurementFieldsSchema.extend({
  id: z.uuid(),
  activityKindId: z.uuid(),
  activityVariantId: z.uuid().nullable(),
  isArchived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MeasurementDefinition = z.infer<typeof MeasurementDefinitionSchema>;
export const EffectiveMeasurementDefinitionSchema =
  MeasurementDefinitionSchema.extend({
    source: z.enum(['inherited', 'variant-specific']),
  });
export type EffectiveMeasurementDefinition = z.infer<
  typeof EffectiveMeasurementDefinitionSchema
>;
export const MeasurementDefinitionListResponseSchema = z.discriminatedUnion(
  'view',
  [
    z.strictObject({
      view: z.literal('definitions'),
      items: z.array(MeasurementDefinitionSchema),
    }),
    z.strictObject({
      view: z.literal('effective'),
      items: z.array(EffectiveMeasurementDefinitionSchema),
    }),
  ],
);
export type MeasurementDefinitionListResponse = z.infer<
  typeof MeasurementDefinitionListResponseSchema
>;
