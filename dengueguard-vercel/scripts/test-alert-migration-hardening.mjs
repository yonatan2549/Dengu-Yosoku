import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../database/migrations/007_alert_security_hardening.sql", import.meta.url),
  "utf8",
);

test("migration is transactional and repeatable for missing pending-review guards", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.prevent_pending_alert_rule_draft_mutation\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.prevent_pending_alert_rule_draft_mutation\(\)\s+FROM PUBLIC, anon, authenticated;/);
});

test("restores the threshold pending-review lock for insert, update and delete", () => {
  assert.match(
    migration,
    /CREATE TRIGGER alert_rule_thresholds_lock_pending_review\s+BEFORE INSERT OR UPDATE OR DELETE ON public\.alert_rule_thresholds\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.prevent_pending_alert_rule_draft_mutation\(\);/,
  );
});

test("restores the Draft methodology lock while a review is pending", () => {
  assert.match(
    migration,
    /CREATE TRIGGER alert_rule_profile_lock_pending_review\s+BEFORE UPDATE OF methodology ON public\.alert_rule_profiles\s+FOR EACH ROW\s+WHEN \(OLD\.status = 'draft'\)\s+EXECUTE FUNCTION public\.prevent_pending_alert_rule_draft_mutation\(\);/,
  );
});

test("pins the pending-review trigger function to an empty search path", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.prevent_pending_alert_rule_draft_mutation\(\)[\s\S]*?SECURITY DEFINER\s+SET search_path = ''/,
  );
});

test("pins mutable trigger functions and privileged RPCs to an empty search path", () => {
  const functions = [
    "prevent_approved_alert_profile_mutation",
    "prevent_alert_transition_history_mutation",
    "prevent_alert_rule_draft_history_mutation",
    "prevent_alert_rule_review_decision_mutation",
    "prevent_approved_alert_threshold_mutation",
    "create_dengueyosoku_user_profile",
    "current_dengueyosoku_role",
    "dengueyosoku_record_alert_evaluation",
    "dengueyosoku_transition_alert_event",
    "dengueyosoku_save_alert_rule_draft",
    "dengueyosoku_review_alert_rule_request",
  ];

  for (const name of functions) {
    const escaped = name.replace(/[.*+?^?{}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `ALTER FUNCTION public\\.${escaped}\\([\\s\\S]*?\\)\\s+SET search_path = '';`,
      "m",
    );
    assert.match(migration, pattern, `missing fixed search_path for ${name}`);
  }
});

test("revokes anonymous role-check and auth-trigger function execution but preserves required grants", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_dengueyosoku_user_profile\(\)\s+FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_dengueyosoku_user_profile\(\)\s+TO supabase_auth_admin, service_role;/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.current_dengueyosoku_role\(\)\s+FROM PUBLIC, anon;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.current_dengueyosoku_role\(\)\s+TO authenticated;/,
  );
});

test("keeps reviewer/admin RLS role checks wrapped in scalar subqueries", () => {
  assert.match(
    migration,
    /CREATE POLICY %I ON public\.%I FOR SELECT TO authenticated USING \(\(SELECT public\.current_dengueyosoku_role\(\)\)/,
  );
  assert.match(
    migration,
    /CREATE POLICY user_profiles_read_self_or_admin[\s\S]*?id = \(SELECT auth\.uid\(\)\)[\s\S]*?\(SELECT public\.current_dengueyosoku_role\(\)\)/,
  );
});
