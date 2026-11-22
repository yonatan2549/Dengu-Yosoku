import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { analyzeModelTemporalPerformance } = require("../.next/model-temporal-monitor-tests/lib/model/temporal-monitor.js");

const provinces = Array.from({ length: 77 }, (_, index) => `Province ${String(index + 1).padStart(2, "0")}`);
function weekDate(index) {
  const date = new Date(Date.UTC(2026, 0, 4 + index * 7));
  return date.toISOString().slice(0, 10);
}
function fixture(options = {}) {
  const weeks = options.weeks ?? 10;
  const rows = [];
  for (let week = 0; week < weeks; week += 1) {
    const currentWeek = weekDate(week);
    for (let provinceIndex = 0; provinceIndex < provinces.length; provinceIndex += 1) {
      if (options.incompleteLastWeek && week === weeks - 1 && provinceIndex === 76) continue;
      const actual = 10 + week + (provinceIndex % 5);
      const error = week >= weeks - 4 ? 2 : 1;
      rows.push({
        province: provinces[provinceIndex], week_start: currentWeek, actual_cases: actual,
        prediction: actual + (provinceIndex === 0 ? error * 3 : error),
        persistence: actual + 2, seasonal_naive: actual + 3, climatology: actual + 4,
      });
    }
  }
  return {
    model_revision: "487201850cf4",
    source_repository: "https://github.com/example/dengue",
    province_count: 77,
    provinces,
    history: rows,
    ...(options.overrides ?? {}),
  };
}

test("compares the latest four complete weeks with the preceding four weeks", () => {
  const report = analyzeModelTemporalPerformance(fixture());
  assert.equal(report.status, "ready");
  assert.equal(report.completeWeekCount, 10);
  assert.equal(report.comparison?.previous.prediction.sampleCount, 308);
  assert.equal(report.comparison?.recent.prediction.sampleCount, 308);
  assert.equal(report.comparison?.modelMaeDirection, "higher-error");
});

test("reports model and three baseline metrics separately", () => {
  const report = analyzeModelTemporalPerformance(fixture());
  assert.ok(report.comparison);
  for (const metric of ["prediction", "persistence", "seasonal_naive", "climatology"]) {
    assert.equal(report.comparison?.recent[metric].sampleCount, 308);
    assert.ok(Number.isFinite(report.comparison?.recent[metric].mae));
    assert.ok(Number.isFinite(report.comparison?.recent[metric].rmse));
    assert.ok(Number.isFinite(report.comparison?.recent[metric].bias));
  }
});

test("creates province summaries across complete holdout weeks", () => {
  const report = analyzeModelTemporalPerformance(fixture());
  assert.equal(report.provincePerformance.length, 10);
  assert.equal(report.provincePerformance[0].province, "Province 01");
  assert.equal(report.provincePerformance[0].sampleCount, 10);
});

test("returns the last twelve weekly summaries at most", () => {
  const report = analyzeModelTemporalPerformance(fixture({ weeks: 14 }));
  assert.equal(report.weekly.length, 12);
  assert.equal(report.weekly.at(-1)?.weekStart, weekDate(13));
});

test("excludes incomplete weeks from comparison and makes the report a warning", () => {
  const report = analyzeModelTemporalPerformance(fixture({ incompleteLastWeek: true }));
  assert.equal(report.status, "warning");
  assert.equal(report.incompleteWeekCount, 1);
  assert.equal(report.completeWeekCount, 9);
});

test("does not infer drift from fewer than eight complete weeks", () => {
  const report = analyzeModelTemporalPerformance(fixture({ weeks: 7 }));
  assert.equal(report.status, "warning");
  assert.equal(report.comparison, null);
  assert.ok(report.issues.some((issue) => issue.includes("อย่างน้อย 8 สัปดาห์")));
});

test("blocks duplicate province-week rows", () => {
  const input = fixture();
  input.history.push(input.history[0]);
  const report = analyzeModelTemporalPerformance(input);
  assert.equal(report.status, "blocked");
  assert.ok(report.issues.some((issue) => issue.includes("ซ้ำ")));
});

test("blocks unknown provinces", () => {
  const input = fixture();
  input.history[0].province = "Unknown Province";
  const report = analyzeModelTemporalPerformance(input);
  assert.equal(report.status, "blocked");
  assert.ok(report.issues.some((issue) => issue.includes("ไม่อยู่ในรายชื่อหลัก")));
});

test("blocks a malformed epidemiological week", () => {
  const input = fixture();
  input.history[0].week_start = "2026-01-05";
  const report = analyzeModelTemporalPerformance(input);
  assert.equal(report.status, "blocked");
});

test("blocks negative and non-finite observations or predictions", () => {
  const negative = fixture();
  negative.history[0].prediction = -1;
  assert.equal(analyzeModelTemporalPerformance(negative).status, "blocked");
  const invalid = fixture();
  invalid.history[0].actual_cases = Number.NaN;
  assert.equal(analyzeModelTemporalPerformance(invalid).status, "blocked");
});

test("blocks a non-canonical 77-province list", () => {
  const input = fixture();
  input.provinces = provinces.slice(1);
  assert.equal(analyzeModelTemporalPerformance(input).status, "blocked");
});

test("blocks missing model provenance", () => {
  const input = fixture();
  input.model_revision = null;
  assert.equal(analyzeModelTemporalPerformance(input).status, "blocked");
});

test("does not apply an automatic drift threshold or create an alert", () => {
  const report = analyzeModelTemporalPerformance(fixture());
  assert.match(report.note, /ไม่ใช้เกณฑ์ drift อัตโนมัติ/);
  assert.match(report.note, /ไม่สร้าง Alert Candidate/);
});
