import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface LoadedModelArtifacts {
  predictions: unknown | null;
  metrics: unknown | null;
  predictionsSha256: string | null;
  metricsSha256: string | null;
}

export type ModelAssetReader = (fileName: string) => Promise<string | null>;

const MAX_MODEL_ARTIFACT_BYTES = 30 * 1024 * 1024;

/**
 * Reads an artifact from this deployment's public/data directory.
 * A missing file is an expected diagnostics state, not a network failure.
 */
async function readPublishedAsset(fileName: string): Promise<string | null> {
  const filePath = path.join(process.cwd(), "public", "data", fileName);
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

async function parseJsonAsset(
  fileName: string,
  readAsset: ModelAssetReader,
): Promise<{ value: unknown | null; digest: string | null }> {
  const text = await readAsset(fileName);
  if (text === null) return { value: null, digest: null };

  if (Buffer.byteLength(text, "utf8") > MAX_MODEL_ARTIFACT_BYTES) {
    throw new Error(`ไฟล์ ${fileName} มีขนาดใหญ่เกิน 30 MB`);
  }

  const value: unknown = JSON.parse(text);
  const digest = createHash("sha256").update(text, "utf8").digest("hex");
  return { value, digest };
}

/**
 * Reads the deployed artifacts directly from the server filesystem.
 * The optional reader keeps this boundary testable without network access.
 */
export async function loadPublicModelArtifacts(
  readAsset: ModelAssetReader = readPublishedAsset,
): Promise<LoadedModelArtifacts> {
  const [predictions, metrics] = await Promise.all([
    parseJsonAsset("model_predictions.json", readAsset),
    parseJsonAsset("model_metrics.json", readAsset),
  ]);

  return {
    predictions: predictions.value,
    metrics: metrics.value,
    predictionsSha256: predictions.digest,
    metricsSha256: metrics.digest,
  };
}
