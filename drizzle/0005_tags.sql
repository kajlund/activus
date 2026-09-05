CREATE TABLE "activity_tags" (
	"activity_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_tags_activity_id_tag_id_pk" PRIMARY KEY("activity_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_valid" CHECK (char_length("tags"."name") BETWEEN 1 AND 120 AND "tags"."name" = btrim("tags"."name", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
	CONSTRAINT "tags_color_valid" CHECK ("tags"."color" ~ '^#[0-9A-F]{6}$')
);
--> statement-breakpoint
ALTER TABLE "activity_tags" ADD CONSTRAINT "activity_tags_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_tags" ADD CONSTRAINT "activity_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_tags_tag_activity_idx" ON "activity_tags" USING btree ("tag_id","activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_unique" ON "tags" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "tags_order_idx" ON "tags" USING btree (lower("name") COLLATE "C","id");