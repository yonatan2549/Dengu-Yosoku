import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { evaluateModelArtifactIntegrity } from "@/lib/model/release-integrity";
import { getCurrentEpiWeekStartBangkok } from "@/lib/model/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

type ArtifactMetadata = {
  fileName: string;
  exists: boolean;
  bytes: number;
  sha256: string | null;
  modifiedAt: string | null;
};

async function loadArtifact(fileName: string): Promise<{ data: Record<string, unknown>; metadata: ArtifactMetadata }> {
  const filePath = path.join(process.cwd(), "public", "data", fileName);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > MAX_ARTIFACT_BYTES) {
    throw new Error(`INVALID_ARTIFACT_SIZE:${fileName}`);
  }
  const raw = await readFile(filePath);
  const parsed: unknown = JSON.parse(raw.toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`INVALID_ARTIFACT_JSON:${fileName}`);
  }
  return {
    data: parsed as Record<string, unknown>,
    metadata: {
      fileName,
      exists: true,
      bytes: raw.byteLength,
      sha256: createHash("sha256").update(raw).digest("hex"),
      modifiedAt: fileStat.mtime.toISOString(),
    },
  };
}

export async function GET() {
  try {
    const [predictions, metrics] = await Promise.all([
      loadArtifact("model_predictions.json"),
      loadArtifact("model_metrics.json"),
    ]);
    const report = evaluateModelArtifactIntegrity({
      predictions: predictions.data,
      metrics: metrics.data,
      predictionArtifact: predictions.metadata,
      metricsArtifact: metrics.metadata,
      currentWeekStart: getCurrentEpiWeekStartBangkok(),
    });
    const manifestMaterial = `${predictions.metadata.sha256}:${metrics.metadata.sha256}`;
    const releaseFingerprint = createHash("sha256").update(manifestMaterial).digest("hex");

    return NextResponse.json({
      ...report,
      releaseFingerprint,
      observedAt: new Date().toISOString(),
      artifacts: [predictions.metadata, metrics.metadata],
      readOnly: true,
      note: "คำนวณ Fingerprint จากไฟล์ที่อยู่ใน Deployment ปัจจุบัน ไม่ได้ดาวน์โหลดหรือเปลี่ยน Model Outputs",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const isMissing = message.includes("ENOENT");
    return NextResponse.json({
      error: isMissing
        ? "ไม่พบ Model Artifact ใน public/data"
        : "ไม่สามารถตรวจสอบ Model Artifact ได้; ตรวจสอบไฟล์ JSON และขนาดไฟล์",
    }, { status: isMissing ? 503 : 422, headers: { "Cache-Control": "no-store" } });
  }
}
