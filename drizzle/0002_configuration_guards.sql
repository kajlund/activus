-- Cross-table rules cannot be represented by PostgreSQL CHECK constraints.
-- Child writes touch their kind row to serialize configuration changes, including
-- direct SQL. The no-op update also forces serialization failures rather than
-- stale cross-table checks under REPEATABLE READ / SERIALIZABLE.
CREATE FUNCTION public.guard_activity_variant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind_archived timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.activity_kind_id IS DISTINCT FROM OLD.activity_kind_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'configuration_variant_ownership', MESSAGE = 'Variant ownership is immutable';
  END IF;
  UPDATE public.activity_kinds k SET updated_at = k.updated_at WHERE k.id = NEW.activity_kind_id RETURNING k.archived_at INTO kind_archived;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'configuration_kind_missing', MESSAGE = 'Activity kind not found';
  END IF;
  IF NEW.archived_at IS NOT NULL THEN NEW.is_default := false; END IF;
  IF kind_archived IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.is_default OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'configuration_kind_archived', MESSAGE = 'Activity kind is archived';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER activity_variant_guard BEFORE INSERT OR UPDATE ON public.activity_variants FOR EACH ROW EXECUTE FUNCTION public.guard_activity_variant();
--> statement-breakpoint
CREATE FUNCTION public.guard_measurement_definition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind_archived timestamptz; primary_id uuid; variant_archived timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.activity_kind_id IS DISTINCT FROM OLD.activity_kind_id OR NEW.activity_variant_id IS DISTINCT FROM OLD.activity_variant_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'configuration_measurement_ownership', MESSAGE = 'Measurement ownership is immutable';
  END IF;
  UPDATE public.activity_kinds k SET updated_at = k.updated_at WHERE k.id = NEW.activity_kind_id RETURNING k.archived_at, k.primary_measurement_definition_id INTO kind_archived, primary_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'configuration_kind_missing', MESSAGE = 'Activity kind not found';
  END IF;
  IF NEW.activity_variant_id IS NOT NULL THEN
    SELECT v.archived_at INTO variant_archived FROM public.activity_variants v WHERE v.id = NEW.activity_variant_id AND v.activity_kind_id = NEW.activity_kind_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'configuration_variant_mismatch', MESSAGE = 'Variant does not belong to kind';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL) THEN
    IF kind_archived IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'configuration_kind_archived', MESSAGE = 'Activity kind is archived';
    END IF;
    IF variant_archived IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'configuration_variant_archived', MESSAGE = 'Activity variant is archived';
    END IF;
  END IF;
  IF primary_id = NEW.id AND (NEW.archived_at IS NOT NULL OR NEW.value_type IN ('text', 'boolean') OR NEW.activity_variant_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'configuration_measurement_is_primary', MESSAGE = 'Clear or replace the primary measurement first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.measurement_definitions m WHERE m.activity_kind_id = NEW.activity_kind_id AND m.id <> NEW.id AND lower(m.name) = lower(NEW.name)
    AND ((NEW.activity_variant_id IS NULL AND m.activity_variant_id IS NOT NULL) OR (NEW.activity_variant_id IS NOT NULL AND m.activity_variant_id IS NULL))) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', CONSTRAINT = 'configuration_inherited_name_conflict', MESSAGE = 'Inherited measurement name conflict';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER measurement_definition_guard BEFORE INSERT OR UPDATE ON public.measurement_definitions FOR EACH ROW EXECUTE FUNCTION public.guard_measurement_definition();
--> statement-breakpoint
CREATE FUNCTION public.guard_kind_primary_measurement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected public.measurement_definitions%ROWTYPE;
BEGIN
  IF NEW.primary_measurement_definition_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.primary_measurement_definition_id IS DISTINCT FROM OLD.primary_measurement_definition_id) THEN
    SELECT * INTO selected FROM public.measurement_definitions m WHERE m.id = NEW.primary_measurement_definition_id;
    IF NOT FOUND OR selected.activity_kind_id <> NEW.id OR selected.activity_variant_id IS NOT NULL OR selected.archived_at IS NOT NULL OR selected.value_type IN ('text', 'boolean') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'configuration_primary_invalid', MESSAGE = 'Invalid primary measurement';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER kind_primary_measurement_guard BEFORE INSERT OR UPDATE ON public.activity_kinds FOR EACH ROW EXECUTE FUNCTION public.guard_kind_primary_measurement();
--> statement-breakpoint
CREATE FUNCTION public.clear_archived_kind_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    UPDATE public.activity_variants SET is_default = false, updated_at = clock_timestamp() WHERE activity_kind_id = NEW.id AND is_default;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER kind_archive_defaults AFTER UPDATE ON public.activity_kinds FOR EACH ROW EXECUTE FUNCTION public.clear_archived_kind_defaults();
