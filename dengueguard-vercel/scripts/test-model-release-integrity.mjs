import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { evaluateModelArtifactIntegrity } = require("../.next/model-release-integrity-tests/lib/model/release-integrity.js");

const currentWeekStart = "2026-11-15";
const provinces = Array.from({ length: 77 }, (_, index) => `Province ${String(index + 1).padStart(2, "0")}`);

function fixture(overrides = {}) {
  const predictions = {
    schema_version: 2,
    model_revision: "487201850cf4",
    source_repository: "https://github.com/johnlovepizza/DenguYosoku",
    generated_at_utc: "2026-11-16T04:20:48.000Z",
    province_count: 77,
    provinces,
    coverage: { forecast_rows: 77, forecast_week: currentWeekStart },
    forecast: provinces.map((province) => ({ province, week_start: currentWeekStart, prediction: 12 })),
  };
  const metrics = {
    model_revision: "487201850cf4",
    source_repository: "https://github.com/johnlovepizza/DenguYosoku",
  };
  const hash = "a".repeat(64);
  const input = {
    predictions,
    metrics,
    predictionArtifact: { fileName: "model_predictions.json", exists: true, bytes: 1200, sha256: hash, modifiedAt: "2026-11-16T04:21:00.000Z" },
    metricsArtifact: { fileName: "model_metrics.json", exists: true, bytes: 800, sha256: "b".repeat(64), modifiedAt: "2026-11-16T04:21:00.000Z" },
    currentWeekStart,
  };
  return { ...input, ...overrides };
}

test("accepts intact artifacts with matching provenance and current 77-province forecast", () => {
  const report = evaluateModelArtifactIntegrity(fixture());
  assert.equal(report.status, "intact");
  assert.equal(report.eligibleForCurrentEvaluation, true);
  assert.equal(report.checks.every((check) => check.status === "pass"), true);
});

test("blocks missing predictions artifact", () => {
  const input = fixture();
  input.predictionArtifact = { ...input.predictionArtifact, exists: false, bytes: 0, sha256: null };
  const report = evaluateModelArtifactIntegrity(input);
  assert.equal(report.status, "blocked");
  assert.equal(report.eligibleForCurrentEvaluation, false);
});

test("blocks missing metrics artifact", () => {
  const input = fixture();
  input.metricsArtifact = { ...input.metricsArtifact, exists: false, bytes: 0, sha256: null };
  const report = evaluateModelArtifactIntegrity(input);
  assert.equal(report.status, "blocked");
});

test("blocks malformed SHA-256 fingerprints", () => {
  const input = fixture();
  input.predictionArtifact.sha256 = "not-a-sha";
  const report = evaluateModelArtifactIntegrity(input);
  assert.equal(report.checks.find((check) => check.id === "artifact-hashes")?.status, "blocked");
});

test("blocks mismatched model revisions", () => {
  const input = fixture();
  input.metrics = { ...input.metrics, model_revision: "different-revision" };
  const report = evaluateModelArtifactIntegrity(input);
  assert.equal(report.checks.find((check) => check.id === "revision-match")?.status, "blocked");
});

test("blocks mismatched source repositories", () => {
  const input = fixture();
  input.metrics = { ...input.metrics, source_repository: "https://github.com/other/model" };
  const report = evaluateModelArtifactIntegrity(input);
  assert.equal(report.checks.find((check) => check.id === "repository-match")?.status, "blocked");
});

test("blocks duplicate provinces", () => {
  const input = fixture();
  input.predictions = { ...input.predictions, provinces: [...provinces.slice(0, 76), provinces[0]] };
  const report = evaluateModelArtifactIntegrity(input);
  assert.equal(report.checks.find((check) => check.id === "province-coverage")?.status, "blocked");
});

test("blocks forecast coverage below 77 rows", () => {
  const input = fixture();
  input.predictions = { ...input.predictions, forecast: input.predictions.forecast.slice(0, 76) };
  const report = evaluateModelArtifactIntegrity(input);
  assert.equal(report.checks.find((check) => check.id === "province-coverage")?.status, "blocked");
});

test("blocks forecast rows with negative or non-finite predictions", () => {
  const input = fixture();
  input.predictions = { ...input.predictions, forecast: input.predictions.forecast.map((row, index) => index === 0 ? { ...row, prediction: -1 } : row) };
  const report = evaluateModelArtifactIntegrity(input);
  assert.equal(report.checks.find((check) => check.id === "forecast-row-integrity")?.status, "blocked");
});

test("blocks stale forecasts from current operational evaluation", () => {
  const input = fixture();
  const staleWeek = "2026-10-25";
  input.predictions = {
    ...input.predictions,
    coverage: { ...input.predictions.coverage, forecast_week: staleWeek },
    forecast: input.predictions.forecast.map((row) => ({ ...row, week_start: staleWeek })),
  };
  const report = evaluateModelArtifactIntegrity(input);
  assert.equal(report.status, "blocked");
  assert.equal(report.eligibleForCurrentEvaluation, false);
  assert.ok((report.lagWeeks ?? 0) > 0);
});

test("warns when the snapshot generation timestamp is missing", () => {
  const input = fixture();
  const { generated_at_utc, ...rest } = input.predictions;
  input.predictions = rest;
  const report = evaluateModelArtifactIntegrity(input);
  assert.equal(report.status, "warning");
  assert.equal(report.eligibleForCurrentEvaluation, false);
});

test("blocks artifact files larger than the configured safety limit", () => {
  const input = fixture();
  input.predictionArtifact.bytes = 51 * 1024 * 1024;
  const report = evaluateModelArtifactIntegrity(input);
  assert.equal(report.checks.find((check) => check.id === "predictions-artifact")?.status, "blocked");
});
