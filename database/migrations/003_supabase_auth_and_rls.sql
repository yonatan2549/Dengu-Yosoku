-- DengueYosoku: Supabase Auth roles and read-only Alert Center access
-- Apply after 001_alert_center.sql and 002_alert_integrity_hardening.sql.
-- New users are viewers. Reviewer/admin access must be granted deliberately.
-- No browser-facing write policies are created for alert data.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('viewer', 'reviewer', 'administrator')),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.create_dengueyosoku_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'name', '')
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_dengueyosoku
  ON auth.users;
CREATE TRIGGER on_auth_user_created_dengueyosoku
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_dengueyosoku_user_profile();

-- Backfill profiles for accounts that existed before this migration.
INSERT INTO public.user_profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.current_dengueyosoku_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_read_self_or_admin
  ON public.user_profiles;
CREATE POLICY user_profiles_read_self_or_admin
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.current_dengueyosoku_role() = 'administrator'
  );

-- Profile roles are changed only by a trusted project owner through
-- the Supabase Dashboard/SQL Editor in this rollout. No client UPDATE grant.
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_dengueyosoku_role()
  TO authenticated;

-- Alert Center data is readable only by authenticated reviewers/admins.
-- Writes remain blocked until server-side transactional RPCs are implemented.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'alert_rule_profiles',
    'alert_rule_thresholds',
    'alert_evaluation_runs',
    'alert_events',
    'alert_event_transitions'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'alert_read_reviewer_admin',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.current_dengueyosoku_role() IN (''reviewer'', ''administrator''))',
      'alert_read_reviewer_admin',
      table_name
    );
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', table_name);
  END LOOP;
END;
$$;

COMMIT;
