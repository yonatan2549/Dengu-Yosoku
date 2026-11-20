import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loadPublicModelArtifacts } = require("../.next/model-server-loader-tests/lib/model/server-loader.js");

test("loads predictions and metrics from local assets with SHA-256 digests", async () => {
  const predictionText = JSON.stringify({ model: "snapshot" });
  const metricsText = JSON.stringify({ metrics: { mae: 1 } });
  const assets = new Map([
    ["model_predictions.json", predictionText],
    ["model_metrics.json", metricsText],
  ]);

  const result = await loadPublicModelArtifacts(async (fileName) => assets.get(fileName) ?? null);

  assert.deepEqual(result.predictions, { model: "snapshot" });
  assert.deepEqual(result.metrics, { metrics: { mae: 1 } });
  assert.equal(result.predictionsSha256, createHash("sha256").update(predictionText).digest("hex"));
  assert.equal(result.metricsSha256, createHash("sha256").update(metricsText).digest("hex"));
});

test("does not make a network request when reading published assets", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("unexpected network request"); };
  try {
    const result = await loadPublicModelArtifacts(async () => null);
    assert.equal(result.predictions, null);
    assert.equal(result.metrics, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports missing prediction and metrics files without throwing", async () => {
  const result = await loadPublicModelArtifacts(async () => null);
  assert.equal(result.predictions, null);
  assert.equal(result.metrics, null);
  assert.equal(result.predictionsSha256, null);
  assert.equal(result.metricsSha256, null);
});

test("reports a missing optional metrics file without failing predictions retrieval", async () => {
  const predictionText = JSON.stringify({ forecast: [] });
  const result = await loadPublicModelArtifacts(async (fileName) =>
    fileName === "model_predictions.json" ? predictionText : null
  );
  assert.deepEqual(result.predictions, { forecast: [] });
  assert.equal(result.metrics, null);
  assert.equal(result.metricsSha256, null);
});

test("rejects invalid JSON rather than silently accepting it", async () => {
  await assert.rejects(
    () => loadPublicModelArtifacts(async () => "{invalid"),
    SyntaxError,
  );
});

test("rejects an oversized model artifact", async () => {
  await assert.rejects(
    () => loadPublicModelArtifacts(async () => "x".repeat(30 * 1024 * 1024 + 1)),
    /มีขนาดใหญ่เกิน 30 MB/,
  );
});

test("propagates unexpected filesystem or reader failures", async () => {
  await assert.rejects(
    () => loadPublicModelArtifacts(async () => { throw new Error("reader unavailable"); }),
    /reader unavailable/,
  );
});
