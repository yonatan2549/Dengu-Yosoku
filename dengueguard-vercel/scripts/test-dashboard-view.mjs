import assert from "node:assert/strict";
import { createRequire } from "node:module";
import testRunner from "node:test";

const require = createRequire(import.meta.url);
const { resolveDashboardDatasetView } = require("../.next/dashboard-view-tests/lib/dashboard-view.js");

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
