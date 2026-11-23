import test from "node:test";
import assert from "node:assert/strict";
import { deriveModelConsumerReadiness } from "../.next/model-consumer-readiness-tests/lib/model/consumer-readiness.js";

const validation = (overrides = {}) => ({
  status: "valid",
  freshness: "current_or_future",
  canUseForDryRun: true,
  canUseForCurrentAlerting: true,
  ...overrides,
});
const consistency = (status = "match") => ({ status });
const derive = (overrides = {}) => deriveModelConsumerReadiness({
  validation: validation(overrides.validation),
  consistency: consistency(overrides.consistency ?? "match"),
  refreshStatus: overrides.refreshStatus ?? "ready",
});

test("allows current forecast context when validation, fingerprints and refresh all pass", () => {
  const report = derive();
  assert.equal(report.dashboard.status, "current-forecast");
  assert.equal(report.prevention.status, "forecast-context");
  assert.equal(report.alerts.status, "pass");
  assert.equal(report.riskClassificationAllowed, false);
});

test("keeps stale but matching snapshots historical-only and blocks current Alert data", () => {
  const report = derive({ validation: { freshness: "stale", canUseForCurrentAlerting: false }, refreshStatus: "blocked" });
  assert.equal(report.dashboard.status, "historical-only");
  assert.equal(report.prevention.status, "historical-context");
  assert.equal(report.alerts.status, "blocked");
});

test("requires reload when browser and server fingerprints mismatch", () => {
  const report = derive({ consistency: "mismatch" });
  assert.equal(report.dashboard.status, "reload-required");
  assert.equal(report.prevention.status, "general-guidance-only");
  assert.equal(report.alerts.status, "blocked");
});

test("does not call an unverifiable fingerprint current", () => {
  const report = derive({ consistency: "unverifiable" });
  assert.equal(report.dashboard.status, "reload-required");
  assert.equal(report.alerts.status, "blocked");
});

test("uses legacy fallback when no model snapshot is available", () => {
  const report = derive({ validation: { status: "missing", canUseForDryRun: false, canUseForCurrentAlerting: false }, consistency: "missing", refreshStatus: "blocked" });
  assert.equal(report.dashboard.status, "legacy-fallback");
  assert.equal(report.prevention.status, "general-guidance-only");
  assert.equal(report.alerts.status, "blocked");
});

test("uses legacy fallback for a blocked malformed model report", () => {
  const report = derive({ validation: { status: "blocked", canUseForDryRun: false, canUseForCurrentAlerting: false }, consistency: "match", refreshStatus: "ready" });
  assert.equal(report.dashboard.status, "legacy-fallback");
  assert.equal(report.alerts.status, "blocked");
});

test("does not pass Alert gate when refresh observability is warning", () => {
  const report = derive({ refreshStatus: "warning" });
  assert.equal(report.dashboard.status, "historical-only");
  assert.equal(report.alerts.status, "blocked");
});

test("does not pass Alert gate when refresh observability is unavailable", () => {
  const report = derive({ refreshStatus: "unavailable" });
  assert.equal(report.dashboard.status, "historical-only");
  assert.equal(report.alerts.status, "blocked");
});

test("does not pass Alert gate when current-alert eligibility is false", () => {
  const report = derive({ validation: { canUseForCurrentAlerting: false } });
  assert.equal(report.dashboard.status, "current-forecast");
  assert.equal(report.prevention.status, "forecast-context");
  assert.equal(report.alerts.status, "blocked");
});
test("shows review-only snapshots on Dashboard but blocks Prevention forecast context and Alert use", () => {
  const report = derive({
    validation: {
      status: "warning",
      releaseStatus: "review_only",
      canUseForDryRun: true,
      canUseForCurrentAlerting: false,
    },
  });
  assert.equal(report.dashboard.status, "current-forecast");
  assert.equal(report.prevention.status, "general-guidance-only");
  assert.equal(report.alerts.status, "blocked");
  assert.match(report.prevention.detail, /ยังไม่ได้รับการอนุมัติ/);
});

test("does not infer a risk classification even when Forecast is current", () => {
  const report = derive();
  assert.equal(report.riskClassificationAllowed, false);
  assert.match(report.prevention.detail, /ไม่มี Threshold/);
});

test("does not pass Alert gate when client/server artifact consistency is missing", () => {
  const report = derive({ consistency: "missing" });
  assert.equal(report.dashboard.status, "legacy-fallback");
  assert.equal(report.alerts.status, "blocked");
});

test("reports the distinction between model eligibility and separate Alert review", () => {
  const report = derive();
  assert.match(report.alerts.detail, /Alert Profile Readiness/);
  assert.match(report.note, /ไม่ได้อนุมัติ Threshold/);
});

test("does not enable consumers when dry-run validation is not allowed", () => {
  const report = derive({ validation: { canUseForDryRun: false, canUseForCurrentAlerting: false } });
  assert.equal(report.dashboard.status, "legacy-fallback");
  assert.equal(report.prevention.status, "general-guidance-only");
});
