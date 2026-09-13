import {
  activityKindIconNames,
  measurementValueTypes,
  measurementAggregations,
  personalBestDirections,
  measurementUnits,
} from '@activus/contracts';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
  doublePrecision,
  date,
  bigint,
  numeric,
  primaryKey,
  foreignKey,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ECMAScript String.trim whitespace, explicitly encoded rather than locale-dependent.
const trimCharacters = sql.raw(
  String.raw`U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'`,
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    color: text('color'),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('tags_name_unique').on(sql`lower(${t.name})`),
    index('tags_order_idx').on(sql`lower(${t.name}) COLLATE "C"`, t.id),
    check(
      'tags_name_valid',
      sql`char_length(${t.name}) BETWEEN 1 AND 120 AND ${t.name} = btrim(${t.name}, ${trimCharacters})`,
    ),
    check('tags_color_valid', sql`${t.color} ~ '^#[0-9A-F]{6}$'`),
  ],
);

export const activityTags = pgTable(
  'activity_tags',
  {
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.activityId, t.tagId] }),
    index('activity_tags_tag_activity_idx').on(t.tagId, t.activityId),
  ],
);

export const activityKinds = pgTable(
  'activity_kinds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    iconName: text('icon_name').notNull(),
    color: text('color').notNull(),
    sortOrder: integer('sort_order').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    primaryMeasurementDefinitionId: uuid(
      'primary_measurement_definition_id',
    ).references((): AnyPgColumn => measurementDefinitions.id, {
      onDelete: 'restrict',
    }),
  },
  (t) => [
    index('activity_kinds_primary_measurement_idx').on(
      t.primaryMeasurementDefinitionId,
    ),
    uniqueIndex('activity_kinds_name_unique').on(sql`lower(${t.name})`),
    index('activity_kinds_order_idx').on(
      t.sortOrder,
      sql`${t.name} COLLATE "C"`,
      t.id,
    ),
    index('activity_kinds_active_order_idx')
      .on(t.sortOrder, sql`${t.name} COLLATE "C"`, t.id)
      .where(sql`${t.archivedAt} IS NULL`),
    check(
      'activity_kinds_name_valid',
      sql`char_length(${t.name}) BETWEEN 1 AND 120 AND ${t.name} = btrim(${t.name}, ${trimCharacters})`,
    ),
    check('activity_kinds_color_valid', sql`${t.color} ~ '^#[0-9A-F]{6}$'`),
    check('activity_kinds_sort_order_valid', sql`${t.sortOrder} >= 0`),
    check(
      'activity_kinds_icon_name_valid',
      sql`${t.iconName} IN (${sql.join(
        activityKindIconNames.map((icon) => sql.raw(`'${icon}'`)),
        sql`, `,
      )})`,
    ),
  ],
);

const literals = (values: readonly string[]) =>
  sql.join(
    values.map((value) => sql.raw(`'${value}'`)),
    sql`, `,
  );

// One source kind can resolve a parent, variant and multiple measurement definitions.
export const legacyReferenceMappings = pgTable(
  'legacy_reference_mappings',
  {
    source: text('source').notNull(),
    collection: text('collection').notNull(),
    sourceId: text('source_id').notNull(),
    role: text('role').notNull(),
    kindId: uuid('kind_id').references(() => activityKinds.id, {
      onDelete: 'restrict',
    }),
    variantId: uuid('variant_id').references(() => activityVariants.id, {
      onDelete: 'restrict',
    }),
    definitionId: uuid('definition_id').references(
      () => measurementDefinitions.id,
      { onDelete: 'restrict' },
    ),
    fingerprint: text('fingerprint').notNull(),
    disposition: text('disposition').notNull(),
    formatVersion: integer('format_version').notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.collection, t.sourceId, t.role] }),
    check(
      'legacy_reference_destination_valid',
      sql`num_nonnulls(${t.kindId}, ${t.variantId}, ${t.definitionId}) = 1`,
    ),
    check(
      'legacy_reference_disposition_valid',
      sql`${t.disposition} IN ('created', 'reused')`,
    ),
  ],
);

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    activityKindId: uuid('activity_kind_id')
      .notNull()
      .references(() => activityKinds.id, { onDelete: 'restrict' }),
    activityVariantId: uuid('activity_variant_id'),
    activityDate: date('activity_date', { mode: 'string' }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    durationSeconds: bigint('duration_seconds', { mode: 'number' }),
    name: text('name'),
    notes: text('notes'),
    effort: integer('effort'),
    feeling: integer('feeling'),
    isPartial: boolean('is_partial').default(false).notNull(),
    source: text('source'),
    sourceExternalId: text('source_external_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      name: 'activities_variant_kind_fk',
      columns: [t.activityVariantId, t.activityKindId],
      foreignColumns: [activityVariants.id, activityVariants.activityKindId],
    }).onDelete('restrict'),
    check(
      'activities_date_valid',
      sql`${t.activityDate} BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'`,
    ),
    check(
      'activities_duration_valid',
      sql`${t.durationSeconds} BETWEEN 0 AND 9007199254740991`,
    ),
    check('activities_effort_valid', sql`${t.effort} BETWEEN 1 AND 5`),
    check('activities_feeling_valid', sql`${t.feeling} BETWEEN 1 AND 5`),
    check(
      'activities_name_valid',
      sql`${t.name} IS NULL OR (char_length(${t.name}) BETWEEN 1 AND 200 AND ${t.name} = btrim(${t.name}, ${trimCharacters}))`,
    ),
    check(
      'activities_notes_valid',
      sql`${t.notes} IS NULL OR (char_length(${t.notes}) BETWEEN 1 AND 10000 AND ${t.notes} = btrim(${t.notes}, ${trimCharacters}))`,
    ),
    check(
      'activities_source_pair_valid',
      sql`(${t.source} IS NULL AND ${t.sourceExternalId} IS NULL) OR (${t.source} IS NOT NULL AND ${t.sourceExternalId} IS NOT NULL AND length(btrim(${t.source})) > 0 AND length(btrim(${t.sourceExternalId})) > 0)`,
    ),
    uniqueIndex('activities_source_unique')
      .on(t.source, t.sourceExternalId)
      .where(sql`${t.source} IS NOT NULL`),
    index('activities_journal_idx').on(
      t.activityDate.desc(),
      sql`${t.startedAt} DESC NULLS LAST`,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('activities_kind_date_idx').on(
      t.activityKindId,
      t.activityDate.desc(),
    ),
    index('activities_variant_date_idx').on(
      t.activityVariantId,
      t.activityDate.desc(),
    ),
  ],
);

export const activityMeasurements = pgTable(
  'activity_measurements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    measurementDefinitionId: uuid('measurement_definition_id')
      .notNull()
      .references(() => measurementDefinitions.id, { onDelete: 'restrict' }),
    numericValue: numeric('numeric_value'),
    integerValue: bigint('integer_value', { mode: 'number' }),
    booleanValue: boolean('boolean_value'),
    textValue: text('text_value'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique('activity_measurements_activity_definition_unique').on(
      t.activityId,
      t.measurementDefinitionId,
    ),
    index('activity_measurements_definition_idx').on(t.measurementDefinitionId),
    check(
      'activity_measurements_one_value',
      sql`num_nonnulls(${t.numericValue}, ${t.integerValue}, ${t.booleanValue}, ${t.textValue}) = 1`,
    ),
    check(
      'activity_measurements_numeric_valid',
      sql`${t.numericValue} BETWEEN -9007199254740991 AND 9007199254740991 AND scale(${t.numericValue}) <= 6`,
    ),
    check(
      'activity_measurements_integer_valid',
      sql`${t.integerValue} BETWEEN -9007199254740991 AND 9007199254740991`,
    ),
    check(
      'activity_measurements_text_valid',
      sql`${t.textValue} IS NULL OR (char_length(${t.textValue}) BETWEEN 1 AND 500 AND ${t.textValue} = btrim(${t.textValue}, ${trimCharacters}))`,
    ),
  ],
);

export const activityVariants = pgTable(
  'activity_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    activityKindId: uuid('activity_kind_id')
      .notNull()
      .references(() => activityKinds.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique('activity_variants_id_kind_unique').on(t.id, t.activityKindId),
    uniqueIndex('activity_variants_name_unique').on(
      t.activityKindId,
      sql`lower(${t.name})`,
    ),
    uniqueIndex('activity_variants_default_unique')
      .on(t.activityKindId)
      .where(sql`${t.isDefault} AND ${t.archivedAt} IS NULL`),
    index('activity_variants_order_idx').on(
      t.activityKindId,
      t.sortOrder,
      sql`${t.name} COLLATE "C"`,
      t.id,
    ),
    check(
      'activity_variants_name_valid',
      sql`char_length(${t.name}) BETWEEN 1 AND 120 AND ${t.name} = btrim(${t.name}, ${trimCharacters})`,
    ),
    check('activity_variants_sort_order_valid', sql`${t.sortOrder} >= 0`),
    check(
      'activity_variants_default_active',
      sql`NOT ${t.isDefault} OR ${t.archivedAt} IS NULL`,
    ),
  ],
);

export const measurementDefinitions = pgTable(
  'measurement_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    activityKindId: uuid('activity_kind_id')
      .notNull()
      .references(() => activityKinds.id, { onDelete: 'restrict' }),
    activityVariantId: uuid('activity_variant_id'),
    name: text('name').notNull(),
    valueType: text('value_type').notNull(),
    canonicalUnit: text('canonical_unit'),
    displayUnit: text('display_unit'),
    precision: integer('precision'),
    isRequired: boolean('is_required').notNull(),
    minimumValue: doublePrecision('minimum_value'),
    maximumValue: doublePrecision('maximum_value'),
    aggregation: text('aggregation').notNull(),
    personalBestDirection: text('personal_best_direction').notNull(),
    sortOrder: integer('sort_order').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      name: 'measurement_definitions_variant_kind_fk',
      columns: [t.activityVariantId, t.activityKindId],
      foreignColumns: [activityVariants.id, activityVariants.activityKindId],
    }).onDelete('restrict'),
    uniqueIndex('measurement_definitions_parent_name_unique')
      .on(t.activityKindId, sql`lower(${t.name})`)
      .where(sql`${t.activityVariantId} IS NULL`),
    uniqueIndex('measurement_definitions_variant_name_unique')
      .on(t.activityVariantId, sql`lower(${t.name})`)
      .where(sql`${t.activityVariantId} IS NOT NULL`),
    index('measurement_definitions_order_idx').on(
      t.activityKindId,
      t.sortOrder,
      sql`${t.name} COLLATE "C"`,
      t.id,
    ),
    index('measurement_definitions_variant_idx').on(t.activityVariantId),
    check(
      'measurement_definitions_name_valid',
      sql`char_length(${t.name}) BETWEEN 1 AND 120 AND ${t.name} = btrim(${t.name}, ${trimCharacters})`,
    ),
    check('measurement_definitions_sort_order_valid', sql`${t.sortOrder} >= 0`),
    check(
      'measurement_definitions_value_type_valid',
      sql`${t.valueType} IN (${literals(measurementValueTypes)})`,
    ),
    check(
      'measurement_definitions_aggregation_valid',
      sql`${t.aggregation} IN (${literals(measurementAggregations)})`,
    ),
    check(
      'measurement_definitions_best_valid',
      sql`${t.personalBestDirection} IN (${literals(personalBestDirections)})`,
    ),
    check(
      'measurement_definitions_bounds_valid',
      sql`(${t.minimumValue} IS NULL OR ${t.minimumValue} BETWEEN -9007199254740991 AND 9007199254740991) AND (${t.maximumValue} IS NULL OR ${t.maximumValue} BETWEEN -9007199254740991 AND 9007199254740991) AND (${t.minimumValue} IS NULL OR ${t.maximumValue} IS NULL OR ${t.minimumValue} <= ${t.maximumValue})`,
    ),
    check(
      'measurement_definitions_combination_valid',
      sql`coalesce(CASE
    WHEN ${t.valueType} IN ('boolean', 'text') THEN ${t.canonicalUnit} IS NULL AND ${t.displayUnit} IS NULL AND ${t.precision} IS NULL AND ${t.minimumValue} IS NULL AND ${t.maximumValue} IS NULL AND ${t.aggregation} = 'none' AND ${t.personalBestDirection} = 'none'
    WHEN ${t.valueType} = 'rating' THEN ${t.canonicalUnit} IS NULL AND ${t.displayUnit} IS NULL AND ${t.precision} IS NULL AND ${t.minimumValue} = 1 AND ${t.maximumValue} IN (5, 10) AND ${t.aggregation} <> 'total'
    WHEN ${t.valueType} = 'duration' THEN ${t.canonicalUnit} = 'second' AND ${t.displayUnit} IN ('second', 'minute', 'hour-minute') AND ${t.precision} IS NULL AND (${t.minimumValue} IS NULL OR (${t.minimumValue} >= 0 AND trunc(${t.minimumValue}) = ${t.minimumValue})) AND (${t.maximumValue} IS NULL OR (${t.maximumValue} >= 0 AND trunc(${t.maximumValue}) = ${t.maximumValue}))
    ELSE ((${t.canonicalUnit} IS NULL AND ${t.displayUnit} IS NULL) OR (${sql.join(
      measurementUnits
        .filter((unit) => unit.dimension !== 'duration')
        .map(
          (unit) =>
            sql`(${t.canonicalUnit} = ${sql.raw(`'${unit.canonicalUnit}'`)} AND ${t.displayUnit} = ${sql.raw(`'${unit.id}'`)})`,
        ),
      sql` OR `,
    )})) AND CASE WHEN ${t.valueType} = 'decimal' THEN ${t.precision} BETWEEN 0 AND 6 ELSE (${t.precision} IS NULL OR ${t.precision} = 0) AND (${t.minimumValue} IS NULL OR trunc(${t.minimumValue}) = ${t.minimumValue}) AND (${t.maximumValue} IS NULL OR trunc(${t.maximumValue}) = ${t.maximumValue}) END
    END, false)`,
    ),
  ],
);

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    targetType: text('target_type').notNull(),
    targetValue: numeric('target_value').notNull(),
    measurementDefinitionId: uuid('measurement_definition_id').references(
      () => measurementDefinitions.id,
      { onDelete: 'restrict' },
    ),
    activityKindId: uuid('activity_kind_id')
      .notNull()
      .references(() => activityKinds.id, { onDelete: 'restrict' }),
    activityVariantId: uuid('activity_variant_id'),
    scheduleMode: text('schedule_mode').notNull(),
    recurrencePeriod: text('recurrence_period'),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      name: 'goals_variant_kind_fk',
      columns: [t.activityVariantId, t.activityKindId],
      foreignColumns: [activityVariants.id, activityVariants.activityKindId],
    }).onDelete('restrict'),
    check(
      'goals_name_valid',
      sql`char_length(${t.name}) BETWEEN 1 AND 120 AND ${t.name} = btrim(${t.name}, ${trimCharacters})`,
    ),
    check(
      'goals_description_valid',
      sql`${t.description} IS NULL OR (char_length(${t.description}) BETWEEN 1 AND 10000 AND ${t.description} = btrim(${t.description}, ${trimCharacters}))`,
    ),
    check(
      'goals_target_valid',
      sql`${t.targetType} IN ('activity_count','total_duration','measurement_total') AND ${t.targetValue} > 0 AND scale(${t.targetValue}) <= 6 AND ((${t.targetType} IN ('activity_count','total_duration')) = (${t.measurementDefinitionId} IS NULL))`,
    ),
    check(
      'goals_schedule_valid',
      sql`${t.endDate} >= ${t.startDate} AND ((${t.scheduleMode} = 'fixed' AND ${t.recurrencePeriod} IS NULL) OR (${t.scheduleMode} = 'recurring' AND ${t.recurrencePeriod} IN ('week','month','year')))`,
    ),
    index('goals_active_dates_idx')
      .on(t.startDate, t.endDate)
      .where(sql`${t.archivedAt} IS NULL`),
    index('goals_kind_idx').on(t.activityKindId),
    index('goals_variant_idx').on(t.activityVariantId),
    index('goals_measurement_idx').on(t.measurementDefinitionId),
  ],
);
export const goalTags = pgTable(
  'goal_tags',
  {
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.goalId, t.tagId] }),
    index('goal_tags_tag_goal_idx').on(t.tagId, t.goalId),
  ],
);
