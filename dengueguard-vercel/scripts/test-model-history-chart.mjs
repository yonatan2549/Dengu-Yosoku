import test from "node:test";
import assert from "node:assert/strict";
import { buildModelTrendRows } from "../.next/model-history-chart-tests/lib/model/history-chart.js";

const historical = [
  { province: "จังหวัด ก", week_start: "2026-01-04", year: 2026, actual_cases: 10 },
  { province: "จังหวัด ก", week_start: "2026-01-11", year: 2026, actual_cases: 12 },
  { province: "จังหวัด ก", week_start: "2026-02-01", year: 2026, actual_cases: 999 },
  { province: "จังหวัด ก", week_start: "2026-02-08", year: 2026, actual_cases: 24 },
  { province: "จังหวัด ข", week_start: "2026-02-01", year: 2026, actual_cases: 5 },
];

const holdout = [
  { province: "จังหวัด ก", week_start: "2026-02-01", year: 2026, actual_cases: 20, prediction: 18, persistence: 15, seasonal_naive: 11, climatology: 9, residual: 2 },
  { province: "จังหวัด ก", week_start: "2026-02-08", year: 2026, actual_cases: 24, prediction: 22, persistence: 20, seasonal_naive: 12, climatology: 10, residual: 2 },
  { province: "จังหวัด ข", week_start: "2026-02-01", year: 2026, actual_cases: 7, prediction: 9, persistence: 6, seasonal_naive: 4, climatology: 3, residual: -2 },
];

const forecast = [
  { province: "จังหวัด ก", week_start: "2026-02-15", year: 2026, prediction: 26 },
  { province: "จังหวัด ข", week_start: "2026-02-15", year: 2026, prediction: 8 },
];

test("keeps actual history and model Holdout predictions in one yearly series", () => {
  const rows = buildModelTrendRows(holdout, historical, forecast, 2026);
  assert.deepEqual(rows.map((row) => row.weekStart), [
    "2026-01-04",
    "2026-01-11",
    "2026-02-01",
    "2026-02-08",
    "2026-02-15",
  ]);
  assert.equal(rows[0].actual, 10);
  assert.equal(rows[0].prediction, null);
  assert.equal(rows[1].actual, 12);
  assert.equal(rows[1].prediction, null);
  assert.equal(rows[2].actual, 27);
  assert.equal(rows[2].prediction, 27);
  assert.equal(rows[2].persistence, 21);
  assert.equal(rows[3].actual, 24);
  assert.equal(rows[3].prediction, 22);
  assert.equal(rows[4].actual, null);
  assert.equal(rows[4].prediction, 34);
});

test("keeps model predictions visible even when the selected table week is outside Holdout", () => {
  // A week selector is deliberately not an input to the chart builder:
  // the chart represents the selected year, not only the selected table week.
  const rows = buildModelTrendRows(holdout, historical, forecast, 2026);
  assert.equal(rows.some((row) => row.prediction !== null), true);
  assert.equal(rows.some((row) => row.actual !== null && row.prediction === null), true);
});

test("uses model-history actuals instead of double-counting duplicate snapshot actuals", () => {
  const rows = buildModelTrendRows(holdout, historical, [], 2026, "จังหวัด ก");
  const holdoutWeek = rows.find((row) => row.weekStart === "2026-02-01");
  assert.equal(holdoutWeek.actual, 20);
  assert.equal(holdoutWeek.prediction, 18);
});

test("aggregates all provinces and supports a single-province filter", () => {
  const all = buildModelTrendRows(holdout, historical, forecast, 2026);
  const provinceA = buildModelTrendRows(holdout, historical, forecast, 2026, "จังหวัด ก");
  assert.equal(all.find((row) => row.weekStart === "2026-02-01").actual, 27);
  assert.equal(provinceA.find((row) => row.weekStart === "2026-02-01").actual, 20);
  assert.equal(provinceA.find((row) => row.weekStart === "2026-02-01").prediction, 18);
});

test("shows actual-only historical years without inventing model predictions", () => {
  const rows = buildModelTrendRows([], [
    { province: "จังหวัด ก", week_start: "2025-01-05", year: 2025, actual_cases: 3 },
    { province: "จังหวัด ก", week_start: "2025-01-12", year: 2025, actual_cases: 6 },
  ], [], 2025);
  assert.equal(rows.length, 2);
  assert.equal(rows.every((row) => row.actual !== null && row.prediction === null), true);
});

test("does not turn missing prediction values into zero-valued forecast lines", () => {
  const rows = buildModelTrendRows([], historical.slice(0, 2), [], 2026);
  assert.equal(rows.every((row) => row.prediction === null), true);
  assert.equal(rows.every((row) => row.actual !== null), true);
});
