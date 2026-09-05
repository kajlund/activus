CREATE TABLE "activity_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_kind_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_variants_id_kind_unique" UNIQUE("id","activity_kind_id"),
	CONSTRAINT "activity_variants_name_valid" CHECK (char_length("activity_variants"."name") BETWEEN 1 AND 120 AND "activity_variants"."name" = btrim("activity_variants"."name", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
	CONSTRAINT "activity_variants_sort_order_valid" CHECK ("activity_variants"."sort_order" >= 0),
	CONSTRAINT "activity_variants_default_active" CHECK (NOT "activity_variants"."is_default" OR "activity_variants"."archived_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "measurement_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_kind_id" uuid NOT NULL,
	"activity_variant_id" uuid,
	"name" text NOT NULL,
	"value_type" text NOT NULL,
	"canonical_unit" text,
	"display_unit" text,
	"precision" integer,
	"is_required" boolean NOT NULL,
	"minimum_value" double precision,
	"maximum_value" double precision,
	"aggregation" text NOT NULL,
	"personal_best_direction" text NOT NULL,
	"sort_order" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measurement_definitions_name_valid" CHECK (char_length("measurement_definitions"."name") BETWEEN 1 AND 120 AND "measurement_definitions"."name" = btrim("measurement_definitions"."name", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
	CONSTRAINT "measurement_definitions_sort_order_valid" CHECK ("measurement_definitions"."sort_order" >= 0),
	CONSTRAINT "measurement_definitions_value_type_valid" CHECK ("measurement_definitions"."value_type" IN ('decimal', 'integer', 'duration', 'rating', 'boolean', 'text')),
	CONSTRAINT "measurement_definitions_aggregation_valid" CHECK ("measurement_definitions"."aggregation" IN ('total', 'average', 'latest', 'minimum', 'none')),
	CONSTRAINT "measurement_definitions_best_valid" CHECK ("measurement_definitions"."personal_best_direction" IN ('highest', 'lowest', 'none')),
	CONSTRAINT "measurement_definitions_bounds_valid" CHECK (("measurement_definitions"."minimum_value" IS NULL OR "measurement_definitions"."minimum_value" BETWEEN -9007199254740991 AND 9007199254740991) AND ("measurement_definitions"."maximum_value" IS NULL OR "measurement_definitions"."maximum_value" BETWEEN -9007199254740991 AND 9007199254740991) AND ("measurement_definitions"."minimum_value" IS NULL OR "measurement_definitions"."maximum_value" IS NULL OR "measurement_definitions"."minimum_value" <= "measurement_definitions"."maximum_value")),
	CONSTRAINT "measurement_definitions_combination_valid" CHECK (coalesce(CASE
    WHEN "measurement_definitions"."value_type" IN ('boolean', 'text') THEN "measurement_definitions"."canonical_unit" IS NULL AND "measurement_definitions"."display_unit" IS NULL AND "measurement_definitions"."precision" IS NULL AND "measurement_definitions"."minimum_value" IS NULL AND "measurement_definitions"."maximum_value" IS NULL AND "measurement_definitions"."aggregation" = 'none' AND "measurement_definitions"."personal_best_direction" = 'none'
    WHEN "measurement_definitions"."value_type" = 'rating' THEN "measurement_definitions"."canonical_unit" IS NULL AND "measurement_definitions"."display_unit" IS NULL AND "measurement_definitions"."precision" IS NULL AND "measurement_definitions"."minimum_value" = 1 AND "measurement_definitions"."maximum_value" IN (5, 10) AND "measurement_definitions"."aggregation" <> 'total'
    WHEN "measurement_definitions"."value_type" = 'duration' THEN "measurement_definitions"."canonical_unit" = 'second' AND "measurement_definitions"."display_unit" IN ('second', 'minute', 'hour-minute') AND "measurement_definitions"."precision" IS NULL AND ("measurement_definitions"."minimum_value" IS NULL OR ("measurement_definitions"."minimum_value" >= 0 AND trunc("measurement_definitions"."minimum_value") = "measurement_definitions"."minimum_value")) AND ("measurement_definitions"."maximum_value" IS NULL OR ("measurement_definitions"."maximum_value" >= 0 AND trunc("measurement_definitions"."maximum_value") = "measurement_definitions"."maximum_value"))
    ELSE (("measurement_definitions"."canonical_unit" IS NULL AND "measurement_definitions"."display_unit" IS NULL) OR (("measurement_definitions"."canonical_unit" = 'metre' AND "measurement_definitions"."display_unit" = 'metre') OR ("measurement_definitions"."canonical_unit" = 'metre' AND "measurement_definitions"."display_unit" = 'kilometre') OR ("measurement_definitions"."canonical_unit" = 'metre' AND "measurement_definitions"."display_unit" = 'mile') OR ("measurement_definitions"."canonical_unit" = 'metre' AND "measurement_definitions"."display_unit" = 'foot') OR ("measurement_definitions"."canonical_unit" = 'kilogram' AND "measurement_definitions"."display_unit" = 'kilogram') OR ("measurement_definitions"."canonical_unit" = 'kilogram' AND "measurement_definitions"."display_unit" = 'pound') OR ("measurement_definitions"."canonical_unit" = 'count' AND "measurement_definitions"."display_unit" = 'count'))) AND CASE WHEN "measurement_definitions"."value_type" = 'decimal' THEN "measurement_definitions"."precision" BETWEEN 0 AND 6 ELSE ("measurement_definitions"."precision" IS NULL OR "measurement_definitions"."precision" = 0) AND ("measurement_definitions"."minimum_value" IS NULL OR trunc("measurement_definitions"."minimum_value") = "measurement_definitions"."minimum_value") AND ("measurement_definitions"."maximum_value" IS NULL OR trunc("measurement_definitions"."maximum_value") = "measurement_definitions"."maximum_value") END
    END, false))
);
--> statement-breakpoint
ALTER TABLE "activity_kinds" ADD COLUMN "primary_measurement_definition_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_variants" ADD CONSTRAINT "activity_variants_activity_kind_id_activity_kinds_id_fk" FOREIGN KEY ("activity_kind_id") REFERENCES "public"."activity_kinds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_definitions" ADD CONSTRAINT "measurement_definitions_activity_kind_id_activity_kinds_id_fk" FOREIGN KEY ("activity_kind_id") REFERENCES "public"."activity_kinds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_definitions" ADD CONSTRAINT "measurement_definitions_variant_kind_fk" FOREIGN KEY ("activity_variant_id","activity_kind_id") REFERENCES "public"."activity_variants"("id","activity_kind_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_variants_name_unique" ON "activity_variants" USING btree ("activity_kind_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "activity_variants_default_unique" ON "activity_variants" USING btree ("activity_kind_id") WHERE "activity_variants"."is_default" AND "activity_variants"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "activity_variants_order_idx" ON "activity_variants" USING btree ("activity_kind_id","sort_order","name" COLLATE "C","id");--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_definitions_parent_name_unique" ON "measurement_definitions" USING btree ("activity_kind_id",lower("name")) WHERE "measurement_definitions"."activity_variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_definitions_variant_name_unique" ON "measurement_definitions" USING btree ("activity_variant_id",lower("name")) WHERE "measurement_definitions"."activity_variant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "measurement_definitions_order_idx" ON "measurement_definitions" USING btree ("activity_kind_id","sort_order","name" COLLATE "C","id");--> statement-breakpoint
CREATE INDEX "measurement_definitions_variant_idx" ON "measurement_definitions" USING btree ("activity_variant_id");--> statement-breakpoint
ALTER TABLE "activity_kinds" ADD CONSTRAINT "activity_kinds_primary_measurement_definition_id_measurement_definitions_id_fk" FOREIGN KEY ("primary_measurement_definition_id") REFERENCES "public"."measurement_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_kinds_primary_measurement_idx" ON "activity_kinds" USING btree ("primary_measurement_definition_id");