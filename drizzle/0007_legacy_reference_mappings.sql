CREATE TABLE "legacy_reference_mappings" (
	"source" text NOT NULL,
	"collection" text NOT NULL,
	"source_id" text NOT NULL,
	"role" text NOT NULL,
	"kind_id" uuid,
	"variant_id" uuid,
	"definition_id" uuid,
	"fingerprint" text NOT NULL,
	"disposition" text NOT NULL,
	"format_version" integer NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_reference_mappings_source_collection_source_id_role_pk" PRIMARY KEY("source","collection","source_id","role"),
	CONSTRAINT "legacy_reference_destination_valid" CHECK (num_nonnulls("legacy_reference_mappings"."kind_id", "legacy_reference_mappings"."variant_id", "legacy_reference_mappings"."definition_id") = 1),
	CONSTRAINT "legacy_reference_disposition_valid" CHECK ("legacy_reference_mappings"."disposition" IN ('created', 'reused'))
);
--> statement-breakpoint
ALTER TABLE "legacy_reference_mappings" ADD CONSTRAINT "legacy_reference_mappings_kind_id_activity_kinds_id_fk" FOREIGN KEY ("kind_id") REFERENCES "public"."activity_kinds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_reference_mappings" ADD CONSTRAINT "legacy_reference_mappings_variant_id_activity_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."activity_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_reference_mappings" ADD CONSTRAINT "legacy_reference_mappings_definition_id_measurement_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."measurement_definitions"("id") ON DELETE restrict ON UPDATE no action;