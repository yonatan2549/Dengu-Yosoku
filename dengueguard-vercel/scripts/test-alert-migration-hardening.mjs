import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../database/migrations/007_alert_security_hardening.sql", import.meta.url),
  "utf8",
);

function assertSearchPathPinned(prefix) {
  const start = migration.indexOf(prefix);
  assert.notEqual(start, -1, `missing function declaration: ${prefix}`);
  const functionSql = migration.slice(start, start + 500);
  assert.ok(functionSql.includes("SET search_path = ''"), `search_path is not pinned for ${prefix}`);
}

test("migration is transactional and defines the missing pending-review guard", () => {
  assert.ok(migration.includes("BEGIN;"));
  assert.ok(migration.trimEnd().endsWith("COMMIT;"));
  assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.prevent_pending_alert_rule_draft_mutation()"));
  assert.ok(migration.includes("REVOKE ALL ON FUNCTION public.prevent_pending_alert_rule_draft_mutation()"));
  assert.ok(migration.includes("FROM PUBLIC, anon, authenticated;"));
  assert.ok(migration.includes("public.alert_rule_profile_review_requests"));
  assert.ok(migration.includes("public.alert_rule_profile_review_decisions"));
});

test("restores the threshold pending-review lock for insert, update and delete", () => {
  assert.ok(migration.includes("DROP TRIGGER IF EXISTS alert_rule_thresholds_lock_pending_review"));
  assert.ok(migration.includes(
    "CREATE TRIGGER alert_rule_thresholds_lock_pending_review\n  BEFORE INSERT OR UPDATE OR DELETE ON public.alert_rule_thresholds",
  ));
  assert.ok(migration.includes("EXECUTE FUNCTION public.prevent_pending_alert_rule_draft_mutation();"));
});

test("restores the Draft methodology lock while a review is pending", () => {
  assert.ok(migration.includes("DROP TRIGGER IF EXISTS alert_rule_profile_lock_pending_review"));
  assert.ok(migration.includes(
    "CREATE TRIGGER alert_rule_profile_lock_pending_review\n  BEFORE UPDATE OF methodology ON public.alert_rule_profiles",
  ));
  assert.ok(migration.includes("WHEN (OLD.status = 'draft')"));
});

test("pins the pending-review trigger function to an empty search path", () => {
  assertSearchPathPinned("CREATE OR REPLACE FUNCTION public.prevent_pending_alert_rule_draft_mutation()");
});

test("pins mutable trigger functions and privileged RPCs to an empty search path", () => {
  const alteredFunctions = [
    "prevent_approved_alert_profile_mutation",
    "prevent_alert_transition_history_mutation",
    "prevent_alert_rule_draft_history_mutation",
    "prevent_alert_rule_review_decision_mutation",
    "create_dengueyosoku_user_profile",
    "current_dengueyosoku_role",
    "dengueyosoku_record_alert_evaluation",
    "dengueyosoku_transition_alert_event",
    "dengueyosoku_save_alert_rule_draft",
    "dengueyosoku_review_alert_rule_request",
  ];

  for (const name of alteredFunctions) {
    assertSearchPathPinned(`ALTER FUNCTION public.${name}(`);
  }

  assertSearchPathPinned("CREATE OR REPLACE FUNCTION public.prevent_approved_alert_threshold_mutation()");
});

test("revokes anonymous role-check and auth-trigger function execution but preserves required grants", () => {
  assert.ok(migration.includes(
    "REVOKE ALL ON FUNCTION public.create_dengueyosoku_user_profile()\n  FROM PUBLIC, anon, authenticated;",
  ));
  assert.ok(migration.includes(
    "GRANT EXECUTE ON FUNCTION public.create_dengueyosoku_user_profile()\n  TO supabase_auth_admin, service_role;",
  ));
  assert.ok(migration.includes(
    "REVOKE ALL ON FUNCTION public.current_dengueyosoku_role()\n  FROM PUBLIC, anon;",
  ));
  assert.ok(migration.includes(
    "GRANT EXECUTE ON FUNCTION public.current_dengueyosoku_role()\n  TO authenticated;",
  ));
});

test("keeps reviewer/admin RLS role checks wrapped in scalar subqueries", () => {
  assert.ok(migration.includes(
    "CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.current_dengueyosoku_role())",
  ));
  assert.ok(migration.includes("id = (SELECT auth.uid())"));
  assert.ok(migration.includes("(SELECT public.current_dengueyosoku_role()) = 'administrator'"));
});
