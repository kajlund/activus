CREATE TABLE "goal_tags" (
	"goal_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "goal_tags_goal_id_tag_id_pk" PRIMARY KEY("goal_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_type" text NOT NULL,
	"target_value" numeric NOT NULL,
	"measurement_definition_id" uuid,
	"activity_kind_id" uuid NOT NULL,
	"activity_variant_id" uuid,
	"schedule_mode" text NOT NULL,
	"recurrence_period" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_name_valid" CHECK (char_length("goals"."name") BETWEEN 1 AND 120 AND "goals"."name" = btrim("goals"."name", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
	CONSTRAINT "goals_description_valid" CHECK ("goals"."description" IS NULL OR (char_length("goals"."description") BETWEEN 1 AND 10000 AND "goals"."description" = btrim("goals"."description", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))),
	CONSTRAINT "goals_target_valid" CHECK ("goals"."target_type" IN ('activity_count','total_duration','measurement_total') AND "goals"."target_value" > 0 AND scale("goals"."target_value") <= 6 AND (("goals"."target_type" IN ('activity_count','total_duration')) = ("goals"."measurement_definition_id" IS NULL))),
	CONSTRAINT "goals_schedule_valid" CHECK ("goals"."end_date" >= "goals"."start_date" AND (("goals"."schedule_mode" = 'fixed' AND "goals"."recurrence_period" IS NULL) OR ("goals"."schedule_mode" = 'recurring' AND "goals"."recurrence_period" IN ('week','month','year'))))
);
--> statement-breakpoint
ALTER TABLE "goal_tags" ADD CONSTRAINT "goal_tags_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_tags" ADD CONSTRAINT "goal_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_measurement_definition_id_measurement_definitions_id_fk" FOREIGN KEY ("measurement_definition_id") REFERENCES "public"."measurement_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_activity_kind_id_activity_kinds_id_fk" FOREIGN KEY ("activity_kind_id") REFERENCES "public"."activity_kinds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_variant_kind_fk" FOREIGN KEY ("activity_variant_id","activity_kind_id") REFERENCES "public"."activity_variants"("id","activity_kind_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_tags_tag_goal_idx" ON "goal_tags" USING btree ("tag_id","goal_id");--> statement-breakpoint
CREATE INDEX "goals_active_dates_idx" ON "goals" USING btree ("start_date","end_date") WHERE "goals"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "goals_kind_idx" ON "goals" USING btree ("activity_kind_id");--> statement-breakpoint
CREATE INDEX "goals_variant_idx" ON "goals" USING btree ("activity_variant_id");--> statement-breakpoint
CREATE INDEX "goals_measurement_idx" ON "goals" USING btree ("measurement_definition_id");