-- DengueYosoku Alert Center Phase 7: security-definer and RLS hardening.
-- Apply after migrations 001-006 once the remote migration history is reconciled.
-- Does not alter Rule Profile data, thresholds, alert events, or notifications.

BEGIN;

-- Pin every trigger function with a fixed search_path. All object references in
-- these functions are schema-qualified except the threshold guard, which is
-- replaced below to qualify alert_rule_profiles explicitly.
ALTER FUNCTION public.prevent_approved_alert_profile_mutation()
  SET search_path = '';
ALTER FUNCTION public.prevent_alert_transition_history_mutation()
  SET search_path = '';
ALTER FUNCTION public.prevent_alert_rule_draft_history_mutation()
  SET search_path = '';
ALTER FUNCTION public.prevent_alert_rule_review_decision_mutation()
  SET search_path = '';

CREATE OR REPLACE FUNCTION public.prevent_approved_alert_threshold_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
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
    FROM public.alert_rule_profiles
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
$function$;

-- These functions are privileged implementation details, not API endpoints.
-- The user-creation trigger continues to work for Supabase Auth and service code.
ALTER FUNCTION public.create_dengueyosoku_user_profile()
  SET search_path = '';
REVOKE ALL ON FUNCTION public.create_dengueyosoku_user_profile()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_dengueyosoku_user_profile()
  TO supabase_auth_admin, service_role;

-- RLS policies need this function for authenticated role checks, but anonymous
-- callers do not. Its table reference and auth.uid() call are fully qualified.
ALTER FUNCTION public.current_dengueyosoku_role()
  SET search_path = '';
REVOKE ALL ON FUNCTION public.current_dengueyosoku_role()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_dengueyosoku_role()
  TO authenticated;

-- Wrap stable identity/role lookups in scalar subqueries so Postgres can use
-- init plans rather than invoking the function for every row.
DO $migration$
DECLARE
  table_name text;
  policy_name text := 'alert_read_reviewer_admin';
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'alert_rule_profiles',
    'alert_rule_thresholds',
    'alert_evaluation_runs',
    'alert_events',
    'alert_event_transitions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.current_dengueyosoku_role()) IN (''reviewer'', ''administrator''))',
      policy_name, table_name
    );
  END LOOP;
END;
$migration$;

DROP POLICY IF EXISTS alert_rule_profile_change_log_read_reviewer_admin
  ON public.alert_rule_profile_change_log;
CREATE POLICY alert_rule_profile_change_log_read_reviewer_admin
  ON public.alert_rule_profile_change_log
  FOR SELECT TO authenticated
  USING ((SELECT public.current_dengueyosoku_role()) IN ('reviewer', 'administrator'));

DROP POLICY IF EXISTS alert_rule_profile_review_requests_read_reviewer_admin
  ON public.alert_rule_profile_review_requests;
CREATE POLICY alert_rule_profile_review_requests_read_reviewer_admin
  ON public.alert_rule_profile_review_requests
  FOR SELECT TO authenticated
  USING ((SELECT public.current_dengueyosoku_role()) IN ('reviewer', 'administrator'));

DROP POLICY IF EXISTS alert_rule_profile_review_decisions_read_reviewer_admin
  ON public.alert_rule_profile_review_decisions;
CREATE POLICY alert_rule_profile_review_decisions_read_reviewer_admin
  ON public.alert_rule_profile_review_decisions
  FOR SELECT TO authenticated
  USING ((SELECT public.current_dengueyosoku_role()) IN ('reviewer', 'administrator'));

DROP POLICY IF EXISTS user_profiles_read_self_or_admin
  ON public.user_profiles;
CREATE POLICY user_profiles_read_self_or_admin
  ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (SELECT public.current_dengueyosoku_role()) = 'administrator'
  );

COMMIT;
