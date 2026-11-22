import { createHash } from "node:crypto";

export interface LoadedModelArtifacts {
  predictions: unknown | null;
  metrics: unknown | null;
  predictionsSha256: string | null;
  metricsSha256: string | null;
}

async function fetchJsonAsset(origin: string, pathname: string): Promise<{ value: unknown | null; digest: string | null }> {
  const url = new URL(pathname, origin);
  const response = await fetch(url, { cache: "no-store", redirect: "error" });
  if (response.status === 404) return { value: null, digest: null };
  if (!response.ok) throw new Error(`โหลด ${pathname} ไม่สำเร็จ (HTTP ${response.status})`);
  const text = await response.text();
  if (text.length > 30 * 1024 * 1024) throw new Error(`ไฟล์ ${pathname} มีขนาดเกิน 30 MB`);
  const value: unknown = JSON.parse(text);
  const digest = createHash("sha256").update(text, "utf8").digest("hex");
  return { value, digest };
}

/** Reads the deployed public model artifacts from the same origin as this request. */
export async function loadPublicModelArtifacts(origin: string): Promise<LoadedModelArtifacts> {
  const [predictions, metrics] = await Promise.all([
    fetchJsonAsset(origin, "/data/model_predictions.json"),
    fetchJsonAsset(origin, "/data/model_metrics.json"),
  ]);
  return {
    predictions: predictions.value,
    metrics: metrics.value,
    predictionsSha256: predictions.digest,
    metricsSha256: metrics.digest,
  };
}
