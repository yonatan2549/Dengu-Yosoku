export interface ModelArtifactFingerprint {
  available: boolean;
  sha256: string | null;
}

export interface ModelArtifactFingerprints {
  predictions: ModelArtifactFingerprint;
  metrics: ModelArtifactFingerprint;
}

export type ModelSnapshotConsistencyStatus =
  | "match"
  | "mismatch"
  | "missing"
  | "unverifiable";

export interface ModelSnapshotConsistencyReport {
  status: ModelSnapshotConsistencyStatus;
  detail: string;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function sameArtifact(
  client: ModelArtifactFingerprint,
  server: ModelArtifactFingerprint,
): "same" | "different" | "unknown" {
  if (client.available !== server.available) return "different";
  if (!client.available && !server.available) return "same";
  if (!isSha256(client.sha256) || !isSha256(server.sha256)) return "unknown";
  return client.sha256.toLowerCase() === server.sha256.toLowerCase()
    ? "same"
    : "different";
}

/**
 * Compares the exact public model artifacts loaded by the browser with the
 * files currently served by the application server. This is a consistency
 * check only; model eligibility is still decided by validateModelExports.
 */
export function assessModelSnapshotConsistency(input: {
  client: ModelArtifactFingerprints;
  server: ModelArtifactFingerprints;
  serverDiagnosticsAvailable: boolean;
}): ModelSnapshotConsistencyReport {
  if (!input.serverDiagnosticsAvailable) {
    return {
      status: "unverifiable",
      detail: "ไม่สามารถอ่านรายงาน Model Diagnostics จาก Server ได้ จึงยังยืนยันความตรงกันของไฟล์ไม่ได้",
    };
  }

  const predictions = sameArtifact(input.client.predictions, input.server.predictions);
  const metrics = sameArtifact(input.client.metrics, input.server.metrics);

  if (predictions === "different" || metrics === "different") {
    return {
      status: "mismatch",
      detail: "ไฟล์ Model Predictions หรือ Metrics ที่เบราว์เซอร์โหลดไม่ตรงกับไฟล์ที่ Server ให้บริการ โปรดโหลดหน้าเว็บใหม่ก่อนใช้งานต่อ",
    };
  }

  if (predictions === "unknown" || metrics === "unknown") {
    return {
      status: "unverifiable",
      detail: "พบไฟล์โมเดล แต่ไม่สามารถยืนยัน SHA-256 ของทั้งฝั่งเบราว์เซอร์และ Server ได้ครบ",
    };
  }

  if (!input.client.predictions.available && !input.server.predictions.available) {
    return {
      status: "missing",
      detail: "ไม่พบ Model Predictions ทั้งในเบราว์เซอร์และ Server จึงไม่มี Snapshot กลางให้เปรียบเทียบ",
    };
  }

  return {
    status: "match",
    detail: "ไฟล์ Model Predictions และ Metrics ที่เบราว์เซอร์โหลดมี SHA-256 ตรงกับไฟล์ที่ Server ให้บริการ",
  };
}
