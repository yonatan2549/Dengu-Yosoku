import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { evaluateAlertDryRun } = require("../.next/alert-freshness-tests/lib/alerting/engine.js");
const provinces = Array.from({ length: 77 }, (_, index) => `จังหวัด${String(index + 1).padStart(2, "0")}`);
const profile = {
  profileId: "national-profile", version: "1.0.0", status: "approved", scope: "national_77_provinces",
  metric: "weekly_predicted_cases", methodology: "ผ่านการทบทวน", effectiveFromWeek: "2026-01-04",
  approvalReference: "RESOLUTION-001",
  thresholdsByProvince: Object.fromEntries(provinces.map((province) => [province, { watch: 10, alert: 20 }])),
  externalNotificationsEnabled: false,
};
const snapshot = {
  model_revision: "a".repeat(40), source_repository: "https://github.com/example/model",
  generated_at_utc: "2026-01-18T00:00:00.000Z", source_retrieved_at_utc: "2026-01-18T00:00:00.000Z",
  province_count: 77, provinces,
  forecast: provinces.map((province) => ({ province, week_start: "2026-01-25", prediction: 15 })),
  coverage: { forecast_rows: 77, forecast_week: "2026-01-25", history_end_week: "2026-01-11" },
};

test("stale Forecast cannot create WATCH or ALERT candidates", () => {
  const result = evaluateAlertDryRun(snapshot, profile, "2026-02-01");
  assert.equal(result.freshness, "stale"); assert.equal(result.status, "blocked");
  assert.equal(result.candidateEvents.length, 0); assert.equal(result.watchCandidateCount, 0); assert.equal(result.alertCandidateCount, 0);
});
test("current or future Forecast remains eligible when all other gates pass", () => {
  const result = evaluateAlertDryRun(snapshot, profile, "2026-01-18");
  assert.equal(result.freshness, "current_or_future"); assert.equal(result.status, "evaluated");
  assert.equal(result.watchCandidateCount, 77);
});
