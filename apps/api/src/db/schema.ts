import { activityKindIconNames } from '@activus/contracts';
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
} from 'drizzle-orm/pg-core';

// ECMAScript String.trim whitespace, explicitly encoded rather than locale-dependent.
const trimCharacters = sql.raw(
  String.raw`U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'`,
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
  },
  (t) => [
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
