import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { assessModelSnapshotConsistency } = require("../.next/model-snapshot-consistency-tests/lib/model/snapshot-consistency.js");

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const artifact = (available, sha256) => ({ available, sha256 });
const input = (clientPred, serverPred, clientMetrics = artifact(false, null), serverMetrics = artifact(false, null), serverDiagnosticsAvailable = true) => ({
  client: { predictions: clientPred, metrics: clientMetrics },
  server: { predictions: serverPred, metrics: serverMetrics },
  serverDiagnosticsAvailable,
});

test("accepts identical prediction and metrics artifacts", () => {
  const result = assessModelSnapshotConsistency(input(
    artifact(true, hashA), artifact(true, hashA),
    artifact(true, hashB), artifact(true, hashB),
  ));
  assert.equal(result.status, "match");
});

test("blocks when predictions differ despite a matching model revision", () => {
  const result = assessModelSnapshotConsistency(input(
    artifact(true, hashA), artifact(true, hashB),
  ));
  assert.equal(result.status, "mismatch");
});

test("blocks when metrics artifacts differ", () => {
  const result = assessModelSnapshotConsistency(input(
    artifact(true, hashA), artifact(true, hashA),
    artifact(true, hashB), artifact(true, hashA),
  ));
  assert.equal(result.status, "mismatch");
});

test("blocks when a model artifact is present on only one side", () => {
  const result = assessModelSnapshotConsistency(input(
    artifact(true, hashA), artifact(false, null),
  ));
  assert.equal(result.status, "mismatch");
});

test("accepts matching predictions when optional metrics are absent on both sides", () => {
  const result = assessModelSnapshotConsistency(input(
    artifact(true, hashA), artifact(true, hashA),
  ));
  assert.equal(result.status, "match");
});

test("reports missing when both sides have no model predictions", () => {
  const result = assessModelSnapshotConsistency(input(
    artifact(false, null), artifact(false, null),
  ));
  assert.equal(result.status, "missing");
});

test("does not claim consistency when browser hashing is unavailable", () => {
  const result = assessModelSnapshotConsistency(input(
    artifact(true, null), artifact(true, hashA),
  ));
  assert.equal(result.status, "unverifiable");
});

test("does not claim consistency when server diagnostics are unavailable", () => {
  const result = assessModelSnapshotConsistency(input(
    artifact(true, hashA), artifact(true, hashA),
    artifact(false, null), artifact(false, null), false,
  ));
  assert.equal(result.status, "unverifiable");
});

test("compares hexadecimal fingerprints case-insensitively", () => {
  const result = assessModelSnapshotConsistency(input(
    artifact(true, hashA.toUpperCase()), artifact(true, hashA),
  ));
  assert.equal(result.status, "match");
});


test("Alert evaluation rejects missing browser fingerprints before database writes", () => {
  const source = readFileSync(new URL("../app/api/alerts/evaluations/route.ts", import.meta.url), "utf8");
  assert.match(source, /parseArtifactFingerprints\(body\.artifactFingerprints\)/);
  assert.match(source, /MODEL_FINGERPRINT_MISSING/);
  assert.match(source, /MODEL_ARTIFACT_MISMATCH/);
  assert.ok(source.indexOf("MODEL_ARTIFACT_MISMATCH") < source.indexOf("dengueyosoku_record_alert_evaluation"));
});

test("Alert Dry-run sends the browser-loaded artifact fingerprints", () => {
  const source = readFileSync(new URL("../components/AlertDryRunPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /artifactFingerprints:\s*modelArtifactFingerprints/);
  assert.match(source, /snapshot_mismatch/);
});
