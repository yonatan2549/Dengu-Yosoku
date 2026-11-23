import test from "node:test";
import assert from "node:assert/strict";
import {
  createAlertPresentationRun,
  summarizeAlertPresentationRun,
  transitionAlertPresentationEvent,
} from "../.next/alert-presentation-demo-tests/lib/alerting/presentation-demo.js";

const provinces = Array.from({ length: 77 }, (_, index) => `จังหวัดตัวอย่าง ${String(index + 1).padStart(2, "0")}`);

function createRun(scenario = "mixed") {
  return createAlertPresentationRun({
    provinces,
    scenario,
    watchThreshold: 25,
    alertThreshold: 55,
    generatedAt: "2026-11-23T10:00:00.000Z",
    id: "test-run",
  });
}

test("mixed presentation scenario contains 77 labelled synthetic province rows", () => {
  const run = createRun();
  const summary = summarizeAlertPresentationRun(run);
  assert.equal(run.rows.length, 77);
  assert.equal(summary.alertCount, 8);
  assert.equal(summary.watchCount, 18);
  assert.equal(summary.normalCount, 51);
  assert.equal(summary.evaluatedProvinceCount, 77);
  assert.equal(run.events.length, 26);
});

test("partial presentation scenario visibly leaves 23 provinces unevaluated", () => {
  const summary = summarizeAlertPresentationRun(createRun("partial"));
  assert.equal(summary.provinceCount, 77);
  assert.equal(summary.evaluatedProvinceCount, 54);
  assert.equal(summary.missingProvinceCount, 23);
});

test("scenario distributions are deterministic", () => {
  assert.equal(summarizeAlertPresentationRun(createRun("alert-heavy")).alertCount, 18);
  assert.equal(summarizeAlertPresentationRun(createRun("watch-only")).watchCount, 26);
  assert.equal(summarizeAlertPresentationRun(createRun("normal")).alertCount, 0);
  assert.equal(summarizeAlertPresentationRun(createRun("normal")).watchCount, 0);
});

test("event lifecycle only permits valid local demo transitions", () => {
  const run = createRun();
  const first = run.events[0];
  const acknowledged = transitionAlertPresentationEvent(run.events, first.id, "acknowledge");
  assert.equal(acknowledged[0].status, "acknowledged");
  const resolved = transitionAlertPresentationEvent(acknowledged, first.id, "resolve");
  assert.equal(resolved[0].status, "resolved");
  const reopened = transitionAlertPresentationEvent(resolved, first.id, "reopen");
  assert.equal(reopened[0].status, "open");
});

test("invalid thresholds and incomplete province lists are rejected", () => {
  assert.throws(() => createAlertPresentationRun({
    provinces,
    scenario: "mixed",
    watchThreshold: 30,
    alertThreshold: 35,
    generatedAt: "2026-11-23T10:00:00.000Z",
    id: "bad",
  }));
  assert.throws(() => createAlertPresentationRun({
    provinces: provinces.slice(0, 76),
    scenario: "mixed",
    watchThreshold: 25,
    alertThreshold: 55,
    generatedAt: "2026-11-23T10:00:00.000Z",
    id: "bad",
  }));
});
