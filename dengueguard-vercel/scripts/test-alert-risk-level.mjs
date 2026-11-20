import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { classifyNationwideRisk } = require("../.next/alert-engine-tests/lib/alerting/risk-level.js");
const provinces = Array.from({ length: 77 }, (_, index) => "จังหวัด" + String(index + 1).padStart(2, "0"));
const profile = {
  profileId: "national-profile",
  version: "1.0.0",
  status: "approved",
  scope: "national_77_provinces",
  metric: "weekly_predicted_cases",
  methodology: "ผ่านการทบทวนโดยผู้เชี่ยวชาญ",
  effectiveFromWeek: "2026-01-04",
  approvalReference: "REVIEW-APPROVAL-001",
  thresholdsByProvince: Object.fromEntries(provinces.map((province) => [province, { watch: 10, alert: 20 }])),
  externalNotificationsEnabled: false,
};
function model(targetWeek = "2026-11-22") {
  return {
    model_revision: "a".repeat(40),
    source_repository: "johnlovepizza/DenguYosoku",
    generated_at_utc: "2026-11-20T10:00:00.000Z",
    source_retrieved_at_utc: null,
    province_count: 77,
    provinces,
    forecast: provinces.map((province, index) => ({
      province,
      week_start: targetWeek,
      prediction: index === 0 ? 5 : index === 1 ? 15 : 25,
    })),
    coverage: { forecast_rows: 77, forecast_week: targetWeek, history_end_week: "2026-11-15" },
  };
}

test("classifies all 77 provinces only after approval, coverage, threshold and freshness gates pass", () => {
  const result = classifyNationwideRisk(model(), profile, "2026-11-22");
  assert.equal(result.status, "classified");
  assert.equal(result.rows.length, 77);
  assert.equal(result.rows[0].level, "ปกติ");
  assert.equal(result.rows[1].level, "เฝ้าระวัง");
  assert.equal(result.rows[2].level, "เตือนระบาด");
});

test("does not emit province levels for a draft profile", () => {
  const result = classifyNationwideRisk(model(), { ...profile, status: "draft", approvalReference: null }, "2026-11-22");
  assert.equal(result.status, "unclassified");
  assert.deepEqual(result.rows, []);
});

test("does not emit province levels for stale or incomplete threshold sets", () => {
  const stale = classifyNationwideRisk(model("2026-11-08"), profile, "2026-11-22");
  const incomplete = classifyNationwideRisk(model(), {
    ...profile,
    thresholdsByProvince: Object.fromEntries(provinces.slice(1).map((province) => [province, { watch: 10, alert: 20 }])),
  }, "2026-11-22");
  assert.equal(stale.status, "unclassified");
  assert.equal(incomplete.status, "unclassified");
  assert.deepEqual(stale.rows, []);
  assert.deepEqual(incomplete.rows, []);
});
