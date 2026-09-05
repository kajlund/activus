import { ApiError } from '../errors.js';

const constraints: Record<string, [400 | 404 | 409, string, string]> = {
  tags_name_unique: [
    409,
    'TAG_NAME_CONFLICT',
    'A tag already reserves this name',
  ],
  tags_name_valid: [400, 'TAG_INVALID', 'Invalid tag name'],
  tags_color_valid: [400, 'TAG_INVALID', 'Invalid tag color'],
  configuration_measurement_has_history: [
    409,
    'MEASUREMENT_DEFINITION_HAS_HISTORY',
    'Archive and replace a definition to change its recorded meaning',
  ],
  activity_variants_name_unique: [
    409,
    'ACTIVITY_VARIANT_NAME_CONFLICT',
    'A variant already reserves this name',
  ],
  activity_variants_default_unique: [
    409,
    'ACTIVITY_VARIANT_INVALID',
    'Only one active default is allowed',
  ],
  activity_variants_default_active: [
    409,
    'ACTIVITY_VARIANT_ARCHIVED',
    'An archived variant cannot be default',
  ],
  configuration_kind_archived: [
    409,
    'ACTIVITY_KIND_ARCHIVED',
    'Activity kind is archived',
  ],
  configuration_kind_missing: [
    404,
    'ACTIVITY_KIND_NOT_FOUND',
    'Activity kind not found',
  ],
  configuration_variant_archived: [
    409,
    'ACTIVITY_VARIANT_ARCHIVED',
    'Activity variant is archived',
  ],
  configuration_variant_mismatch: [
    400,
    'MEASUREMENT_DEFINITION_VARIANT_MISMATCH',
    'Variant does not belong to this kind',
  ],
  configuration_variant_ownership: [
    400,
    'ACTIVITY_VARIANT_KIND_MISMATCH',
    'Variant ownership cannot change',
  ],
  configuration_measurement_ownership: [
    400,
    'MEASUREMENT_DEFINITION_VARIANT_MISMATCH',
    'Measurement ownership cannot change',
  ],
  measurement_definitions_variant_kind_fk: [
    400,
    'MEASUREMENT_DEFINITION_VARIANT_MISMATCH',
    'Variant does not belong to this kind',
  ],
  measurement_definitions_parent_name_unique: [
    409,
    'MEASUREMENT_DEFINITION_NAME_CONFLICT',
    'A measurement already reserves this name',
  ],
  measurement_definitions_variant_name_unique: [
    409,
    'MEASUREMENT_DEFINITION_NAME_CONFLICT',
    'A measurement already reserves this name',
  ],
  configuration_inherited_name_conflict: [
    409,
    'MEASUREMENT_DEFINITION_NAME_CONFLICT',
    'Name conflicts with an inherited or variant measurement',
  ],
  configuration_primary_invalid: [
    400,
    'PRIMARY_MEASUREMENT_INVALID',
    'Primary measurement must be an active numeric parent definition of this kind',
  ],
  configuration_measurement_is_primary: [
    409,
    'MEASUREMENT_DEFINITION_IS_PRIMARY',
    'Clear or replace the primary measurement first',
  ],
  measurement_definitions_combination_valid: [
    400,
    'MEASUREMENT_DEFINITION_INVALID',
    'Invalid measurement combination',
  ],
};

export function translateConfigurationError(error: unknown): never {
  let current = error;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if ('constraint' in current && typeof current.constraint === 'string') {
      const match = constraints[current.constraint];
      if (match) throw new ApiError(...match);
    }
    if (
      'code' in current &&
      ['40P01', '40001'].includes(String(current.code))
    ) {
      throw new ApiError(
        409,
        'CONFIGURATION_WRITE_CONFLICT',
        'Configuration changed concurrently; retry the request',
      );
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  throw error;
}
