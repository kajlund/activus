-- Runs after measurement_definition_guard, which already serializes on the kind.
-- Values are validated by ActivityService; this guard prevents later reinterpretation.
CREATE FUNCTION public.guard_measurement_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.value_type, NEW.canonical_unit, NEW.precision, NEW.minimum_value, NEW.maximum_value)
       IS DISTINCT FROM (OLD.value_type, OLD.canonical_unit, OLD.precision, OLD.minimum_value, OLD.maximum_value)
     AND EXISTS (SELECT 1 FROM public.activity_measurements v WHERE v.measurement_definition_id = OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'configuration_measurement_has_history', MESSAGE = 'Archive and replace a definition to change its recorded meaning';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER measurement_history_guard BEFORE UPDATE ON public.measurement_definitions FOR EACH ROW EXECUTE FUNCTION public.guard_measurement_history();
