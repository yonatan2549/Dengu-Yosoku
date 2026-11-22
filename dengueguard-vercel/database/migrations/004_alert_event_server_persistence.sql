-- DengueYosoku Alert Center Phase 3: authenticated server-side persistence.
-- Apply after migrations 001, 002 and 003.
-- Browser roles retain SELECT-only table grants. Mutations are exposed only
-- through SECURITY DEFINER RPCs that verify auth.uid() and the DB role.
-- External delivery remains structurally disabled by existing CHECK constraints.

BEGIN;

CREATE OR REPLACE FUNCTION public.dengueyosoku_record_alert_evaluation(
  p_evaluation jsonb,
  p_candidates jsonb DEFAULT '[]'::jsonb
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
  v_run_id uuid;
  v_duplicate boolean := false;
  v_inserted integer := 0;
  v_seen_keys text[] := ARRAY[]::text[];
  v_candidate jsonb;
  v_threshold public.alert_rule_thresholds%ROWTYPE;
  v_event public.alert_events%ROWTYPE;
  v_event_id uuid;
  v_event_key text;
  v_province text;
  v_level text;
  -- Keep full precision while validating candidates against the approved
  -- numeric(14,3) thresholds; storage columns apply their own scale later.
  v_predicted numeric;
  v_trigger numeric;
  v_week date;
  v_stale boolean;
  v_fingerprint text;
  v_next_status text;
  v_profile_text_id text;
  v_version text;
  v_profile_status text;
  v_run_status text;
  v_external boolean;
  v_candidate_count integer;
  v_threshold_count integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  SELECT up.role INTO v_role
  FROM public.user_profiles AS up
  WHERE up.id = v_actor;
  IF v_role IS NULL OR v_role NOT IN ('reviewer', 'administrator') THEN
    RAISE EXCEPTION 'Reviewer or administrator role is required' USING ERRCODE = '42501';
  END IF;

  IF p_evaluation IS NULL OR jsonb_typeof(p_evaluation) <> 'object' THEN
    RAISE EXCEPTION 'Evaluation payload must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_candidates IS NULL OR jsonb_typeof(p_candidates) <> 'array' THEN
    RAISE EXCEPTION 'Candidates payload must be an array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_candidates) > 77 THEN
    RAISE EXCEPTION 'At most 77 candidate events are accepted per evaluation' USING ERRCODE = '22023';
  END IF;

  v_profile_text_id := NULLIF(btrim(p_evaluation->>'profile_id'), '');
  v_version := NULLIF(btrim(p_evaluation->>'profile_version'), '');
  v_profile_status := p_evaluation->>'profile_status';
  v_run_status := p_evaluation->>'run_status';
  v_external := COALESCE((p_evaluation->>'external_notifications_enabled')::boolean, false);

  IF v_profile_text_id IS NULL OR length(v_profile_text_id) > 160
     OR v_version IS NULL OR length(v_version) > 80 THEN
    RAISE EXCEPTION 'Invalid rule profile identity' USING ERRCODE = '22023';
  END IF;
  IF v_profile_status IS NULL OR v_profile_status NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'Invalid rule profile status' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_evaluation->>'scope', '') <> 'national_77_provinces'
     OR COALESCE(p_evaluation->>'metric', '') <> 'weekly_predicted_cases' THEN
    RAISE EXCEPTION 'Unsupported alert scope or metric' USING ERRCODE = '22023';
  END IF;
  IF v_external THEN
    RAISE EXCEPTION 'External notifications are disabled' USING ERRCODE = '22023';
  END IF;
  IF v_run_status IS NULL OR v_run_status NOT IN ('blocked', 'evaluated') THEN
    RAISE EXCEPTION 'Invalid evaluation status' USING ERRCODE = '22023';
  END IF;
  IF p_evaluation->>'freshness' IS NULL OR p_evaluation->>'freshness' NOT IN ('current_or_future', 'stale', 'unknown') THEN
    RAISE EXCEPTION 'Invalid forecast freshness' USING ERRCODE = '22023';
  END IF;
  IF p_evaluation->>'run_fingerprint' IS NULL
     OR p_evaluation->>'run_fingerprint' !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Evaluation fingerprint must be a SHA-256 hex digest' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_evaluation->'checks', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_evaluation->'blocked_reasons', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_evaluation->'thresholds_snapshot', '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Invalid evaluation audit metadata' USING ERRCODE = '22023';
  END IF;

  -- A client may create a Draft profile record, but it cannot approve one.
  IF v_profile_status = 'draft' THEN
    INSERT INTO public.alert_rule_profiles (
      profile_id, version, status, scope, metric, methodology,
      approval_reference, effective_from_week, external_notifications_enabled,
      created_by
    ) VALUES (
      v_profile_text_id,
      v_version,
      'draft',
      'national_77_provinces',
      'weekly_predicted_cases',
      COALESCE(p_evaluation->>'methodology', 'ยังไม่ระบุระเบียบวิธี'),
      NULL,
      NULL,
      false,
      v_actor
    )
    ON CONFLICT (profile_id, version) DO NOTHING;
  END IF;

  SELECT * INTO v_profile
  FROM public.alert_rule_profiles AS rp
  WHERE rp.profile_id = v_profile_text_id
    AND rp.version = v_version
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rule profile does not exist in the database' USING ERRCODE = '22023';
  END IF;
  IF v_profile.status <> v_profile_status THEN
    RAISE EXCEPTION 'Application and database rule profile status differ; refresh the approved profile configuration' USING ERRCODE = '22023';
  END IF;
  IF v_profile.scope <> 'national_77_provinces'
     OR v_profile.metric <> 'weekly_predicted_cases'
     OR v_profile.external_notifications_enabled THEN
    RAISE EXCEPTION 'Database rule profile is not eligible for dry-run evaluation' USING ERRCODE = '22023';
  END IF;
  IF v_profile.status = 'approved' AND (
    v_profile.approval_reference IS DISTINCT FROM NULLIF(btrim(p_evaluation->>'approval_reference'), '')
    OR v_profile.effective_from_week IS DISTINCT FROM NULLIF(p_evaluation->>'effective_from_week', '')::date
  ) THEN
    RAISE EXCEPTION 'Application approval metadata does not match the approved database profile' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.alert_evaluation_runs (
    run_fingerprint, rule_profile_id, rule_profile_version, run_status,
    freshness, forecast_lag_weeks, target_week, current_epi_week,
    model_repository, model_revision, model_generated_at, source_retrieved_at,
    history_end_week, forecast_province_count, evaluated_province_count,
    watch_candidate_count, alert_candidate_count, external_notifications_enabled,
    checks, blocked_reasons, thresholds_snapshot, created_by
  ) VALUES (
    p_evaluation->>'run_fingerprint',
    v_profile.id,
    v_version,
    v_run_status,
    p_evaluation->>'freshness',
    NULLIF(p_evaluation->>'forecast_lag_weeks', '')::integer,
    NULLIF(p_evaluation->>'target_week', '')::date,
    (p_evaluation->>'current_epi_week')::date,
    NULLIF(p_evaluation->>'model_repository', ''),
    NULLIF(p_evaluation->>'model_revision', ''),
    NULLIF(p_evaluation->>'model_generated_at', '')::timestamptz,
    NULLIF(p_evaluation->>'source_retrieved_at', '')::timestamptz,
    NULLIF(p_evaluation->>'history_end_week', '')::date,
    (p_evaluation->>'forecast_province_count')::integer,
    (p_evaluation->>'evaluated_province_count')::integer,
    (p_evaluation->>'watch_candidate_count')::integer,
    (p_evaluation->>'alert_candidate_count')::integer,
    false,
    COALESCE(p_evaluation->'checks', '[]'::jsonb),
    COALESCE(p_evaluation->'blocked_reasons', '[]'::jsonb),
    COALESCE(p_evaluation->'thresholds_snapshot', '{}'::jsonb),
    v_actor
  )
  ON CONFLICT (run_fingerprint) DO NOTHING
  RETURNING id INTO v_run_id;

  IF v_run_id IS NULL THEN
    v_duplicate := true;
    SELECT er.id INTO v_run_id
    FROM public.alert_evaluation_runs AS er
    WHERE er.run_fingerprint = p_evaluation->>'run_fingerprint';
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'run_id', v_run_id,
      'created_events', 0,
      'candidate_events', jsonb_array_length(p_candidates),
      'profile_status', v_profile.status,
      'external_notifications_enabled', false
    );
  END IF;

  v_candidate_count := jsonb_array_length(p_candidates);
  IF v_candidate_count > 0 THEN
    IF v_profile.status <> 'approved'
       OR v_run_status <> 'evaluated'
       OR (p_evaluation->>'forecast_province_count')::integer <> 77
       OR (p_evaluation->>'evaluated_province_count')::integer <> 77
       OR v_profile.effective_from_week IS NULL
       OR NULLIF(p_evaluation->>'target_week', '')::date < v_profile.effective_from_week THEN
      RAISE EXCEPTION 'Candidate events require an approved profile and complete eligible forecast' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_threshold_count
    FROM public.alert_rule_thresholds AS t
    WHERE t.profile_id = v_profile.id;
    IF v_threshold_count <> 77 THEN
      RAISE EXCEPTION 'Approved profile must contain exactly 77 province thresholds' USING ERRCODE = '22023';
    END IF;

    FOR v_candidate IN SELECT value FROM jsonb_array_elements(p_candidates)
    LOOP
      v_event_key := NULLIF(btrim(v_candidate->>'event_key'), '');
      v_province := NULLIF(btrim(v_candidate->>'province_name'), '');
      v_level := v_candidate->>'current_level';
      v_predicted := (v_candidate->>'predicted_cases')::numeric;
      v_trigger := (v_candidate->>'triggering_threshold')::numeric;
      v_week := (v_candidate->>'target_week')::date;
      v_stale := COALESCE((v_candidate->>'snapshot_is_stale')::boolean, false);

      IF v_event_key IS NULL OR length(v_event_key) > 500
         OR v_province IS NULL OR length(v_province) > 100
         OR v_level IS NULL OR v_level NOT IN ('WATCH', 'ALERT')
         OR COALESCE(v_candidate->>'signal_type', '') <> 'predicted_cases_threshold'
         OR v_week IS DISTINCT FROM NULLIF(p_evaluation->>'target_week', '')::date
         OR v_predicted IS NULL OR v_trigger IS NULL
         OR v_predicted < 0 OR v_trigger < 0 THEN
        RAISE EXCEPTION 'Invalid candidate event payload' USING ERRCODE = '22023';
      END IF;
      IF v_event_key = ANY(v_seen_keys) THEN
        RAISE EXCEPTION 'Duplicate candidate event key in one evaluation' USING ERRCODE = '22023';
      END IF;
      v_seen_keys := array_append(v_seen_keys, v_event_key);

      SELECT * INTO v_threshold
      FROM public.alert_rule_thresholds AS t
      WHERE t.profile_id = v_profile.id
        AND t.province_name = v_province;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Candidate province has no approved threshold' USING ERRCODE = '22023';
      END IF;
      IF v_level = 'ALERT' AND (
        v_trigger <> v_threshold.alert_threshold
        OR v_predicted < v_threshold.alert_threshold
      ) THEN
        RAISE EXCEPTION 'ALERT candidate does not match the approved alert threshold' USING ERRCODE = '22023';
      ELSIF v_level = 'WATCH' AND (
        v_trigger <> v_threshold.watch_threshold
        OR v_predicted < v_threshold.watch_threshold
        OR v_predicted >= v_threshold.alert_threshold
      ) THEN
        RAISE EXCEPTION 'WATCH candidate does not match the approved watch threshold' USING ERRCODE = '22023';
      END IF;

      v_fingerprint := md5(jsonb_build_object(
        'model_revision', NULLIF(p_evaluation->>'model_revision', ''),
        'predicted_cases', v_predicted,
        'threshold', v_trigger,
        'level', v_level,
        'rule_profile_version', v_version,
        'snapshot_is_stale', v_stale
      )::text);

      v_event_id := NULL;
      INSERT INTO public.alert_events (
        event_key, province_name, target_week, signal_type, current_level,
        status, predicted_cases, triggering_threshold, rule_profile_id,
        rule_profile_version, snapshot_is_stale, delivery_state,
        last_seen_fingerprint, model_revision, first_seen_run_id, last_seen_run_id
      ) VALUES (
        v_event_key, v_province, v_week, 'predicted_cases_threshold', v_level,
        'new', v_predicted, v_trigger, v_profile.id, v_version,
        v_stale, 'not_sent_dry_run_only', v_fingerprint,
        NULLIF(p_evaluation->>'model_revision', ''), v_run_id, v_run_id
      )
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id INTO v_event_id;

      IF v_event_id IS NOT NULL THEN
        INSERT INTO public.alert_event_transitions (
          event_id, transition_type, to_status, to_level, note,
          evaluation_run_id, actor_id
        ) VALUES (
          v_event_id, 'created', 'new', v_level,
          'สร้าง Candidate จากการประเมิน Dry-run', v_run_id, v_actor
        );
        v_inserted := v_inserted + 1;
      ELSE
        SELECT * INTO v_event
        FROM public.alert_events AS e
        WHERE e.event_key = v_event_key
        FOR UPDATE;

        IF v_event.rule_profile_id <> v_profile.id
           OR v_event.province_name <> v_province
           OR v_event.target_week <> v_week THEN
          RAISE EXCEPTION 'Event key collides with a different event identity' USING ERRCODE = '22023';
        END IF;

        v_next_status := v_event.status;
        IF v_event.status = 'resolved'
           AND v_event.last_seen_fingerprint IS DISTINCT FROM v_fingerprint THEN
          v_next_status := 'reopened';
          INSERT INTO public.alert_event_transitions (
            event_id, transition_type, from_status, to_status, note,
            evaluation_run_id, actor_id
          ) VALUES (
            v_event.id, 'reopened', 'resolved', 'reopened',
            'พบสัญญาณเดิมอีกครั้งใน Snapshot รุ่นใหม่', v_run_id, v_actor
          );
        END IF;

        IF v_event.current_level IS DISTINCT FROM v_level THEN
          INSERT INTO public.alert_event_transitions (
            event_id, transition_type, from_level, to_level, note,
            evaluation_run_id, actor_id
          ) VALUES (
            v_event.id, 'level_changed', v_event.current_level, v_level,
            'ระดับสัญญาณจำลองเปลี่ยนตามผลประเมินล่าสุด', v_run_id, v_actor
          );
        END IF;

        UPDATE public.alert_events
        SET current_level = v_level,
            status = v_next_status,
            predicted_cases = v_predicted,
            triggering_threshold = v_trigger,
            rule_profile_version = v_version,
            snapshot_is_stale = v_stale,
            delivery_state = 'not_sent_dry_run_only',
            last_seen_fingerprint = v_fingerprint,
            model_revision = NULLIF(p_evaluation->>'model_revision', ''),
            last_seen_run_id = v_run_id,
            last_seen_at = now(),
            updated_at = now()
        WHERE id = v_event.id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', v_duplicate,
    'run_id', v_run_id,
    'created_events', v_inserted,
    'candidate_events', v_candidate_count,
    'profile_status', v_profile.status,
    'external_notifications_enabled', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.dengueyosoku_transition_alert_event(
  p_event_id uuid,
  p_action text,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_event public.alert_events%ROWTYPE;
  v_next_status text;
  v_transition_type text;
  v_note text := left(COALESCE(p_note, ''), 1000);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  SELECT up.role INTO v_role
  FROM public.user_profiles AS up
  WHERE up.id = v_actor;
  IF v_role IS NULL OR v_role NOT IN ('reviewer', 'administrator') THEN
    RAISE EXCEPTION 'Reviewer or administrator role is required' USING ERRCODE = '42501';
  END IF;
  IF p_event_id IS NULL OR p_action NOT IN ('acknowledge', 'resolve', 'reopen') THEN
    RAISE EXCEPTION 'Invalid event transition request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_event
  FROM public.alert_events AS e
  WHERE e.id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alert event was not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'acknowledge' AND v_event.status IN ('new', 'reopened') THEN
    v_next_status := 'acknowledged';
    v_transition_type := 'acknowledged';
    IF length(btrim(v_note)) = 0 THEN
      v_note := 'ผู้ทบทวนรับทราบเหตุการณ์';
    END IF;
  ELSIF p_action = 'resolve' AND v_event.status = 'acknowledged' THEN
    IF length(btrim(v_note)) < 3 THEN
      RAISE EXCEPTION 'Resolution requires a reason of at least 3 characters' USING ERRCODE = '22023';
    END IF;
    v_next_status := 'resolved';
    v_transition_type := 'resolved';
  ELSIF p_action = 'reopen' AND v_event.status = 'resolved' THEN
    v_next_status := 'reopened';
    v_transition_type := 'reopened';
    IF length(btrim(v_note)) = 0 THEN
      v_note := 'ผู้ทบทวนเปิดเหตุการณ์อีกครั้ง';
    END IF;
  ELSE
    RAISE EXCEPTION 'Transition is not allowed from the current event status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.alert_events
  SET status = v_next_status,
      updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.alert_event_transitions (
    event_id, transition_type, from_status, to_status, note, actor_id
  ) VALUES (
    p_event_id, v_transition_type, v_event.status, v_next_status, v_note, v_actor
  );

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'from_status', v_event.status,
    'to_status', v_next_status,
    'transition_type', v_transition_type
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dengueyosoku_record_alert_evaluation(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dengueyosoku_transition_alert_event(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dengueyosoku_record_alert_evaluation(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dengueyosoku_transition_alert_event(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.dengueyosoku_record_alert_evaluation(jsonb, jsonb) IS
  'Transactional, role-gated persistence for Alert Center dry-run evaluation. Candidate creation requires a DB-approved profile and 77 thresholds.';
COMMENT ON FUNCTION public.dengueyosoku_transition_alert_event(uuid, text, text) IS
  'Transactional reviewer/admin event lifecycle transition with append-only audit history.';

COMMIT;
