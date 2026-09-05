CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_kind_id" uuid NOT NULL,
	"activity_variant_id" uuid,
	"activity_date" date NOT NULL,
	"started_at" timestamp with time zone,
	"duration_seconds" bigint,
	"name" text,
	"notes" text,
	"effort" integer,
	"feeling" integer,
	"is_partial" boolean DEFAULT false NOT NULL,
	"source" text,
	"source_external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_date_valid" CHECK ("activities"."activity_date" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
	CONSTRAINT "activities_duration_valid" CHECK ("activities"."duration_seconds" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "activities_effort_valid" CHECK ("activities"."effort" BETWEEN 1 AND 5),
	CONSTRAINT "activities_feeling_valid" CHECK ("activities"."feeling" BETWEEN 1 AND 5),
	CONSTRAINT "activities_name_valid" CHECK ("activities"."name" IS NULL OR (char_length("activities"."name") BETWEEN 1 AND 200 AND "activities"."name" = btrim("activities"."name", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))),
	CONSTRAINT "activities_notes_valid" CHECK ("activities"."notes" IS NULL OR (char_length("activities"."notes") BETWEEN 1 AND 10000 AND "activities"."notes" = btrim("activities"."notes", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))),
	CONSTRAINT "activities_source_pair_valid" CHECK (("activities"."source" IS NULL AND "activities"."source_external_id" IS NULL) OR ("activities"."source" IS NOT NULL AND "activities"."source_external_id" IS NOT NULL AND length(btrim("activities"."source")) > 0 AND length(btrim("activities"."source_external_id")) > 0))
);
--> statement-breakpoint
CREATE TABLE "activity_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"measurement_definition_id" uuid NOT NULL,
	"numeric_value" numeric,
	"integer_value" bigint,
	"boolean_value" boolean,
	"text_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_measurements_activity_definition_unique" UNIQUE("activity_id","measurement_definition_id"),
	CONSTRAINT "activity_measurements_one_value" CHECK (num_nonnulls("activity_measurements"."numeric_value", "activity_measurements"."integer_value", "activity_measurements"."boolean_value", "activity_measurements"."text_value") = 1),
	CONSTRAINT "activity_measurements_numeric_valid" CHECK ("activity_measurements"."numeric_value" BETWEEN -9007199254740991 AND 9007199254740991 AND scale("activity_measurements"."numeric_value") <= 6),
	CONSTRAINT "activity_measurements_integer_valid" CHECK ("activity_measurements"."integer_value" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "activity_measurements_text_valid" CHECK ("activity_measurements"."text_value" IS NULL OR (char_length("activity_measurements"."text_value") BETWEEN 1 AND 500 AND "activity_measurements"."text_value" = btrim("activity_measurements"."text_value", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')))
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_activity_kind_id_activity_kinds_id_fk" FOREIGN KEY ("activity_kind_id") REFERENCES "public"."activity_kinds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_variant_kind_fk" FOREIGN KEY ("activity_variant_id","activity_kind_id") REFERENCES "public"."activity_variants"("id","activity_kind_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_measurements" ADD CONSTRAINT "activity_measurements_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_measurements" ADD CONSTRAINT "activity_measurements_measurement_definition_id_measurement_definitions_id_fk" FOREIGN KEY ("measurement_definition_id") REFERENCES "public"."measurement_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activities_source_unique" ON "activities" USING btree ("source","source_external_id") WHERE "activities"."source" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "activities_journal_idx" ON "activities" USING btree ("activity_date" DESC NULLS LAST,"started_at" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activities_kind_date_idx" ON "activities" USING btree ("activity_kind_id","activity_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activities_variant_date_idx" ON "activities" USING btree ("activity_variant_id","activity_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_measurements_definition_idx" ON "activity_measurements" USING btree ("measurement_definition_id");