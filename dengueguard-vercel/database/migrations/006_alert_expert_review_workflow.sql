-- DengueYosoku Alert Center Phase 6: independent expert review and governed approval.
-- Apply after migrations 001-005. Thresholds are never invented by this migration.
-- Only a distinct user with the dedicated reviewer role may decide a request.

BEGIN;

DROP INDEX IF EXISTS public.alert_rule_profile_one_pending_review_idx;

CREATE TABLE IF NOT EXISTS public.alert_rule_profile_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_request_id uuid NOT NULL UNIQUE REFERENCES public.alert_rule_profile_review_requests(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.alert_rule_profiles(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved', 'changes_requested', 'rejected')),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_note text NOT NULL CHECK (length(btrim(review_note)) BETWEEN 10 AND 1000),
  evidence_reference text,
  effective_from_week date,
  submitted_snapshot jsonb NOT NULL CHECK (jsonb_typeof(submitted_snapshot) = 'object'),
  reviewed_snapshot jsonb NOT NULL CHECK (jsonb_typeof(reviewed_snapshot) = 'object'),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (decision = 'approved' AND evidence_reference IS NOT NULL
      AND length(btrim(evidence_reference)) BETWEEN 5 AND 500
      AND effective_from_week IS NOT NULL AND EXTRACT(DOW FROM effective_from_week) = 0)
    OR (decision <> 'approved' AND evidence_reference IS NULL AND effective_from_week IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS alert_rule_profile_review_decisions_profile_reviewed_idx
  ON public.alert_rule_profile_review_decisions (profile_id, reviewed_at DESC);
ALTER TABLE public.alert_rule_profile_review_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_rule_profile_review_decisions_read_reviewer_admin ON public.alert_rule_profile_review_decisions;
CREATE POLICY alert_rule_profile_review_decisions_read_reviewer_admin
  ON public.alert_rule_profile_review_decisions FOR SELECT TO authenticated
  USING (public.current_dengueyosoku_role() IN ('reviewer', 'administrator'));
REVOKE ALL ON public.alert_rule_profile_review_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.alert_rule_profile_review_decisions TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_alert_rule_review_decision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Alert Rule Profile review decisions are append-only';
END;
$$;
DROP TRIGGER IF EXISTS alert_rule_profile_review_decisions_no_row_mutation ON public.alert_rule_profile_review_decisions;
CREATE TRIGGER alert_rule_profile_review_decisions_no_row_mutation
  BEFORE UPDATE OR DELETE ON public.alert_rule_profile_review_decisions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_alert_rule_review_decision_mutation();
DROP TRIGGER IF EXISTS alert_rule_profile_review_decisions_no_truncate ON public.alert_rule_profile_review_decisions;
CREATE TRIGGER alert_rule_profile_review_decisions_no_truncate
  BEFORE TRUNCATE ON public.alert_rule_profile_review_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_alert_rule_review_decision_mutation();

-- Submitted snapshots are frozen until a decision is recorded.
CREATE OR REPLACE FUNCTION public.prevent_pending_alert_rule_draft_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  v_profile_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.profile_id ELSE NEW.profile_id END;
  IF EXISTS (
    SELECT 1
    FROM public.alert_rule_profile_review_requests rr
    WHERE rr.profile_id = v_profile_id
      AND rr.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM public.alert_rule_profile_review_decisions decision
        WHERE decision.review_request_id = rr.id
      )
  ) THEN
    RAISE EXCEPTION 'An expert review request is pending; the submitted Draft snapshot is locked';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS alert_rule_thresholds_lock_pending_review ON public.alert_rule_thresholds;
CREATE TRIGGER alert_rule_thresholds_lock_pending_review
  BEFORE INSERT OR UPDATE OR DELETE ON public.alert_rule_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.prevent_pending_alert_rule_draft_mutation();
DROP TRIGGER IF EXISTS alert_rule_profile_lock_pending_review ON public.alert_rule_profiles;
CREATE TRIGGER alert_rule_profile_lock_pending_review
  BEFORE UPDATE OF methodology ON public.alert_rule_profiles
  FOR EACH ROW WHEN (OLD.status = 'draft')
  EXECUTE FUNCTION public.prevent_pending_alert_rule_draft_mutation();

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
  v_reviewed_snapshot jsonb;
  v_decision_id uuid;
  v_note text := btrim(COALESCE(p_review_note, ''));
  v_evidence text := NULLIF(btrim(COALESCE(p_evidence_reference, '')), '');
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501'; END IF;
  SELECT up.role INTO v_role FROM public.user_profiles up WHERE up.id = v_actor;
  IF v_role IS DISTINCT FROM 'reviewer' THEN
    RAISE EXCEPTION 'Dedicated reviewer role is required to decide expert review requests' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'A valid review request id is required' USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'changes_requested', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported review decision' USING ERRCODE = '22023';
  END IF;
  IF length(v_note) < 10 OR length(v_note) > 1000 THEN
    RAISE EXCEPTION 'Review note must contain between 10 and 1000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request FROM public.alert_rule_profile_review_requests rr WHERE rr.id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review request was not found' USING ERRCODE = 'P0002'; END IF;
  IF v_request.requested_by = v_actor THEN
    RAISE EXCEPTION 'The request submitter cannot review or approve their own request' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.alert_rule_profiles rp WHERE rp.id = v_request.profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule Profile for this request was not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM public.alert_rule_profile_review_requests rr WHERE rr.id = p_request_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.alert_rule_profile_review_decisions d WHERE d.review_request_id = p_request_id) THEN
    RAISE EXCEPTION 'This review request already has a decision' USING ERRCODE = '22023';
  END IF;
  IF v_profile.status <> 'draft' THEN RAISE EXCEPTION 'Only a Draft Rule Profile can be reviewed' USING ERRCODE = '22023'; END IF;
  IF v_profile.profile_id <> 'dengueyosoku-national-alerts'
     OR v_profile.version <> v_request.profile_version
     OR v_request.profile_version <> '0.1.0-draft'
     OR v_profile.external_notifications_enabled THEN
    RAISE EXCEPTION 'Review request does not match the supported Draft Profile' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_threshold_count FROM public.alert_rule_thresholds t WHERE t.profile_id = v_profile.id;
  IF v_threshold_count <> 77 OR v_request.threshold_count <> 77 THEN
    RAISE EXCEPTION 'Review decisions require exactly 77 stored province thresholds' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'profile_id', v_profile.profile_id, 'version', v_profile.version, 'status', v_profile.status,
    'methodology', v_profile.methodology,
    'thresholds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'province_name', t.province_name, 'watch_threshold', t.watch_threshold, 'alert_threshold', t.alert_threshold
    ) ORDER BY t.province_name) FROM public.alert_rule_thresholds t WHERE t.profile_id = v_profile.id), '[]'::jsonb)
  ) INTO v_snapshot;
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
    SET status = 'approved', approval_reference = v_evidence,
        effective_from_week = p_effective_from_week, approved_at = now(), approved_by = v_actor
    WHERE id = v_profile.id;
    SELECT jsonb_build_object(
      'profile_id', rp.profile_id, 'version', rp.version, 'status', rp.status,
      'methodology', rp.methodology, 'approval_reference', rp.approval_reference,
      'effective_from_week', rp.effective_from_week, 'approved_by', rp.approved_by,
      'thresholds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'province_name', t.province_name, 'watch_threshold', t.watch_threshold, 'alert_threshold', t.alert_threshold
      ) ORDER BY t.province_name) FROM public.alert_rule_thresholds t WHERE t.profile_id = rp.id), '[]'::jsonb)
    ) INTO v_reviewed_snapshot FROM public.alert_rule_profiles rp WHERE rp.id = v_profile.id;
  ELSE
    IF v_evidence IS NOT NULL OR p_effective_from_week IS NOT NULL THEN
      RAISE EXCEPTION 'Evidence reference and effective week are only valid for approval decisions' USING ERRCODE = '22023';
    END IF;
    v_reviewed_snapshot := v_snapshot;
  END IF;

  INSERT INTO public.alert_rule_profile_review_decisions (
    review_request_id, profile_id, decision, reviewer_id, review_note,
    evidence_reference, effective_from_week, submitted_snapshot, reviewed_snapshot
  ) VALUES (
    p_request_id, v_profile.id, p_decision, v_actor, v_note,
    CASE WHEN p_decision = 'approved' THEN v_evidence ELSE NULL END,
    CASE WHEN p_decision = 'approved' THEN p_effective_from_week ELSE NULL END,
    v_request.profile_snapshot, v_reviewed_snapshot
  ) RETURNING id INTO v_decision_id;
  RETURN jsonb_build_object(
    'ok', true, 'decision_id', v_decision_id, 'request_id', p_request_id,
    'decision', p_decision, 'profile_status', CASE WHEN p_decision = 'approved' THEN 'approved' ELSE 'draft' END,
    'reviewer_id', v_actor, 'reviewed_at', now(), 'external_notifications_enabled', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dengueyosoku_review_alert_rule_request(uuid, text, text, text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dengueyosoku_review_alert_rule_request(uuid, text, text, text, date)
  TO authenticated;
COMMENT ON FUNCTION public.dengueyosoku_review_alert_rule_request(uuid, text, text, text, date) IS
  'Independent reviewer-only decision workflow. Requires a different user from the request submitter; approval requires 77 unchanged thresholds and evidence. External notifications remain disabled.';

COMMIT;
