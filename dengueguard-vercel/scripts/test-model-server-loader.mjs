import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loadPublicModelArtifacts } = require("../.next/model-server-loader-tests/lib/model/server-loader.js");
const originalFetch = globalThis.fetch;

test.afterEach(() => { globalThis.fetch = originalFetch; });

test("loads predictions and metrics from the same deployment origin with SHA-256", async () => {
  const predictionText = JSON.stringify({ model: "snapshot" });
  const metricsText = JSON.stringify({ metrics: { mae: 1 } });
  globalThis.fetch = async (url) => new Response(String(url).endsWith("model_predictions.json") ? predictionText : metricsText, { status: 200 });
  const result = await loadPublicModelArtifacts("https://dengue.example");
  assert.deepEqual(result.predictions, { model: "snapshot" });
  assert.deepEqual(result.metrics, { metrics: { mae: 1 } });
  assert.equal(result.predictionsSha256, createHash("sha256").update(predictionText).digest("hex"));
  assert.equal(result.metricsSha256, createHash("sha256").update(metricsText).digest("hex"));
});

test("reports missing optional metrics file without failing snapshot retrieval", async () => {
  globalThis.fetch = async (url) => String(url).endsWith("model_metrics.json")
    ? new Response("", { status: 404 })
    : new Response(JSON.stringify({ forecast: [] }), { status: 200 });
  const result = await loadPublicModelArtifacts("https://dengue.example");
  assert.deepEqual(result.predictions, { forecast: [] });
  assert.equal(result.metrics, null);
  assert.equal(result.metricsSha256, null);
});

test("rejects invalid JSON rather than silently accepting it", async () => {
  globalThis.fetch = async () => new Response("{invalid", { status: 200 });
  await assert.rejects(() => loadPublicModelArtifacts("https://dengue.example"));
});

test("rejects an oversized model artifact", async () => {
  globalThis.fetch = async () => new Response("x".repeat(30 * 1024 * 1024 + 1), { status: 200 });
  await assert.rejects(() => loadPublicModelArtifacts("https://dengue.example"), /มีขนาดใหญ่เกิน 30 MB/);
});

test("propagates fetch/network failures to the diagnostics API", async () => {
  globalThis.fetch = async () => { throw new Error("network unavailable"); };
  await assert.rejects(() => loadPublicModelArtifacts("https://dengue.example"), /network unavailable/);
});
