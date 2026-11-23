import test from "node:test";
import assert from "node:assert/strict";
import { evaluateModelOperations, getCurrentEpiWeekStartBangkok } from "../.next/model-operations-tests/lib/model/operations.js";

const provinces = Array.from({ length: 77 }, (_, index) => `Province-${String(index + 1).padStart(2, "0")}`);
const modelRevision = "a".repeat(40);
const forecast = provinces.map((province) => ({ province, week_start: "2026-11-15", prediction: 12 }));
const base = {
  predictions: {
    schema_version: 2,
    model_name: "DenguYosoku LightGBM",
    source_repository: "https://github.com/johnlovepizza/DenguYosoku",
    model_revision: modelRevision,
    generated_at_utc: "2026-11-16T11:20:48+00:00",
    province_count: 77,
    provinces,
    forecast,
    history: [],
    coverage: { forecast_rows: 77, forecast_week: "2026-11-15", history_rows: 7238, history_week_count: 94, history_end_week: "2026-11-08" },
    freshness: { timezone: "Asia/Bangkok", converted_at_utc: "2026-11-16T11:20:48+00:00", forecast_lag_weeks_at_conversion: 0 },
  },
  metrics: {
    model_name: "DenguYosoku LightGBM",
    source_repository: "https://github.com/johnlovepizza/DenguYosoku",
    model_revision: modelRevision,
    generated_at_utc: "2026-11-16T11:20:48+00:00",
    metrics: { mae: 3.51, rmse: 6.54, eval_cutoff: "2026-11-08", n_test: 7238, features: ["temperature", "precipitation"] },
  },
  currentWeekStart: "2026-11-15",
};

test("passes a complete, current 77-province snapshot with matching provenance", () => {
  const report = evaluateModelOperations(base);
  assert.equal(report.status, "ready");
  assert.equal(report.eligibleForCurrentEvaluation, true);
  assert.equal(report.lagWeeks, 0);
  assert.ok(report.checks.every((check) => check.status === "pass"));
});

test("blocks a forecast that is three epidemiological weeks old", () => {
  const input = structuredClone(base);
  input.predictions.coverage.forecast_week = "2026-10-25";
  input.predictions.forecast = input.predictions.forecast.map((row) => ({ ...row, week_start: "2026-10-25" }));
  input.currentWeekStart = "2026-11-15";
  const report = evaluateModelOperations(input);
  assert.equal(report.status, "blocked");
  assert.equal(report.eligibleForCurrentEvaluation, false);
  assert.equal(report.lagWeeks, 3);
  assert.match(report.checks.find((item) => item.id === "freshness").detail, /3 สัปดาห์/);
});

test("blocks mismatched model revisions", () => {
  const input = structuredClone(base);
  input.metrics.model_revision = "b".repeat(40);
  assert.equal(evaluateModelOperations(input).eligibleForCurrentEvaluation, false);
});
test("blocks current operations eligibility for a schema v3 review-only snapshot", () => {
  const input = structuredClone(base);
  input.predictions.schema_version = 3;
  input.predictions.release_status = "review_only";
  const report = evaluateModelOperations(input);
  assert.equal(report.status, "blocked");
  assert.equal(report.eligibleForCurrentEvaluation, false);
  assert.equal(report.checks.find((check) => check.id === "release-approval").status, "blocked");
});
test("allows Model Operations approval gate only for an explicitly approved schema v3 snapshot", () => {
  const input = structuredClone(base);
  input.predictions.schema_version = 3;
  input.predictions.release_status = "approved";
  const report = evaluateModelOperations(input);
  assert.equal(report.eligibleForCurrentEvaluation, true);
  assert.equal(report.checks.find((check) => check.id === "release-approval").status, "pass");
});

test("blocks mismatched model repositories", () => {
  const input = structuredClone(base);
  input.metrics.source_repository = "https://example.org/other-model";
  assert.equal(evaluateModelOperations(input).checks.find((item) => item.id === "repository-match").status, "blocked");
});

test("blocks duplicate canonical provinces", () => {
  const input = structuredClone(base);
  input.predictions.provinces[1] = input.predictions.provinces[0];
  assert.equal(evaluateModelOperations(input).checks.find((item) => item.id === "province-coverage").status, "blocked");
});

test("blocks incomplete forecast coverage", () => {
  const input = structuredClone(base);
  input.predictions.forecast.pop();
  input.predictions.coverage.forecast_rows = 76;
  assert.equal(evaluateModelOperations(input).checks.find((item) => item.id === "forecast-coverage").status, "blocked");
});

test("blocks an epidemiological week that is not Sunday", () => {
  const input = structuredClone(base);
  input.predictions.coverage.forecast_week = "2026-11-16";
  assert.equal(evaluateModelOperations(input).checks.find((item) => item.id === "forecast-week").status, "blocked");
});

test("blocks a malformed current week", () => {
  const input = structuredClone(base);
  input.currentWeekStart = "2026-11-19";
  assert.equal(evaluateModelOperations(input).eligibleForCurrentEvaluation, false);
});

test("blocks impossible calendar dates even when JavaScript would roll them into Sunday", () => {
  const invalidForecastDate = structuredClone(base);
  invalidForecastDate.predictions.coverage.forecast_week = "2026-02-29";
  invalidForecastDate.predictions.forecast = invalidForecastDate.predictions.forecast.map((row) => ({ ...row, week_start: "2026-02-29" }));
  assert.equal(evaluateModelOperations(invalidForecastDate).checks.find((item) => item.id === "forecast-week").status, "blocked");

  const invalidCurrentDate = structuredClone(base);
  invalidCurrentDate.currentWeekStart = "2026-02-29";
  assert.equal(evaluateModelOperations(invalidCurrentDate).checks.find((item) => item.id === "current-week").status, "blocked");
});

test("blocks a Model Revision that is not a full 40-character commit SHA", () => {
  const input = structuredClone(base);
  input.predictions.model_revision = "487201850cf4";
  input.metrics.model_revision = "487201850cf4";
  const report = evaluateModelOperations(input);
  assert.equal(report.eligibleForCurrentEvaluation, false);
  assert.equal(report.checks.find((item) => item.id === "revision-match").status, "blocked");
});

test("blocks missing, invalid or inconsistent model metrics", () => {
  const missing = structuredClone(base);
  delete missing.metrics.metrics.mae;
  assert.equal(evaluateModelOperations(missing).checks.find((item) => item.id === "metrics-integrity").status, "blocked");

  const invalid = structuredClone(base);
  invalid.metrics.metrics.rmse = -1;
  assert.equal(evaluateModelOperations(invalid).checks.find((item) => item.id === "metrics-integrity").status, "blocked");

  const staleCutoff = structuredClone(base);
  staleCutoff.metrics.metrics.eval_cutoff = "2026-11-01";
  assert.equal(evaluateModelOperations(staleCutoff).checks.find((item) => item.id === "metrics-integrity").status, "blocked");

  const wrongSampleCount = structuredClone(base);
  wrongSampleCount.metrics.metrics.n_test = 1;
  assert.equal(evaluateModelOperations(wrongSampleCount).checks.find((item) => item.id === "metrics-integrity").status, "blocked");
});

test("blocks a forecast that is not chronologically after the Holdout", () => {
  const input = structuredClone(base);
  input.predictions.coverage.history_end_week = "2026-11-15";
  assert.equal(evaluateModelOperations(input).checks.find((item) => item.id === "forecast-chronology").status, "blocked");
});

test("marks missing snapshot generation time as warning, not fully ready", () => {
  const input = structuredClone(base);
  delete input.predictions.generated_at_utc;
  const report = evaluateModelOperations(input);
  assert.equal(report.status, "stale");
  assert.equal(report.eligibleForCurrentEvaluation, false);
});

test("allows a future forecast week but reports it accurately", () => {
  const input = structuredClone(base);
  input.predictions.coverage.forecast_week = "2026-11-22";
  input.predictions.forecast = input.predictions.forecast.map((row) => ({ ...row, week_start: "2026-11-22" }));
  const report = evaluateModelOperations(input);
  assert.equal(report.status, "ready");
  assert.equal(report.lagWeeks, -1);
});

test("calculates current epidemiological week in Asia/Bangkok timezone", () => {
  assert.equal(getCurrentEpiWeekStartBangkok(new Date("2026-11-18T20:00:00.000Z")), "2026-11-15");
});

test("blocks forecast rows whose week differs from snapshot metadata", () => {
  const input = structuredClone(base);
  input.predictions.forecast[0].week_start = "2026-11-08";
  assert.equal(evaluateModelOperations(input).checks.find((item) => item.id === "forecast-values").status, "blocked");
});

test("blocks negative or non-finite forecast predictions", () => {
  const input = structuredClone(base);
  input.predictions.forecast[0].prediction = -1;
  assert.equal(evaluateModelOperations(input).checks.find((item) => item.id === "forecast-values").status, "blocked");
});
