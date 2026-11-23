export interface ModelArtifactFingerprint {
  available: boolean;
  sha256: string | null;
}
export interface ModelArtifactFingerprints {
  predictions: ModelArtifactFingerprint;
  metrics: ModelArtifactFingerprint;
}
export type ModelSnapshotConsistencyStatus = "match" | "mismatch" | "missing" | "unverifiable";
export interface ModelSnapshotConsistencyReport {
  status: ModelSnapshotConsistencyStatus;
  detail: string;
}
function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}
function compareArtifact(client: ModelArtifactFingerprint, server: ModelArtifactFingerprint): "same" | "different" | "unknown" {
  if (client.available !== server.available) return "different";
  if (!client.available && !server.available) return "same";
  if (!isSha256(client.sha256) || !isSha256(server.sha256)) return "unknown";
  return client.sha256.toLowerCase() === server.sha256.toLowerCase() ? "same" : "different";
}
/** Compares the browser's files with the files currently served by the app. */
export function assessModelSnapshotConsistency(input: {
  client: ModelArtifactFingerprints;
  server: ModelArtifactFingerprints;
  serverDiagnosticsAvailable: boolean;
}): ModelSnapshotConsistencyReport {
  if (!input.serverDiagnosticsAvailable) {
    return { status: "unverifiable", detail: "ไม่สามารถตรวจสอบ Model Artifacts จากฝั่ง Server ได้" };
  }
  const predictions = compareArtifact(input.client.predictions, input.server.predictions);
  const metrics = compareArtifact(input.client.metrics, input.server.metrics);
  if (predictions === "different" || metrics === "different") {
    return { status: "mismatch", detail: "Model Predictions หรือ Metrics ที่ Browser ใช้ไม่ตรงกับไฟล์ที่ Server ให้บริการ" };
  }
  if (predictions === "unknown" || metrics === "unknown") {
    return { status: "unverifiable", detail: "ไม่สามารถยืนยัน SHA-256 ของ Model Artifacts ได้" };
  }
  if (!input.client.predictions.available && !input.server.predictions.available) {
    return { status: "missing", detail: "ไม่พบ Model Predictions บน Browser และ Server" };
  }
  return { status: "match", detail: "Model Predictions และ Metrics ตรงกับไฟล์ที่ Server ให้บริการตาม SHA-256" };
}
