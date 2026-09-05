import { z } from 'zod';

export const HealthResponseSchema = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export * from './activity-kinds.js';
export * from './errors.js';
export * from './activity-variants.js';
export * from './measurement-definitions.js';
export * from './measurement-units.js';
export * from './activities.js';
