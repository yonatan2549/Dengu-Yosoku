import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { ALERT_RULE_PROFILE } = require("../.next/alert-engine-tests/lib/alerting/profile.js");
const { evaluateAlertDryRun } = require("../.next/alert-engine-tests/lib/alerting/engine.js");
const { classifyNationwideRisk } = require("../.next/alert-engine-tests/lib/alerting/risk-level.js");
const sourceCandidate = JSON.parse(readFileSync(new URL("../public/data/alert_threshold_candidates_77.json", import.meta.url), "utf8"));
const provinces = sourceCandidate.thresholds.map((item) => item.province);
const model = {
  model_revision: sourceCandidate.source.model_snapshot_revision,
  source_repository: sourceCandidate.source.source_repository,
  generated_at_utc: sourceCandidate.source.model_generated_at_utc,
  source_retrieved_at_utc: null,
  province_count: 77,
  provinces,
  forecast: sourceCandidate.thresholds.map((row) => ({
    province: row.province,
    week_start: sourceCandidate.source.forecast_week,
    prediction: row.watch,
  })),
  coverage: {
    forecast_rows: 77,
    forecast_week: sourceCandidate.source.forecast_week,
    history_end_week: sourceCandidate.source.history_end_week,
  },
};

test("application Rule Profile maps all 77 candidate thresholds exactly", () => {
  assert.equal(ALERT_RULE_PROFILE.status, "draft");
  assert.equal(ALERT_RULE_PROFILE.version, "0.1.0-draft");
  assert.equal(Object.keys(ALERT_RULE_PROFILE.thresholdsByProvince).length, 77);
  for (const row of sourceCandidate.thresholds) {
    assert.deepEqual(ALERT_RULE_PROFILE.thresholdsByProvince[row.province], {
      watch: row.watch,
      alert: row.alert,
    });
  }
});

test("the candidate remains Draft with no approval or effective date", () => {
  assert.equal(ALERT_RULE_PROFILE.approvalReference, null);
  assert.equal(ALERT_RULE_PROFILE.effectiveFromWeek, null);
  assert.equal(ALERT_RULE_PROFILE.externalNotificationsEnabled, false);
  assert.equal(sourceCandidate.governance.approval_status, "not_approved");
  assert.equal(sourceCandidate.governance.human_independent_review_status, "not_performed");
  assert.equal(sourceCandidate.governance.may_create_alert_candidates, false);
  assert.equal(sourceCandidate.governance.may_classify_national_risk, false);
});

test("complete 77-province coverage does not bypass Draft approval or stale-model gates", () => {
  const report = evaluateAlertDryRun(model, ALERT_RULE_PROFILE, "2026-11-22");
  const checks = Object.fromEntries(report.checks.map((item) => [item.id, item]));
  assert.equal(report.status, "blocked");
  assert.equal(checks["forecast-coverage"].status, "pass");
  assert.equal(checks["threshold-coverage"].status, "pass");
  assert.equal(checks["rule-approval"].status, "blocked");
  assert.equal(checks["forecast-freshness"].status, "blocked");
  assert.equal(report.externalNotificationsEnabled, false);
  assert.deepEqual(report.candidateEvents, []);
});

test("nationwide risk remains unclassified for a complete Draft candidate", () => {
  const result = classifyNationwideRisk(model, ALERT_RULE_PROFILE, "2026-11-22");
  assert.equal(result.status, "unclassified");
  assert.deepEqual(result.rows, []);
});

test("runtime profile uses the application candidate only for an empty Draft DB profile", () => {
  const source = readFileSync(new URL("../lib/alerting/server-profile.ts", import.meta.url), "utf8");
  assert.match(source, /row\.status === "draft"/);
  assert.match(source, /thresholdPayload\.length === 0/);
  assert.match(source, /source: useApplicationCandidate \? "application_fallback" : "database"/);
  assert.match(source, /thresholdsByProvince: useApplicationCandidate/);
});
