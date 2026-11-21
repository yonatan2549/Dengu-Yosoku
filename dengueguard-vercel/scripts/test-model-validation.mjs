import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validateModelExports, toAlertModelSnapshot } = require("../.next/model-validation-tests/lib/model/validation.js");

const provinces = Array.from({ length: 77 }, (_, index) => `จังหวัด${String(index + 1).padStart(2, "0")}`);
const makeFixture = () => {
  const weeks = ["2026-01-04", "2026-01-11"];
  const history = weeks.flatMap((week, weekIndex) => provinces.map((province, index) => ({
    province, week_start: week, year: 2026, actual_cases: index + weekIndex,
    prediction: index + weekIndex + 0.5, persistence: index + weekIndex + 1,
    seasonal_naive: index + weekIndex + 1, climatology: index + 2, residual: -0.5,
  })));
  const predictions = {
    schema_version: 2, model_name: "DengueYosoku Test Model",
    source_repository: "https://github.com/example/dengue-model", model_revision: "a".repeat(40),
    generated_at_utc: "2026-01-18T02:00:00.000Z", province_count: 77, provinces: [...provinces], history,
    forecast: provinces.map((province, index) => ({ province, week_start: "2026-01-25", year: 2026, prediction: index + 1 })),
    coverage: { history_rows: 154, history_week_count: 2, history_start_week: weeks[0], history_end_week: weeks[1], forecast_rows: 77, forecast_week: "2026-01-25", forecast_is_after_history: true },
    freshness: { timezone: "Asia/Bangkok", source_retrieved_at_utc: "2026-01-18T01:00:00.000Z", converted_at_utc: "2026-01-18T02:00:00.000Z", current_week_start_at_conversion: "2026-01-18", forecast_is_current_or_future_at_conversion: true, forecast_lag_weeks_at_conversion: 0 },
    semantic_notes: {},
  };
  const metrics = {
    schema_version: 2, model_name: predictions.model_name, source_repository: predictions.source_repository,
    model_revision: predictions.model_revision, generated_at_utc: predictions.generated_at_utc,
    metrics: { mae: 1.2, rmse: 2.1, eval_cutoff: "2026-01-11", n_test: 154 },
  };
  return { predictions, metrics };
};
const currentWeek = "2026-01-18";

test("accepts a valid 77-province snapshot with matching metrics", () => {
  const f = makeFixture(); const report = validateModelExports(f.predictions, f.metrics, currentWeek);
  assert.equal(report.status, "valid"); assert.equal(report.canUseForDryRun, true);
  assert.equal(report.canUseForCurrentAlerting, true); assert.equal(report.provinceCount, 77);
});
test("reports missing prediction file", () => {
  const report = validateModelExports(null, null, currentWeek);
  assert.equal(report.status, "missing"); assert.equal(report.canUseForDryRun, false);
});
test("rejects non-object prediction payload", () => assert.equal(validateModelExports([], null, currentWeek).status, "missing"));
test("blocks an incomplete province master", () => { const f=makeFixture(); f.predictions.provinces.pop(); f.predictions.province_count=76; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks duplicate province names", () => { const f=makeFixture(); f.predictions.provinces[1]=f.predictions.provinces[0]; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks forecast missing one province", () => { const f=makeFixture(); f.predictions.forecast.pop(); f.predictions.coverage.forecast_rows=76; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks duplicate forecast province", () => { const f=makeFixture(); f.predictions.forecast[1].province=f.predictions.forecast[0].province; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks unknown province in forecast", () => { const f=makeFixture(); f.predictions.forecast[0].province="จังหวัดที่ไม่มีในรายการ"; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks negative prediction values", () => { const f=makeFixture(); f.predictions.forecast[0].prediction=-1; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks forecast week mismatch", () => { const f=makeFixture(); f.predictions.forecast[0].week_start="2026-02-01"; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks a non-Sunday forecast week", () => { const f=makeFixture(); f.predictions.coverage.forecast_week="2026-01-26"; f.predictions.forecast.forEach(r=>r.week_start="2026-01-26"); assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks forecast row count metadata mismatch", () => { const f=makeFixture(); f.predictions.coverage.forecast_rows=76; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks holdout row count metadata mismatch", () => { const f=makeFixture(); f.predictions.coverage.history_rows=153; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks duplicate province-week holdout rows", () => { const f=makeFixture(); f.predictions.history[1].province=f.predictions.history[0].province; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks incomplete province coverage in a holdout week", () => { const f=makeFixture(); f.predictions.history.pop(); f.predictions.coverage.history_rows=153; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks holdout week count mismatch", () => { const f=makeFixture(); f.predictions.coverage.history_week_count=3; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks forecast not after holdout", () => { const f=makeFixture(); f.predictions.coverage.forecast_week="2026-01-11"; f.predictions.forecast.forEach(r=>r.week_start="2026-01-11"); assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks malformed revision under schema 2", () => { const f=makeFixture(); f.predictions.model_revision="bad-sha"; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks invalid generated timestamp", () => { const f=makeFixture(); f.predictions.generated_at_utc="not-a-date"; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("blocks non-HTTPS repository URL", () => { const f=makeFixture(); f.predictions.source_repository="http://github.com/example/model"; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).status,"blocked"); });
test("warns when metrics are absent but allows display-only dry-run", () => { const f=makeFixture(); const r=validateModelExports(f.predictions,null,currentWeek); assert.equal(r.status,"warning"); assert.equal(r.canUseForDryRun,true); assert.equal(r.canUseForCurrentAlerting,false); });
test("warns when metrics revision does not match predictions", () => { const f=makeFixture(); f.metrics.model_revision="b".repeat(40); assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).metricsMatch,false); });
test("warns when metrics repository does not match predictions", () => { const f=makeFixture(); f.metrics.source_repository="https://github.com/other/model"; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).metricsMatch,false); });
test("warns when metric values are invalid", () => { const f=makeFixture(); f.metrics.metrics.mae=-1; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).metricsMatch,false); });
test("warns when test sample count does not match Holdout rows", () => { const f=makeFixture(); f.metrics.metrics.n_test=7; assert.equal(validateModelExports(f.predictions,f.metrics,currentWeek).metricsMatch,false); });
test("warns for stale forecast and blocks current alerting eligibility", () => { const f=makeFixture(); const r=validateModelExports(f.predictions,f.metrics,"2026-02-01"); assert.equal(r.freshness,"stale"); assert.equal(r.canUseForDryRun,true); assert.equal(r.canUseForCurrentAlerting,false); });
test("keeps schema v3 review-only snapshots visible but blocks current Alert eligibility", () => {
  const f = makeFixture();
  f.predictions.schema_version = 3;
  f.predictions.release_status = "review_only";
  f.metrics.schema_version = 3;
  f.metrics.release_status = "review_only";
  const report = validateModelExports(f.predictions, f.metrics, currentWeek);
  assert.equal(report.status, "warning");
  assert.equal(report.releaseStatus, "review_only");
  assert.equal(report.canUseForDryRun, true);
  assert.equal(report.canUseForCurrentAlerting, false);
  assert.equal(report.checks.find((check) => check.id === "release-approval").status, "warning");
});
test("allows a schema v3 snapshot through the approval gate only when both artifacts are approved", () => {
  const f = makeFixture();
  f.predictions.schema_version = 3;
  f.predictions.release_status = "approved";
  f.metrics.schema_version = 3;
  f.metrics.release_status = "approved";
  const report = validateModelExports(f.predictions, f.metrics, currentWeek);
  assert.equal(report.releaseStatus, "approved");
  assert.equal(report.canUseForCurrentAlerting, true);
});
test("blocks schema v3 release status mismatch between Predictions and Metrics", () => {
  const f = makeFixture();
  f.predictions.schema_version = 3;
  f.predictions.release_status = "approved";
  f.metrics.schema_version = 3;
  f.metrics.release_status = "review_only";
  const report = validateModelExports(f.predictions, f.metrics, currentWeek);
  assert.equal(report.canUseForDryRun, true);
  assert.equal(report.canUseForCurrentAlerting, false);
  assert.equal(report.checks.find((check) => check.id === "release-approval").status, "warning");
});
test("converts a validated export into the alert snapshot shape", () => { const f=makeFixture(); const s=toAlertModelSnapshot(f.predictions); assert.equal(s?.forecast.length,77); assert.equal(s?.coverage.forecast_rows,77); });
test("refuses to convert malformed exports", () => assert.equal(toAlertModelSnapshot({coverage:{},forecast:[],provinces:[]}),null));
