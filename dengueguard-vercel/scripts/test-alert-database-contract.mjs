import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const contract = require("../.next/alert-db-tests/lib/alerting/api-contract-validation.js");

function validSnapshot() {
  return {
    model_revision: "a".repeat(40),
    source_repository: "yonatan2549/Dengu-Yosoku",
    generated_at_utc: "2026-11-18T10:00:00.000Z",
    source_retrieved_at_utc: null,
    province_count: 2,
    provinces: ["ปทุมธานี", "นนทบุรี"],
    forecast: [
      { province: "ปทุมธานี", week_start: "2026-11-15", prediction: 12.5 },
      { province: "นนทบุรี", week_start: "2026-11-15", prediction: 8 },
    ],
    coverage: { forecast_rows: 2, forecast_week: "2026-11-15", history_end_week: "2026-11-08" },
  };
}

test("accepts a well-formed model snapshot", () => {
  assert.equal(contract.parseAlertModelSnapshot(validSnapshot()).forecast.length, 2);
});

test("rejects non-object snapshots", () => {
  assert.equal(contract.parseAlertModelSnapshot(null), null);
  assert.equal(contract.parseAlertModelSnapshot([]), null);
});

test("rejects malformed model revisions", () => {
  const value = validSnapshot();
  value.model_revision = "not-a-git-sha";
  assert.equal(contract.parseAlertModelSnapshot(value), null);
});

test("allows a missing revision so the engine can report the missing provenance", () => {
  const value = validSnapshot();
  value.model_revision = null;
  assert.equal(contract.parseAlertModelSnapshot(value).model_revision, null);
});

test("rejects duplicate provinces", () => {
  const value = validSnapshot();
  value.provinces = ["ปทุมธานี", "ปทุมธานี"];
  assert.equal(contract.parseAlertModelSnapshot(value), null);
});

test("rejects forecast rows for an unknown province", () => {
  const value = validSnapshot();
  value.forecast[0].province = "จังหวัดที่ไม่อยู่ในบัญชี";
  assert.equal(contract.parseAlertModelSnapshot(value), null);
});

test("rejects negative or non-finite forecast counts", () => {
  const negative = validSnapshot();
  negative.forecast[0].prediction = -1;
  assert.equal(contract.parseAlertModelSnapshot(negative), null);
  const infinite = validSnapshot();
  infinite.forecast[0].prediction = Number.POSITIVE_INFINITY;
  assert.equal(contract.parseAlertModelSnapshot(infinite), null);
});

test("rejects invalid dates and timestamps", () => {
  const value = validSnapshot();
  value.coverage.forecast_week = "2026-02-30";
  assert.equal(contract.parseAlertModelSnapshot(value), null);
});

test("rejects duplicate or oversized forecast collections", () => {
  const value = validSnapshot();
  value.forecast = Array.from({ length: 78 }, () => ({ province: "ปทุมธานี", week_start: "2026-11-15", prediction: 1 }));
  assert.equal(contract.parseAlertModelSnapshot(value), null);
});


test("rejects duplicate forecast rows for the same province", () => {
  const value = validSnapshot();
  value.forecast[1].province = "ปทุมธานี";
  assert.equal(contract.parseAlertModelSnapshot(value), null);
});

test("rejects a forecast week or row count that disagrees with coverage metadata", () => {
  const wrongWeek = validSnapshot();
  wrongWeek.forecast[0].week_start = "2026-11-08";
  assert.equal(contract.parseAlertModelSnapshot(wrongWeek), null);
  const wrongCount = validSnapshot();
  wrongCount.coverage.forecast_rows = 1;
  assert.equal(contract.parseAlertModelSnapshot(wrongCount), null);
});


test("requires the forecast target week to be a Sunday epidemiological week", () => {
  const value = validSnapshot();
  value.coverage.forecast_week = "2026-11-17";
  value.forecast.forEach((row) => { row.week_start = "2026-11-17"; });
  assert.equal(contract.parseAlertModelSnapshot(value), null);
});

test("accepts allowed transition actions", () => {
  assert.deepEqual(contract.parseAlertTransitionRequest({ action: "acknowledge" }), { action: "acknowledge", note: "" });
  assert.deepEqual(contract.parseAlertTransitionRequest({ action: "reopen", note: " ทบทวนใหม่ " }), { action: "reopen", note: "ทบทวนใหม่" });
});

test("requires a meaningful reason to resolve an event", () => {
  assert.equal(contract.parseAlertTransitionRequest({ action: "resolve", note: "no" }), null);
  assert.deepEqual(contract.parseAlertTransitionRequest({ action: "resolve", note: "ยุติเหตุการณ์" }), { action: "resolve", note: "ยุติเหตุการณ์" });
});

test("rejects unknown transition actions and oversized notes", () => {
  assert.equal(contract.parseAlertTransitionRequest({ action: "delete" }), null);
  assert.equal(contract.parseAlertTransitionRequest({ action: "acknowledge", note: "x".repeat(1001) }), null);
});

test("validates database UUIDs", () => {
  assert.equal(contract.isDatabaseUuid("8e8ceacb-e047-491e-bc91-1ed48870fa48"), true);
  assert.equal(contract.isDatabaseUuid("not-a-uuid"), false);
});
