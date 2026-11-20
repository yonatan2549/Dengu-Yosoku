import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { enforceCurrentAlertEligibility } = require("../.next/model-validation-tests/lib/model/validation.js");

function sampleReport() {
  return {
    status: "evaluated", mode: "dry_run_only", ruleProfileId: "profile", ruleProfileVersion: "1.0",
    ruleProfileStatus: "approved", targetWeek: "2026-11-22", currentEpiWeek: "2026-11-22",
    freshness: "current_or_future", forecastLagWeeks: 0, forecastProvinceCount: 77,
    evaluatedProvinceCount: 77, watchCandidateCount: 4, alertCandidateCount: 2,
    externalNotificationsEnabled: false, blockedReasons: [],
    checks: [{ id: "base", label: "Base", status: "pass", detail: "ok" }],
    candidateEvents: [{ eventId: "event-1" }],
  };
}

test("keeps the report unchanged when the server confirms current-alert eligibility", () => {
  const report = sampleReport();
  assert.equal(enforceCurrentAlertEligibility(report, true, ""), report);
});

test("blocks all candidate creation when model eligibility fails", () => {
  const result = enforceCurrentAlertEligibility(sampleReport(), false, "Metrics do not match");
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.candidateEvents, []);
  assert.equal(result.watchCandidateCount, 0);
  assert.equal(result.alertCandidateCount, 0);
  assert.equal(result.evaluatedProvinceCount, 0);
});

test("records an explicit model eligibility check and blocked reason", () => {
  const result = enforceCurrentAlertEligibility(sampleReport(), false, "Forecast is stale");
  assert.ok(result.blockedReasons.includes("Forecast is stale"));
  assert.equal(result.checks.at(-1).id, "model-current-alert-eligibility");
  assert.equal(result.checks.at(-1).status, "blocked");
});

test("does not duplicate the same blocked reason", () => {
  const report = sampleReport();
  report.blockedReasons = ["Forecast is stale"];
  const result = enforceCurrentAlertEligibility(report, false, "Forecast is stale");
  assert.equal(result.blockedReasons.filter((reason) => reason === "Forecast is stale").length, 1);
});

test("external notifications remain disabled after eligibility enforcement", () => {
  const result = enforceCurrentAlertEligibility(sampleReport(), false, "Not eligible");
  assert.equal(result.externalNotificationsEnabled, false);
});
