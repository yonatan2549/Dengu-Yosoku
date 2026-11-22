import test from "node:test";
import assert from "node:assert/strict";
import { analyzeModelRefreshObservability } from "../.next/model-refresh-observability-tests/lib/model/refresh-observability.js";

const now = new Date("2026-11-19T08:00:00.000Z");
function input(overrides = {}) {
  return {
    predictions: {
      model_revision: "a".repeat(40),
      source_repository: "https://github.com/example/dengue-model",
      generated_at_utc: "2026-11-16T12:18:02.000Z",
      coverage: { forecast_week: "2026-11-15" },
      freshness: {
        source_retrieved_at_utc: "2026-11-16T11:20:48.000Z",
        converted_at_utc: "2026-11-16T12:18:02.000Z",
        current_week_start_at_conversion: "2026-11-15",
        forecast_lag_weeks_at_conversion: 0,
      },
    },
    metrics: {
      model_revision: "a".repeat(40),
      source_repository: "https://github.com/example/dengue-model",
    },
    currentWeekStart: "2026-11-15",
    ...overrides,
  };
}

test("accepts a current forecast with matching provenance and ordered timestamps", () => {
  const report = analyzeModelRefreshObservability(input(), now);
  assert.equal(report.status, "ready");
  assert.equal(report.forecastLagWeeks, 0);
  assert.equal(report.sourceToConversionMinutes, 57.23);
});

test("blocks a stale epidemiological forecast even when the artifact was generated recently", () => {
  const value = input();
  value.predictions.coverage.forecast_week = "2026-10-25";
  value.predictions.freshness.current_week_start_at_conversion = "2026-11-15";
  value.predictions.freshness.forecast_lag_weeks_at_conversion = 3;
  const report = analyzeModelRefreshObservability(value, now);
  assert.equal(report.status, "blocked");
  assert.equal(report.forecastLagWeeks, 3);
  assert.equal(report.generationCurrentButForecastStale, true);
});

test("blocks mismatched model revisions", () => {
  const value = input();
  value.metrics.model_revision = "b".repeat(40);
  assert.equal(analyzeModelRefreshObservability(value, now).status, "blocked");
});

test("blocks mismatched source repositories", () => {
  const value = input();
  value.metrics.source_repository = "https://github.com/other/model";
  assert.equal(analyzeModelRefreshObservability(value, now).status, "blocked");
});

test("warns when source retrieval timestamp is missing without inventing an SLA", () => {
  const value = input();
  value.predictions.freshness.source_retrieved_at_utc = null;
  const report = analyzeModelRefreshObservability(value, now);
  assert.equal(report.status, "warning");
  assert.equal(report.sourceAgeHours, null);
  assert.ok(report.note.includes("ไม่มี SLA"));
});

test("warns when conversion timestamp is missing", () => {
  const value = input();
  delete value.predictions.freshness.converted_at_utc;
  const report = analyzeModelRefreshObservability(value, now);
  assert.equal(report.status, "warning");
  assert.equal(report.sourceToConversionMinutes, null);
});

test("blocks when conversion precedes source retrieval", () => {
  const value = input();
  value.predictions.freshness.converted_at_utc = "2026-11-16T10:00:00.000Z";
  assert.equal(analyzeModelRefreshObservability(value, now).status, "blocked");
});

test("blocks when stored lag metadata disagrees with epidemiological dates", () => {
  const value = input();
  value.predictions.coverage.forecast_week = "2026-10-25";
  value.predictions.freshness.forecast_lag_weeks_at_conversion = 2;
  const report = analyzeModelRefreshObservability(value, now);
  assert.equal(report.status, "blocked");
  assert.ok(report.checks.some((check) => check.id === "conversion-lag-agreement" && check.status === "blocked"));
});

test("blocks malformed or non-Sunday forecast weeks", () => {
  const value = input();
  value.predictions.coverage.forecast_week = "2026-11-17";
  assert.equal(analyzeModelRefreshObservability(value, now).status, "blocked");
});

test("blocks timestamps without an explicit timezone", () => {
  const value = input();
  value.predictions.generated_at_utc = "2026-11-16T12:18:02";
  assert.equal(analyzeModelRefreshObservability(value, now).status, "warning");
});

test("blocks a snapshot timestamp in the future", () => {
  const value = input();
  value.predictions.freshness.converted_at_utc = "2026-11-20T12:18:02.000Z";
  value.predictions.freshness.source_retrieved_at_utc = "2026-11-16T11:20:48.000Z";
  assert.equal(analyzeModelRefreshObservability(value, now).status, "blocked");
});

test("reports a future forecast week without treating it as stale", () => {
  const value = input();
  value.predictions.coverage.forecast_week = "2026-11-22";
  value.predictions.freshness.current_week_start_at_conversion = "2026-11-15";
  value.predictions.freshness.forecast_lag_weeks_at_conversion = -1;
  const report = analyzeModelRefreshObservability(value, now);
  assert.equal(report.forecastLagWeeks, -1);
  assert.equal(report.status, "ready");
});

test("returns blocked for malformed input", () => {
  assert.equal(analyzeModelRefreshObservability(null, now).status, "blocked");
});
