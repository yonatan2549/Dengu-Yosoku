import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildModelPerformanceReport } = require("../.next/model-performance-tests/lib/model/performance.js");

const provinces = Array.from({ length: 77 }, (_, index) => `จังหวัด${String(index + 1).padStart(2, "0")}`);
const weeks = ["2026-01-04", "2026-01-11", "2026-01-18"];
function makeRows() {
  return weeks.flatMap((week, weekIndex) => provinces.map((province, provinceIndex) => {
    const actual = provinceIndex + weekIndex + 1;
    return {
      province,
      week_start: week,
      actual_cases: actual,
      prediction: actual + 1,
      persistence: actual + 2,
      seasonal_naive: actual + 3,
      climatology: actual + 4,
    };
  }));
}
const reference = {
  mae: 1,
  rmse: 1,
  baseline_mae: { persistence: 2, seasonal_naive: 3, climatology: 4 },
};
const build = (rows = makeRows(), provinceList = provinces, expectedRows = 231, expectedWeeks = 3, metrics = reference) =>
  buildModelPerformanceReport(rows, provinceList, expectedRows, expectedWeeks, metrics);

test("accepts complete 77-province holdout with matching model and baseline metrics", () => {
  const report = build();
  assert.equal(report.status, "valid");
  assert.equal(report.metricsMatch, true);
  assert.equal(report.provinceCount, 77);
  assert.equal(report.historyRows, 231);
  assert.equal(report.historyWeeks, 3);
});

test("calculates MAE, RMSE, bias and persistence skill correctly", () => {
  const { aggregate } = build();
  assert.equal(aggregate.mae, 1);
  assert.equal(aggregate.rmse, 1);
  assert.equal(aggregate.bias, 1);
  assert.equal(aggregate.persistenceMae, 2);
  assert.equal(aggregate.skillVsPersistencePct, 50);
});

test("calculates seasonal naive and climatology baselines", () => {
  const { aggregate } = build();
  assert.equal(aggregate.seasonalNaiveMae, 3);
  assert.equal(aggregate.climatologyMae, 4);
});

test("creates one province summary for each of 77 provinces", () => {
  const report = build();
  assert.equal(report.provinces.length, 77);
  assert.equal(report.provinces[0].rows, 3);
});

test("creates weekly metrics for each complete holdout week", () => {
  const report = build();
  assert.equal(report.weekly.length, 3);
  assert.equal(report.weekly[0].mae, 1);
  assert.equal(report.weekly[0].persistenceMae, 2);
  assert.equal(report.weekly[0].rows, 77);
});

test("blocks incomplete canonical province list", () => {
  const report = build(makeRows(), provinces.slice(0, 76));
  assert.equal(report.status, "blocked");
  assert.match(report.errors.join(" "), /77 จังหวัด/);
});

test("blocks duplicate canonical province names", () => {
  const list = [...provinces.slice(0, 76), provinces[0]];
  const report = build(makeRows(), list);
  assert.equal(report.status, "blocked");
});

test("blocks incorrect Holdout row count metadata", () => {
  const report = build(makeRows(), provinces, 230, 3);
  assert.equal(report.status, "blocked");
  assert.match(report.errors.join(" "), /จำนวน Holdout rows/);
});

test("blocks incorrect Holdout week count metadata", () => {
  const report = build(makeRows(), provinces, 231, 4);
  assert.equal(report.status, "blocked");
  assert.match(report.errors.join(" "), /จำนวนสัปดาห์ Holdout/);
});

test("blocks duplicate province-week rows", () => {
  const rows = makeRows();
  rows.push({ ...rows[0] });
  const report = build(rows, provinces, 232, 3);
  assert.equal(report.status, "blocked");
  assert.match(report.errors.join(" "), /ข้อมูลซ้ำ/);
});

test("blocks an unknown province in Holdout", () => {
  const rows = makeRows();
  rows[0] = { ...rows[0], province: "จังหวัดนอกโมเดล" };
  const report = build(rows);
  assert.equal(report.status, "blocked");
  assert.match(report.errors.join(" "), /ไม่อยู่ในรายชื่อ/);
});

test("blocks a week that is not a Sunday epidemiological week", () => {
  const rows = makeRows();
  rows[0] = { ...rows[0], week_start: "2026-01-05" };
  const report = build(rows);
  assert.equal(report.status, "blocked");
  assert.match(report.errors.join(" "), /วันอาทิตย์/);
});

test("blocks a missing province in one holdout week", () => {
  const rows = makeRows().filter((row) => !(row.week_start === weeks[1] && row.province === provinces[0]));
  const report = build(rows, provinces, 230, 3);
  assert.equal(report.status, "blocked");
  assert.match(report.errors.join(" "), /จังหวัดไม่ครบ/);
});

test("blocks negative observed case values", () => {
  const rows = makeRows();
  rows[0] = { ...rows[0], actual_cases: -1 };
  const report = build(rows);
  assert.equal(report.status, "blocked");
  assert.match(report.errors.join(" "), /ค่าตัวเลขผิดรูปแบบ/);
});

test("blocks negative predictions", () => {
  const rows = makeRows();
  rows[0] = { ...rows[0], prediction: -1 };
  assert.equal(build(rows).status, "blocked");
});

test("blocks non-finite persistence baseline", () => {
  const rows = makeRows();
  rows[0] = { ...rows[0], persistence: Number.NaN };
  assert.equal(build(rows).status, "blocked");
});

test("blocks when calculated MAE differs from metrics.json", () => {
  const metrics = { ...reference, mae: 1.3 };
  const report = build(makeRows(), provinces, 231, 3, metrics);
  assert.equal(report.status, "blocked");
  assert.equal(report.metricsMatch, false);
});

test("blocks when calculated RMSE differs from metrics.json", () => {
  const metrics = { ...reference, rmse: 1.3 };
  assert.equal(build(makeRows(), provinces, 231, 3, metrics).status, "blocked");
});

test("blocks when Persistence MAE differs from reported baseline", () => {
  const metrics = { ...reference, baseline_mae: { ...reference.baseline_mae, persistence: 2.4 } };
  assert.equal(build(makeRows(), provinces, 231, 3, metrics).status, "blocked");
});

test("blocks when Seasonal Naive baseline differs from reported baseline", () => {
  const metrics = { ...reference, baseline_mae: { ...reference.baseline_mae, seasonal_naive: 3.4 } };
  assert.equal(build(makeRows(), provinces, 231, 3, metrics).status, "blocked");
});

test("blocks when Climatology baseline differs from reported baseline", () => {
  const metrics = { ...reference, baseline_mae: { ...reference.baseline_mae, climatology: 4.4 } };
  assert.equal(build(makeRows(), provinces, 231, 3, metrics).status, "blocked");
});

test("returns unknown metrics agreement when reference metrics are unavailable", () => {
  const report = build(makeRows(), provinces, 231, 3, null);
  assert.equal(report.status, "valid");
  assert.equal(report.metricsMatch, null);
});

test("skill is null when the persistence baseline error is zero", () => {
  const rows = makeRows().map((row) => ({ ...row, persistence: row.actual_cases }));
  const report = build(rows, provinces, 231, 3, null);
  assert.equal(report.aggregate.skillVsPersistencePct, null);
});

test("reports over-prediction bias as positive", () => {
  const report = build();
  assert.equal(report.aggregate.bias > 0, true);
});

test("reports under-prediction bias as negative", () => {
  const rows = makeRows().map((row) => ({ ...row, prediction: row.actual_cases - 1 }));
  const report = build(rows, provinces, 231, 3, null);
  assert.equal(report.aggregate.bias, -1);
});

test("blocks an empty Holdout collection", () => {
  assert.equal(build([], provinces, 231, 3).status, "blocked");
});

test("blocks a non-array Holdout input", () => {
  assert.equal(build(null, provinces, 231, 3).status, "blocked");
});
