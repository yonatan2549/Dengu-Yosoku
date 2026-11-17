-- DengueYosoku Alert Center: database integrity hardening
-- Apply after 001_alert_center.sql.
-- Approved rule profiles/thresholds are immutable; transition history is append-only.

BEGIN;

CREATE OR REPLACE FUNCTION prevent_approved_alert_profile_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'Approved alert rule profiles are immutable';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS alert_rule_profiles_immutable_after_approval
  ON alert_rule_profiles;
CREATE TRIGGER alert_rule_profiles_immutable_after_approval
  BEFORE UPDATE OR DELETE ON alert_rule_profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_approved_alert_profile_mutation();

CREATE OR REPLACE FUNCTION prevent_approved_alert_threshold_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_profile_id uuid;
  target_profile_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'Moving a threshold between rule profiles is not allowed';
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_profile_id := OLD.profile_id;
  ELSE
    target_profile_id := NEW.profile_id;
  END IF;

  -- Serialize threshold edits with profile approval so an approved profile
  -- cannot acquire a concurrent threshold change.
  SELECT status
    INTO target_profile_status
    FROM alert_rule_profiles
    WHERE id = target_profile_id
    FOR UPDATE;

  -- A missing parent can occur during an ON DELETE CASCADE of a draft profile.
  IF target_profile_status = 'approved' THEN
    RAISE EXCEPTION 'Thresholds for an approved alert rule profile are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alert_rule_thresholds_immutable_after_approval
  ON alert_rule_thresholds;
CREATE TRIGGER alert_rule_thresholds_immutable_after_approval
  BEFORE INSERT OR UPDATE OR DELETE ON alert_rule_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION prevent_approved_alert_threshold_mutation();

CREATE OR REPLACE FUNCTION prevent_alert_transition_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Alert event transition history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS alert_event_transitions_no_row_mutation
  ON alert_event_transitions;
CREATE TRIGGER alert_event_transitions_no_row_mutation
  BEFORE UPDATE OR DELETE ON alert_event_transitions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_alert_transition_history_mutation();

DROP TRIGGER IF EXISTS alert_event_transitions_no_truncate
  ON alert_event_transitions;
CREATE TRIGGER alert_event_transitions_no_truncate
  BEFORE TRUNCATE ON alert_event_transitions
  FOR EACH STATEMENT
  EXECUTE FUNCTION prevent_alert_transition_history_mutation();

COMMIT;
