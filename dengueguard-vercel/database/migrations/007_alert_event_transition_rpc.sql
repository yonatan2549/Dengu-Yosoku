-- DengueYosoku: transactional Alert Event lifecycle transition.
-- Requires migrations 001_alert_center.sql and 003_supabase_auth_and_rls.sql.
-- This function does not send external notifications.

BEGIN;

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

  IF p_event_id IS NULL OR p_action IS NULL
     OR p_action NOT IN ('acknowledge', 'resolve', 'reopen') THEN
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
    IF length(btrim(v_note)) = 0 THEN v_note := 'ผู้ทบทวนรับทราบเหตุการณ์'; END IF;
  ELSIF p_action = 'resolve' AND v_event.status = 'acknowledged' THEN
    IF length(btrim(v_note)) < 3 THEN
      RAISE EXCEPTION 'Resolution requires a reason of at least 3 characters' USING ERRCODE = '22023';
    END IF;
    v_next_status := 'resolved';
    v_transition_type := 'resolved';
  ELSIF p_action = 'reopen' AND v_event.status = 'resolved' THEN
    v_next_status := 'reopened';
    v_transition_type := 'reopened';
    IF length(btrim(v_note)) = 0 THEN v_note := 'ผู้ทบทวนเปิดเหตุการณ์อีกครั้ง'; END IF;
  ELSE
    RAISE EXCEPTION 'Transition is not allowed from the current event status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.alert_events
  SET status = v_next_status, updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.alert_event_transitions (
    event_id, transition_type, from_status, to_status, note, actor_id
  ) VALUES (p_event_id, v_transition_type, v_event.status, v_next_status, v_note, v_actor);

  RETURN jsonb_build_object(
    'ok', true, 'event_id', p_event_id, 'from_status', v_event.status,
    'to_status', v_next_status, 'transition_type', v_transition_type
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dengueyosoku_transition_alert_event(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dengueyosoku_transition_alert_event(uuid, text, text)
  TO authenticated;
COMMENT ON FUNCTION public.dengueyosoku_transition_alert_event(uuid, text, text) IS
  'Transactional reviewer/admin event lifecycle transition with append-only audit history.';

COMMIT;
