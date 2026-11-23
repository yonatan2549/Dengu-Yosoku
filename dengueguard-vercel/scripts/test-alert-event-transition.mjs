import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const contract = require("../.next/alert-transition-tests/lib/alerting/api-contract-validation.js");
const route = readFileSync(new URL("../app/api/alerts/events/[eventId]/transition/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../database/migrations/004_alert_event_server_persistence.sql", import.meta.url), "utf8");

test("accepts only the three supported lifecycle actions", () => {
  for (const action of ["acknowledge", "resolve", "reopen"]) {
    assert.deepEqual(contract.parseAlertTransitionRequest({ action, note: "valid review note" }), { action, note: "valid review note" });
  }
  assert.equal(contract.parseAlertTransitionRequest({ action: "delete", note: "" }), null);
});

test("requires a resolution reason and caps note length", () => {
  assert.equal(contract.parseAlertTransitionRequest({ action: "resolve", note: "ok" }), null);
  assert.equal(contract.parseAlertTransitionRequest({ action: "resolve", note: "เหตุผลการปิดเหตุการณ์" })?.action, "resolve");
  assert.equal(contract.parseAlertTransitionRequest({ action: "acknowledge", note: "x".repeat(1001) }), null);
});

test("accepts only canonical UUID event identifiers", () => {
  assert.equal(contract.isDatabaseUuid("00000000-0000-4000-8000-000000000000"), true);
  assert.equal(contract.isDatabaseUuid("not-a-uuid"), false);
});

test("transition API validates same-origin, reviewer role, UUID and calls database RPC", () => {
  const originGuard = route.indexOf("isSameOriginRequest(request.headers)");
  const roleGuard = route.indexOf("authorizeAlertReviewer(request)");
  const uuidGuard = route.indexOf("isDatabaseUuid(eventId)");
  const rpcCall = route.indexOf("dengueyosoku_transition_alert_event");
  assert.ok(originGuard >= 0 && roleGuard > originGuard && uuidGuard > roleGuard && rpcCall > uuidGuard);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(route, /migrationRequired: true/);
});

test("database RPC locks event row and writes append-only reviewer transition", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.dengueyosoku_transition_alert_event/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /Reviewer or administrator role is required/);
  assert.match(migration, /INSERT INTO public\.alert_event_transitions/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.dengueyosoku_transition_alert_event/);
  assert.match(migration, /p_action = 'resolve'[\s\S]*length\(btrim\(v_note\)\) < 3/);
});
