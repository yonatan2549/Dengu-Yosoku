-- DengueYosoku Alert Center Phase 5: governed Rule Profile Draft workflow.
-- Apply after migrations 001-004. This migration has no approval function.

BEGIN;

CREATE TABLE IF NOT EXISTS public.alert_rule_profile_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.alert_rule_profiles(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('draft_saved', 'submitted_for_review')),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 3 AND 500),
  previous_snapshot jsonb NOT NULL CHECK (jsonb_typeof(previous_snapshot) = 'object'),
  new_snapshot jsonb NOT NULL CHECK (jsonb_typeof(new_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_rule_profile_change_log_profile_created_idx
  ON public.alert_rule_profile_change_log (profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.alert_rule_profile_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.alert_rule_profiles(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status = 'pending'),
  submission_note text NOT NULL CHECK (length(btrim(submission_note)) BETWEEN 10 AND 500),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  profile_version text NOT NULL,
  threshold_count integer NOT NULL CHECK (threshold_count = 77),
  profile_snapshot jsonb NOT NULL CHECK (jsonb_typeof(profile_snapshot) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS alert_rule_profile_one_pending_review_idx
  ON public.alert_rule_profile_review_requests (profile_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS alert_rule_profile_review_requests_submitted_idx
  ON public.alert_rule_profile_review_requests (submitted_at DESC);

ALTER TABLE public.alert_rule_profile_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_rule_profile_review_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_rule_profile_change_log_read_reviewer_admin ON public.alert_rule_profile_change_log;
CREATE POLICY alert_rule_profile_change_log_read_reviewer_admin
  ON public.alert_rule_profile_change_log FOR SELECT TO authenticated
  USING (public.current_dengueyosoku_role() IN ('reviewer', 'administrator'));
DROP POLICY IF EXISTS alert_rule_profile_review_requests_read_reviewer_admin ON public.alert_rule_profile_review_requests;
CREATE POLICY alert_rule_profile_review_requests_read_reviewer_admin
  ON public.alert_rule_profile_review_requests FOR SELECT TO authenticated
  USING (public.current_dengueyosoku_role() IN ('reviewer', 'administrator'));

REVOKE ALL ON public.alert_rule_profile_change_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.alert_rule_profile_review_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.alert_rule_profile_change_log TO authenticated;
GRANT SELECT ON public.alert_rule_profile_review_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_alert_rule_draft_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Alert Rule Profile draft history is append-only';
END;
$$;
DROP TRIGGER IF EXISTS alert_rule_profile_change_log_no_row_mutation ON public.alert_rule_profile_change_log;
CREATE TRIGGER alert_rule_profile_change_log_no_row_mutation
  BEFORE UPDATE OR DELETE ON public.alert_rule_profile_change_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_alert_rule_draft_history_mutation();
DROP TRIGGER IF EXISTS alert_rule_profile_change_log_no_truncate ON public.alert_rule_profile_change_log;
CREATE TRIGGER alert_rule_profile_change_log_no_truncate
  BEFORE TRUNCATE ON public.alert_rule_profile_change_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_alert_rule_draft_history_mutation();
DROP TRIGGER IF EXISTS alert_rule_profile_review_requests_no_row_mutation ON public.alert_rule_profile_review_requests;
CREATE TRIGGER alert_rule_profile_review_requests_no_row_mutation
  BEFORE UPDATE OR DELETE ON public.alert_rule_profile_review_requests
  FOR EACH ROW EXECUTE FUNCTION public.prevent_alert_rule_draft_history_mutation();
DROP TRIGGER IF EXISTS alert_rule_profile_review_requests_no_truncate ON public.alert_rule_profile_review_requests;
CREATE TRIGGER alert_rule_profile_review_requests_no_truncate
  BEFORE TRUNCATE ON public.alert_rule_profile_review_requests
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_alert_rule_draft_history_mutation();

CREATE OR REPLACE FUNCTION public.dengueyosoku_save_alert_rule_draft(
  p_profile_id text, p_version text, p_methodology text, p_thresholds jsonb,
  p_change_note text, p_submit_for_review boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_profile public.alert_rule_profiles%ROWTYPE;
  v_profile_found boolean := false;
  v_item jsonb;
  v_province text;
  v_watch numeric;
  v_alert numeric;
  v_names text[] := ARRAY[]::text[];
  v_count integer := 0;
  v_before jsonb;
  v_after jsonb;
  v_review_id uuid;
  v_action text;
  v_methodology text := btrim(COALESCE(p_methodology, ''));
  v_note text := btrim(COALESCE(p_change_note, ''));
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501'; END IF;
  SELECT up.role INTO v_role FROM public.user_profiles AS up WHERE up.id = v_actor;
  IF v_role IS DISTINCT FROM 'administrator' THEN
    RAISE EXCEPTION 'Administrator role is required to edit Draft Rule Profiles' USING ERRCODE = '42501';
  END IF;
  IF p_profile_id IS DISTINCT FROM 'dengueyosoku-national-alerts' OR p_version IS DISTINCT FROM '0.1.0-draft' THEN
    RAISE EXCEPTION 'Unsupported Rule Profile identity or version' USING ERRCODE = '22023';
  END IF;
  IF length(v_methodology) < 20 OR length(v_methodology) > 4000 THEN
    RAISE EXCEPTION 'Methodology must contain between 20 and 4000 characters' USING ERRCODE = '22023';
  END IF;
  IF length(v_note) < 3 OR length(v_note) > 500 THEN
    RAISE EXCEPTION 'Change note must contain between 3 and 500 characters' USING ERRCODE = '22023';
  END IF;
  IF p_thresholds IS NULL OR jsonb_typeof(p_thresholds) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Threshold payload must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_thresholds) > 77 THEN RAISE EXCEPTION 'Threshold payload may contain at most 77 rows' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_profile FROM public.alert_rule_profiles AS rp
  WHERE rp.profile_id = p_profile_id AND rp.version = p_version FOR UPDATE;
  v_profile_found := FOUND;
  IF NOT v_profile_found THEN
    INSERT INTO public.alert_rule_profiles (
      profile_id, version, status, scope, metric, methodology, external_notifications_enabled, created_by
    ) VALUES (
      p_profile_id, p_version, 'draft', 'national_77_provinces', 'weekly_predicted_cases', v_methodology, false, v_actor
    ) RETURNING * INTO v_profile;
  END IF;
  IF v_profile.status <> 'draft' THEN RAISE EXCEPTION 'Only Draft Rule Profiles can be edited; approved profiles are immutable' USING ERRCODE = '22023'; END IF;
  IF v_profile.scope <> 'national_77_provinces' OR v_profile.metric <> 'weekly_predicted_cases' OR v_profile.external_notifications_enabled THEN
    RAISE EXCEPTION 'Rule Profile is outside the permitted Draft workflow' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'profile_id', v_profile.profile_id, 'version', v_profile.version, 'status', v_profile.status,
    'methodology', v_profile.methodology,
    'thresholds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'province_name', t.province_name, 'watch_threshold', t.watch_threshold, 'alert_threshold', t.alert_threshold
    ) ORDER BY t.province_name) FROM public.alert_rule_thresholds AS t WHERE t.profile_id = v_profile.id), '[]'::jsonb)
  ) INTO v_before;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_thresholds) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'Each threshold row must be an object' USING ERRCODE = '22023'; END IF;
    v_province := NULLIF(btrim(v_item->>'province_name'), '');
    IF v_province IS NULL OR length(v_province) > 100 THEN RAISE EXCEPTION 'Invalid province name in threshold row' USING ERRCODE = '22023'; END IF;
    IF v_province = ANY(v_names) THEN RAISE EXCEPTION 'Duplicate province in threshold payload: %', v_province USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(v_item->'watch_threshold') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'alert_threshold') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Threshold values must be JSON numbers for %', v_province USING ERRCODE = '22023';
    END IF;
    v_watch := (v_item->>'watch_threshold')::numeric;
    v_alert := (v_item->>'alert_threshold')::numeric;
    IF v_watch < 0 OR v_alert <= v_watch OR v_watch > 99999999999.999 OR v_alert > 99999999999.999
       OR scale(v_watch) > 3 OR scale(v_alert) > 3 THEN
      RAISE EXCEPTION 'Invalid Watch/Alert threshold values for %', v_province USING ERRCODE = '22023';
    END IF;
    v_names := array_append(v_names, v_province);
    v_count := v_count + 1;
  END LOOP;
  IF COALESCE(p_submit_for_review, false) AND v_count <> 77 THEN
    RAISE EXCEPTION 'Submission for expert review requires exactly 77 complete province thresholds' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.alert_rule_thresholds WHERE profile_id = v_profile.id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_thresholds) LOOP
    INSERT INTO public.alert_rule_thresholds (profile_id, province_name, watch_threshold, alert_threshold)
    VALUES (v_profile.id, btrim(v_item->>'province_name'), (v_item->>'watch_threshold')::numeric, (v_item->>'alert_threshold')::numeric);
  END LOOP;
  UPDATE public.alert_rule_profiles SET methodology = v_methodology WHERE id = v_profile.id;

  SELECT jsonb_build_object(
    'profile_id', v_profile.profile_id, 'version', v_profile.version, 'status', 'draft',
    'methodology', v_methodology,
    'thresholds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'province_name', t.province_name, 'watch_threshold', t.watch_threshold, 'alert_threshold', t.alert_threshold
    ) ORDER BY t.province_name) FROM public.alert_rule_thresholds AS t WHERE t.profile_id = v_profile.id), '[]'::jsonb)
  ) INTO v_after;

  IF COALESCE(p_submit_for_review, false) THEN
    IF EXISTS (SELECT 1 FROM public.alert_rule_profile_review_requests AS rr WHERE rr.profile_id = v_profile.id AND rr.status = 'pending') THEN
      RAISE EXCEPTION 'A pending expert review request already exists for this Draft Profile' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.alert_rule_profile_review_requests (
      profile_id, requested_by, submission_note, profile_version, threshold_count, profile_snapshot
    ) VALUES (v_profile.id, v_actor, v_note, v_profile.version, v_count, v_after)
    RETURNING id INTO v_review_id;
    v_action := 'submitted_for_review';
  ELSE
    v_action := 'draft_saved';
  END IF;

  INSERT INTO public.alert_rule_profile_change_log (profile_id, actor_id, action, note, previous_snapshot, new_snapshot)
  VALUES (v_profile.id, v_actor, v_action, v_note, v_before, v_after);

  RETURN jsonb_build_object(
    'ok', true, 'profile_id', v_profile.id, 'profile_status', 'draft', 'profile_version', v_profile.version,
    'threshold_count', v_count, 'expected_threshold_count', 77, 'review_request_id', v_review_id,
    'review_status', CASE WHEN v_review_id IS NULL THEN NULL ELSE 'pending' END,
    'external_notifications_enabled', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dengueyosoku_save_alert_rule_draft(text, text, text, jsonb, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dengueyosoku_save_alert_rule_draft(text, text, text, jsonb, text, boolean)
  TO authenticated;
COMMENT ON FUNCTION public.dengueyosoku_save_alert_rule_draft(text, text, text, jsonb, text, boolean) IS
  'Administrator-only Draft Rule Profile editor. Supports partial Draft saves and complete submission for expert review; cannot approve a profile or enable external notifications.';

COMMIT;
