-- DengueYosoku Alert Center: initial PostgreSQL schema
-- Requires PostgreSQL 15+.
-- Security posture: RLS is enabled on every table and no client policies are
-- created here. Until an authenticated server-side repository is configured,
-- browser/anonymous roles cannot read or write these records.

BEGIN;

CREATE TABLE IF NOT EXISTS alert_rule_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text NOT NULL,
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'approved')),
  scope text NOT NULL CHECK (scope = 'national_77_provinces'),
  metric text NOT NULL CHECK (metric = 'weekly_predicted_cases'),
  methodology text NOT NULL,
  approval_reference text,
  effective_from_week date,
  external_notifications_enabled boolean NOT NULL DEFAULT false
    CHECK (external_notifications_enabled = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  UNIQUE (profile_id, version),
  CHECK (effective_from_week IS NULL OR EXTRACT(DOW FROM effective_from_week) = 0),
  CHECK (
    status <> 'approved'
    OR (
      approval_reference IS NOT NULL
      AND length(btrim(approval_reference)) > 0
      AND effective_from_week IS NOT NULL
      AND approved_at IS NOT NULL
      AND approved_by IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS alert_rule_thresholds (
  profile_id uuid NOT NULL REFERENCES alert_rule_profiles(id) ON DELETE CASCADE,
  province_name text NOT NULL,
  watch_threshold numeric(14, 3) NOT NULL CHECK (watch_threshold >= 0),
  alert_threshold numeric(14, 3) NOT NULL CHECK (alert_threshold > watch_threshold),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, province_name),
  CHECK (length(btrim(province_name)) > 0)
);

CREATE TABLE IF NOT EXISTS alert_evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_fingerprint text NOT NULL UNIQUE,
  rule_profile_id uuid REFERENCES alert_rule_profiles(id),
  rule_profile_version text NOT NULL,
  run_status text NOT NULL CHECK (run_status IN ('blocked', 'evaluated')),
  freshness text NOT NULL CHECK (freshness IN ('current_or_future', 'stale', 'unknown')),
  forecast_lag_weeks integer CHECK (forecast_lag_weeks IS NULL OR forecast_lag_weeks >= 0),
  target_week date,
  current_epi_week date NOT NULL,
  model_repository text,
  model_revision char(40),
  model_generated_at timestamptz,
  source_retrieved_at timestamptz,
  history_end_week date,
  forecast_province_count integer NOT NULL CHECK (forecast_province_count BETWEEN 0 AND 77),
  evaluated_province_count integer NOT NULL CHECK (evaluated_province_count BETWEEN 0 AND 77),
  watch_candidate_count integer NOT NULL DEFAULT 0 CHECK (watch_candidate_count >= 0),
  alert_candidate_count integer NOT NULL DEFAULT 0 CHECK (alert_candidate_count >= 0),
  external_notifications_enabled boolean NOT NULL DEFAULT false
    CHECK (external_notifications_enabled = false),
  checks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checks) = 'array'),
  blocked_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blocked_reasons) = 'array'),
  thresholds_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(thresholds_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CHECK (target_week IS NULL OR EXTRACT(DOW FROM target_week) = 0),
  CHECK (EXTRACT(DOW FROM current_epi_week) = 0),
  CHECK (model_revision IS NULL OR model_revision ~ '^[a-f0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS alert_evaluation_runs_created_at_idx
  ON alert_evaluation_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS alert_evaluation_runs_target_week_idx
  ON alert_evaluation_runs (target_week DESC);

CREATE TABLE IF NOT EXISTS alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  province_name text NOT NULL,
  target_week date NOT NULL,
  signal_type text NOT NULL CHECK (signal_type = 'predicted_cases_threshold'),
  current_level text NOT NULL CHECK (current_level IN ('WATCH', 'ALERT')),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'acknowledged', 'resolved', 'reopened')),
  predicted_cases numeric(14, 3) NOT NULL CHECK (predicted_cases >= 0),
  triggering_threshold numeric(14, 3) NOT NULL CHECK (triggering_threshold >= 0),
  rule_profile_id uuid NOT NULL REFERENCES alert_rule_profiles(id),
  rule_profile_version text NOT NULL,
  snapshot_is_stale boolean NOT NULL,
  delivery_state text NOT NULL DEFAULT 'not_sent_dry_run_only'
    CHECK (delivery_state = 'not_sent_dry_run_only'),
  last_seen_fingerprint text NOT NULL,
  model_revision char(40),
  first_seen_run_id uuid REFERENCES alert_evaluation_runs(id),
  last_seen_run_id uuid REFERENCES alert_evaluation_runs(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (EXTRACT(DOW FROM target_week) = 0),
  CHECK (model_revision IS NULL OR model_revision ~ '^[a-f0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS alert_events_status_updated_idx
  ON alert_events (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS alert_events_province_week_idx
  ON alert_events (province_name, target_week DESC);
CREATE INDEX IF NOT EXISTS alert_events_level_idx
  ON alert_events (current_level, updated_at DESC);

CREATE TABLE IF NOT EXISTS alert_event_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES alert_events(id) ON DELETE RESTRICT,
  transition_type text NOT NULL
    CHECK (transition_type IN ('created', 'acknowledged', 'resolved', 'reopened', 'level_changed')),
  from_status text CHECK (from_status IS NULL OR from_status IN ('new', 'acknowledged', 'resolved', 'reopened')),
  to_status text CHECK (to_status IS NULL OR to_status IN ('new', 'acknowledged', 'resolved', 'reopened')),
  from_level text CHECK (from_level IS NULL OR from_level IN ('WATCH', 'ALERT')),
  to_level text CHECK (to_level IS NULL OR to_level IN ('WATCH', 'ALERT')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  evaluation_run_id uuid REFERENCES alert_evaluation_runs(id),
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (transition_type = 'level_changed' AND from_level IS NOT NULL AND to_level IS NOT NULL)
    OR transition_type <> 'level_changed'
  ),
  CHECK (
    (transition_type = 'resolved' AND length(btrim(note)) >= 3)
    OR transition_type <> 'resolved'
  )
);

CREATE INDEX IF NOT EXISTS alert_event_transitions_event_created_idx
  ON alert_event_transitions (event_id, created_at DESC);

-- Deny direct browser/anonymous access by default. Add narrowly scoped RLS
-- policies only after the identity provider and reviewer/administrator roles
-- have been selected and tested.
ALTER TABLE alert_rule_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rule_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_evaluation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_event_transitions ENABLE ROW LEVEL SECURITY;

COMMIT;
