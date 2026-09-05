CREATE TABLE "activity_kinds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"icon_name" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_kinds_name_valid" CHECK (char_length("activity_kinds"."name") BETWEEN 1 AND 120 AND "activity_kinds"."name" = btrim("activity_kinds"."name", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
	CONSTRAINT "activity_kinds_color_valid" CHECK ("activity_kinds"."color" ~ '^#[0-9A-F]{6}$'),
	CONSTRAINT "activity_kinds_sort_order_valid" CHECK ("activity_kinds"."sort_order" >= 0),
	CONSTRAINT "activity_kinds_icon_name_valid" CHECK ("activity_kinds"."icon_name" IN ('activity', 'footprints', 'bike', 'waves', 'dumbbell', 'person-standing'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "activity_kinds_name_unique" ON "activity_kinds" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "activity_kinds_order_idx" ON "activity_kinds" USING btree ("sort_order","name" COLLATE "C","id");--> statement-breakpoint
CREATE INDEX "activity_kinds_active_order_idx" ON "activity_kinds" USING btree ("sort_order","name" COLLATE "C","id") WHERE "activity_kinds"."archived_at" IS NULL;