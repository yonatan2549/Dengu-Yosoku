import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAlertDryRun } from "../lib/alerting/engine";
import { ALERT_RULE_PROFILE } from "../lib/alerting/profile";
import type { AlertModelSnapshot, AlertRuleProfile } from "../lib/alerting/types";

const provinceNames = Array.from({ length: 77 }, (_, index) => `จังหวัดทดสอบ${index + 1}`);

function createModel(): AlertModelSnapshot {
  return {
    model_revision: "a".repeat(40),
    source_repository: "https://github.com/johnlovepizza/DenguYosoku",
    province_count: 77,
    provinces: [...provinceNames],
    forecast: provinceNames.map((province, index) => ({
      province,
      week_start: "2026-10-25",
      prediction: index === 0 ? 12 : index === 1 ? 3 : 0.5,
    })),
    coverage: {
      forecast_rows: 77,
      forecast_week: "2026-10-25",
      history_end_week: "2026-10-18",
    },
  };
}

function createApprovedProfile(): AlertRuleProfile {
  return {
    ...ALERT_RULE_PROFILE,
    status: "approved",
    approvalReference: "TEST-APPROVAL-001",
    effectiveFromWeek: "2026-10-25",
    thresholdsByProvince: Object.fromEntries(
      provinceNames.map((province) => [province, { watch: 2, alert: 10 }]),
    ),
  };
}

test("blocks evaluation when the model snapshot is missing", () => {
  const result = evaluateAlertDryRun(null, ALERT_RULE_PROFILE, "2026-11-15");
  assert.equal(result.status, "blocked");
  assert.equal(result.candidateEvents.length, 0);
  assert.equal(result.externalNotificationsEnabled, false);
});

test("does not invent candidates while the default nationwide profile is a draft", () => {
  const result = evaluateAlertDryRun(createModel(), ALERT_RULE_PROFILE, "2026-11-15");
  assert.equal(result.status, "blocked");
  assert.equal(result.ruleProfileStatus, "draft");
  assert.equal(result.evaluatedProvinceCount, 0);
  assert.equal(result.candidateEvents.length, 0);
  assert.ok(result.blockedReasons.some((reason) => reason.includes("Rule Profile")));
  assert.equal(result.freshness, "stale");
  assert.equal(result.forecastLagWeeks, 3);
  assert.equal(result.externalNotificationsEnabled, false);
});

test("creates simulated WATCH and ALERT candidates only for an approved complete profile", () => {
  const result = evaluateAlertDryRun(createModel(), createApprovedProfile(), "2026-10-25");
  assert.equal(result.status, "evaluated");
  assert.equal(result.evaluatedProvinceCount, 77);
  assert.equal(result.watchCandidateCount, 1);
  assert.equal(result.alertCandidateCount, 1);
  assert.equal(result.candidateEvents.length, 2);
  assert.ok(result.candidateEvents.every((event) => event.delivery === "not_sent_dry_run_only"));
  assert.equal(result.externalNotificationsEnabled, false);
});

test("blocks invalid province thresholds where alert is not above watch", () => {
  const profile = createApprovedProfile();
  profile.thresholdsByProvince[provinceNames[0]] = { watch: 5, alert: 4 };
  const result = evaluateAlertDryRun(createModel(), profile, "2026-10-25");
  assert.equal(result.status, "blocked");
  assert.equal(result.candidateEvents.length, 0);
  assert.ok(result.blockedReasons.some((reason) => reason.includes("เกณฑ์ที่ไม่ถูกต้อง")));
});

test("blocks incomplete forecast coverage", () => {
  const model = createModel();
  model.forecast.pop();
  const result = evaluateAlertDryRun(model, createApprovedProfile(), "2026-10-25");
  assert.equal(result.status, "blocked");
  assert.equal(result.forecastProvinceCount, 76);
  assert.equal(result.candidateEvents.length, 0);
});
