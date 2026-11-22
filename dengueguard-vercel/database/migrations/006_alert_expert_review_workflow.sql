-- DengueYosoku Alert Center Phase 6: independent expert review and governed approval.
-- Apply after migrations 001-005.
-- Review requests remain immutable. Decisions are append-only and recorded separately.
-- Only a distinct user with the dedicated reviewer role may decide a request.
-- Approval activates the already-submitted 77-province threshold snapshot; no values are invented here.

BEGIN;

-- A previous decision closes a request logically. Drop the old index that treated
-- every immutable request row as permanently pending; the RPC below enforces one
-- undecided request per profile while holding the profile row lock.
DROP INDEX IF EXISTS public.alert_rule_profile_one_pending_review_idx;

CREATE TABLE IF NOT EXISTS public.alert_rule_profile_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_request_id uuid NOT NULL UNIQUE
    REFERENCES public.alert_rule_profile_review_requests(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL
    REFERENCES public.alert_rule_profiles(id) ON DELETE RESTRICT,
  decision text NOT NULL
    CHECK (decision IN ('approved', 'changes_requested', 'rejected')),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_note text NOT NULL CHECK (length(btrim(review_note)) BETWEEN 10 AND 1000),
  evidence_reference text,
  effective_from_week date,
  submitted_snapshot jsonb NOT NULL CHECK (jsonb_typeof(submitted_snapshot) = 'object'),
  reviewed_snapshot jsonb NOT NULL CHECK (jsonb_typeof(reviewed_snapshot) = 'object'),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (decision = 'approved'
      AND evidence_reference IS NOT NULL
      AND length(btrim(evidence_reference)) BETWEEN 5 AND 500
      AND effective_from_week IS NOT NULL
      AND EXTRACT(DOW FROM effective_from_week) = 0)
    OR
    (decision <> 'approved'
      AND evidence_reference IS NULL
      AND effective_from_week IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS alert_rule_profile_review_decisions_profile_reviewed_idx
  ON public.alert_rule_profile_review_decisions (profile_id, reviewed_at DESC);

ALTER TABLE public.alert_rule_profile_review_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_rule_profile_review_decisions_read_reviewer_admin
  ON public.alert_rule_profile_review_decisions;
CREATE POLICY alert_rule_profile_review_decisions_read_reviewer_admin
  ON public.alert_rule_profile_review_decisions
  FOR SELECT TO authenticated
  USING (public.current_dengueyosoku_role() IN ('reviewer', 'administrator'));

REVOKE ALL ON public.alert_rule_profile_review_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.alert_rule_profile_review_decisions TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_alert_rule_review_decision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Alert Rule Profile review decisions are append-only';
END;
$$;

DROP TRIGGER IF EXISTS alert_rule_profile_review_decisions_no_row_mutation
  ON public.alert_rule_profile_review_decisions;
CREATE TRIGGER alert_rule_profile_review_decisions_no_row_mutation
  BEFORE UPDATE OR DELETE ON public.alert_rule_profile_review_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_alert_rule_review_decision_mutation();

DROP TRIGGER IF EXISTS alert_rule_profile_review_decisions_no_truncate
  ON public.alert_rule_profile_review_decisions;
CREATE TRIGGER alert_rule_profile_review_decisions_no_truncate
  BEFORE TRUNCATE ON public.alert_rule_profile_review_decisions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_alert_rule_review_decision_mutation();

CREATE OR REPLACE FUNCTION public.dengueyosoku_save_alert_rule_draft(
  p_profile_id text,
  p_version text,
  p_methodology text,
  p_thresholds jsonb,
  p_change_note text,
  p_submit_for_review boolean DEFAULT false
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
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  SELECT up.role INTO v_role
  FROM public.user_profiles AS up
  WHERE up.id = v_actor;
  IF v_role IS DISTINCT FROM 'administrator' THEN
    RAISE EXCEPTION 'Administrator role is required to edit Draft Rule Profiles' USING ERRCODE = '42501';
  END IF;

  -- This workflow is intentionally scoped to the app's current Draft identity.
  IF p_profile_id IS DISTINCT FROM 'dengueyosoku-national-alerts'
     OR p_version IS DISTINCT FROM '0.1.0-draft' THEN
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
  IF jsonb_array_length(p_thresholds) > 77 THEN
    RAISE EXCEPTION 'Threshold payload may contain at most 77 rows' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile
  FROM public.alert_rule_profiles AS rp
  WHERE rp.profile_id = p_profile_id AND rp.version = p_version
  FOR UPDATE;
  v_profile_found := FOUND;

  IF NOT v_profile_found THEN
    INSERT INTO public.alert_rule_profiles (
      profile_id, version, status, scope, metric, methodology,
      external_notifications_enabled, created_by
    ) VALUES (
      p_profile_id, p_version, 'draft', 'national_77_provinces',
      'weekly_predicted_cases', v_methodology, false, v_actor
    )
    RETURNING * INTO v_profile;
  END IF;

  IF v_profile.status <> 'draft' THEN
    RAISE EXCEPTION 'Only Draft Rule Profiles can be edited; approved profiles are immutable' USING ERRCODE = '22023';
  END IF;
  IF v_profile.scope <> 'national_77_provinces'
     OR v_profile.metric <> 'weekly_predicted_cases'
     OR v_profile.external_notifications_enabled THEN
    RAISE EXCEPTION 'Rule Profile is outside the permitted Draft workflow' USING ERRCODE = '22023';
  END IF;

  -- Freeze the submitted snapshot until a reviewer records a decision.
  IF EXISTS (
    SELECT 1
    FROM public.alert_rule_profile_review_requests AS rr
    WHERE rr.profile_id = v_profile.id
      AND rr.status = 'pending'
      AND NOT EXISTS (
        SELECT 1
        FROM public.alert_rule_profile_review_decisions AS decision
        WHERE decision.review_request_id = rr.id
      )
  ) THEN
    RAISE EXCEPTION 'An expert review request is pending; the submitted Draft snapshot is locked' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'profile_id', v_profile.profile_id,
    'version', v_profile.version,
    'status', v_profile.status,
    'methodology', v_profile.methodology,
    'thresholds', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'province_name', t.province_name,
        'watch_threshold', t.watch_threshold,
        'alert_threshold', t.alert_threshold
      ) ORDER BY t.province_name)
      FROM public.alert_rule_thresholds AS t
      WHERE t.profile_id = v_profile.id
    ), '[]'::jsonb)
  ) INTO v_before;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_thresholds)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Each threshold row must be an object' USING ERRCODE = '22023';
    END IF;
    v_province := NULLIF(btrim(v_item->>'province_name'), '');
    IF v_province IS NULL OR length(v_province) > 100 THEN
      RAISE EXCEPTION 'Invalid province name in threshold row' USING ERRCODE = '22023';
    END IF;
    IF v_province = ANY(v_names) THEN
      RAISE EXCEPTION 'Duplicate province in threshold payload: %', v_province USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_item->'watch_threshold') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'alert_threshold') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Threshold values must be JSON numbers for %', v_province USING ERRCODE = '22023';
    END IF;

    v_watch := (v_item->>'watch_threshold')::numeric;
    v_alert := (v_item->>'alert_threshold')::numeric;
    IF v_watch < 0 OR v_alert <= v_watch
       OR v_watch > 99999999999.999 OR v_alert > 99999999999.999
       OR scale(v_watch) > 3 OR scale(v_alert) > 3 THEN
      RAISE EXCEPTION 'Invalid Watch/Alert threshold values for %', v_province USING ERRCODE = '22023';
    END IF;

    v_names := array_append(v_names, v_province);
    v_count := v_count + 1;
  END LOOP;

  IF COALESCE(p_submit_for_review, false) AND v_count <> 77 THEN
    RAISE EXCEPTION 'Submission for expert review requires exactly 77 complete province thresholds' USING ERRCODE = '22023';
  END IF;

  -- Replace the Draft threshold set atomically. The parent profile is locked and
  -- must still be Draft; migration 002 independently protects approved rows.
  DELETE FROM public.alert_rule_thresholds WHERE profile_id = v_profile.id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_thresholds)
  LOOP
    INSERT INTO public.alert_rule_thresholds (
      profile_id, province_name, watch_threshold, alert_threshold
    ) VALUES (
      v_profile.id,
      btrim(v_item->>'province_name'),
      (v_item->>'watch_threshold')::numeric,
      (v_item->>'alert_threshold')::numeric
    );
  END LOOP;

  UPDATE public.alert_rule_profiles
  SET methodology = v_methodology
  WHERE id = v_profile.id;

  SELECT jsonb_build_object(
    'profile_id', v_profile.profile_id,
    'version', v_profile.version,
    'status', 'draft',
    'methodology', v_methodology,
    'thresholds', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'province_name', t.province_name,
        'watch_threshold', t.watch_threshold,
        'alert_threshold', t.alert_threshold
      ) ORDER BY t.province_name)
      FROM public.alert_rule_thresholds AS t
      WHERE t.profile_id = v_profile.id
    ), '[]'::jsonb)
  ) INTO v_after;

  IF COALESCE(p_submit_for_review, false) THEN
    IF EXISTS (
      SELECT 1 FROM public.alert_rule_profile_review_requests AS rr
      WHERE rr.profile_id = v_profile.id
        AND rr.status = 'pending'
        AND NOT EXISTS (
          SELECT 1
          FROM public.alert_rule_profile_review_decisions AS decision
          WHERE decision.review_request_id = rr.id
        )
    ) THEN
      RAISE EXCEPTION 'A pending expert review request already exists for this Draft Profile' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.alert_rule_profile_review_requests (
      profile_id, requested_by, submission_note, profile_version,
      threshold_count, profile_snapshot
    ) VALUES (
      v_profile.id, v_actor, v_note, v_profile.version, v_count, v_after
    ) RETURNING id INTO v_review_id;
    v_action := 'submitted_for_review';
  ELSE
    v_action := 'draft_saved';
  END IF;

  INSERT INTO public.alert_rule_profile_change_log (
    profile_id, actor_id, action, note, previous_snapshot, new_snapshot
  ) VALUES (
    v_profile.id, v_actor, v_action, v_note, v_before, v_after
  );

  RETURN jsonb_build_object(
    'ok', true,
    'profile_id', v_profile.id,
    'profile_status', 'draft',
    'profile_version', v_profile.version,
    'threshold_count', v_count,
    'expected_threshold_count', 77,
    'review_request_id', v_review_id,
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


CREATE OR REPLACE FUNCTION public.dengueyosoku_review_alert_rule_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text,
  p_evidence_reference text DEFAULT NULL,
  p_effective_from_week date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_request public.alert_rule_profile_review_requests%ROWTYPE;
  v_profile public.alert_rule_profiles%ROWTYPE;
  v_threshold_count integer;
  v_snapshot jsonb;
  v_decided_snapshot jsonb;
  v_decision_id uuid;
  v_note text := btrim(COALESCE(p_review_note, ''));
  v_evidence text := NULLIF(btrim(COALESCE(p_evidence_reference, '')), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  SELECT up.role INTO v_role
  FROM public.user_profiles AS up
  WHERE up.id = v_actor;
  -- A generic Administrator is not automatically an independent expert reviewer.
  IF v_role IS DISTINCT FROM 'reviewer' THEN
    RAISE EXCEPTION 'Dedicated reviewer role is required to decide expert review requests' USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A valid review request id is required' USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'changes_requested', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported review decision' USING ERRCODE = '22023';
  END IF;
  IF length(v_note) < 10 OR length(v_note) > 1000 THEN
    RAISE EXCEPTION 'Review note must contain between 10 and 1000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request
  FROM public.alert_rule_profile_review_requests AS rr
  WHERE rr.id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review request was not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.requested_by = v_actor THEN
    RAISE EXCEPTION 'The request submitter cannot review or approve their own request' USING ERRCODE = '42501';
  END IF;

  -- Lock order starts with the profile row, matching the Draft-save RPC.
  SELECT * INTO v_profile
  FROM public.alert_rule_profiles AS rp
  WHERE rp.id = v_request.profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rule Profile for this request was not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM public.alert_rule_profile_review_requests AS rr
  WHERE rr.id = p_request_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.alert_rule_profile_review_decisions AS d
    WHERE d.review_request_id = p_request_id
  ) THEN
    RAISE EXCEPTION 'This review request already has a decision' USING ERRCODE = '22023';
  END IF;
  IF v_profile.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a Draft Rule Profile can be reviewed' USING ERRCODE = '22023';
  END IF;
  IF v_profile.profile_id <> 'dengueyosoku-national-alerts'
     OR v_profile.version <> v_request.profile_version
     OR v_request.profile_version <> '0.1.0-draft'
     OR v_profile.external_notifications_enabled THEN
    RAISE EXCEPTION 'Review request does not match the supported Draft Profile' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_threshold_count
  FROM public.alert_rule_thresholds AS t
  WHERE t.profile_id = v_profile.id;
  IF v_threshold_count <> 77 OR v_request.threshold_count <> 77 THEN
    RAISE EXCEPTION 'Review decisions require exactly 77 stored province thresholds' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'profile_id', v_profile.profile_id,
    'version', v_profile.version,
    'status', v_profile.status,
    'methodology', v_profile.methodology,
    'thresholds', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'province_name', t.province_name,
        'watch_threshold', t.watch_threshold,
        'alert_threshold', t.alert_threshold
      ) ORDER BY t.province_name)
      FROM public.alert_rule_thresholds AS t
      WHERE t.profile_id = v_profile.id
    ), '[]'::jsonb)
  ) INTO v_snapshot;

  -- Reject stale requests if the Draft changed after it was submitted.
  IF v_snapshot IS DISTINCT FROM v_request.profile_snapshot THEN
    RAISE EXCEPTION 'Draft changed after submission; withdraw by creating a new reviewed snapshot' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'approved' THEN
    IF v_evidence IS NULL OR length(v_evidence) < 5 OR length(v_evidence) > 500 THEN
      RAISE EXCEPTION 'Approval requires a meaningful evidence or approval reference' USING ERRCODE = '22023';
    END IF;
    IF p_effective_from_week IS NULL OR EXTRACT(DOW FROM p_effective_from_week) <> 0 THEN
      RAISE EXCEPTION 'Approval effective week must be a Sunday epidemiological week' USING ERRCODE = '22023';
    END IF;

    UPDATE public.alert_rule_profiles
    SET status = 'approved',
        approval_reference = v_evidence,
        effective_from_week = p_effective_from_week,
        approved_at = now(),
        approved_by = v_actor
    WHERE id = v_profile.id;

    SELECT jsonb_build_object(
      'profile_id', rp.profile_id,
      'version', rp.version,
      'status', rp.status,
      'methodology', rp.methodology,
      'approval_reference', rp.approval_reference,
      'effective_from_week', rp.effective_from_week,
      'approved_by', rp.approved_by,
      'thresholds', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'province_name', t.province_name,
          'watch_threshold', t.watch_threshold,
          'alert_threshold', t.alert_threshold
        ) ORDER BY t.province_name)
        FROM public.alert_rule_thresholds AS t
        WHERE t.profile_id = rp.id
      ), '[]'::jsonb)
    ) INTO v_decided_snapshot
    FROM public.alert_rule_profiles AS rp
    WHERE rp.id = v_profile.id;
  ELSE
    IF v_evidence IS NOT NULL OR p_effective_from_week IS NOT NULL THEN
      RAISE EXCEPTION 'Evidence reference and effective week are only valid for approval decisions' USING ERRCODE = '22023';
    END IF;
    v_decided_snapshot := v_snapshot;
  END IF;

  INSERT INTO public.alert_rule_profile_review_decisions (
    review_request_id, profile_id, decision, reviewer_id, review_note,
    evidence_reference, effective_from_week, submitted_snapshot, reviewed_snapshot
  ) VALUES (
    p_request_id, v_profile.id, p_decision, v_actor, v_note,
    CASE WHEN p_decision = 'approved' THEN v_evidence ELSE NULL END,
    CASE WHEN p_decision = 'approved' THEN p_effective_from_week ELSE NULL END,
    v_request.profile_snapshot, v_decided_snapshot
  ) RETURNING id INTO v_decision_id;

  RETURN jsonb_build_object(
    'ok', true,
    'decision_id', v_decision_id,
    'request_id', p_request_id,
    'decision', p_decision,
    'profile_status', CASE WHEN p_decision = 'approved' THEN 'approved' ELSE 'draft' END,
    'reviewer_id', v_actor,
    'reviewed_at', now(),
    'external_notifications_enabled', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dengueyosoku_review_alert_rule_request(uuid, text, text, text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dengueyosoku_review_alert_rule_request(uuid, text, text, text, date)
  TO authenticated;

COMMENT ON FUNCTION public.dengueyosoku_review_alert_rule_request(uuid, text, text, text, date) IS
  'Independent reviewer-only decision workflow. Requires a different user from the request submitter; approval requires 77 unchanged thresholds and an evidence reference. External notifications remain disabled.';


COMMIT;
