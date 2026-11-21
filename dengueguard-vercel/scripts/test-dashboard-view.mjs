import assert from "node:assert/strict";
import { createRequire } from "node:module";
import testRunner from "node:test";

const require = createRequire(import.meta.url);
const { resolveDashboardDatasetView, resolvePreventionDatasetView } = require("../.next/dashboard-view-tests/lib/dashboard-view.js");

testRunner("auto selects the nationwide model when a validated snapshot exists", () => {
  assert.equal(resolveDashboardDatasetView("auto", true), "model");
});

testRunner("auto falls back to the legacy dashboard when no valid model exists", () => {
  assert.equal(resolveDashboardDatasetView("auto", false), "legacy");
});

testRunner("an explicit legacy selection remains respected", () => {
  assert.equal(resolveDashboardDatasetView("legacy", true), "legacy");
});

testRunner("an explicit model selection opens the national model", () => {
  assert.equal(resolveDashboardDatasetView("model", true), "model");
});

testRunner("an unavailable model selection safely falls back to legacy", () => {
  assert.equal(resolveDashboardDatasetView("model", false), "legacy");
});

testRunner("prevention auto-selects only an approved, current nationwide model", () => {
  assert.equal(resolvePreventionDatasetView("auto", true, true, true), "model");
  assert.equal(resolvePreventionDatasetView("auto", true, false, true), "legacy");
});

testRunner("prevention never auto-selects a review-only model, even for the current week", () => {
  assert.equal(resolvePreventionDatasetView("auto", true, true, false), "legacy");
  assert.equal(resolvePreventionDatasetView("auto", true, false, false), "legacy");
});

testRunner("prevention can explicitly review a review-only or stale model snapshot", () => {
  assert.equal(resolvePreventionDatasetView("model", true, true, false), "model");
  assert.equal(resolvePreventionDatasetView("model", true, false, false), "model");
});

testRunner("prevention safely falls back when the model snapshot is missing", () => {
  assert.equal(resolvePreventionDatasetView("auto", false, true, true), "legacy");
  assert.equal(resolvePreventionDatasetView("model", false, true, false), "legacy");
});
