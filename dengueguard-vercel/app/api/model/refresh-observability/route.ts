import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentEpiWeekStartBangkok } from "@/lib/model/operations";
import { analyzeModelRefreshObservability } from "@/lib/model/refresh-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
const noStore = { "Cache-Control": "no-store, max-age=0" };

async function readArtifact(fileName: string): Promise<Record<string, unknown>> {
  const filePath = path.join(process.cwd(), "public", "data", fileName);
  const metadata = await stat(filePath);
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_ARTIFACT_BYTES) {
    throw new Error("INVALID_MODEL_ARTIFACT_SIZE");
  }
  const parsed: unknown = JSON.parse((await readFile(filePath)).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_MODEL_ARTIFACT_JSON");
  return parsed as Record<string, unknown>;
}

export async function GET() {
  try {
    const [predictions, metrics] = await Promise.all([
      readArtifact("model_predictions.json"),
      readArtifact("model_metrics.json"),
    ]);
    const report = analyzeModelRefreshObservability({
      predictions,
      metrics,
      currentWeekStart: getCurrentEpiWeekStartBangkok(),
    });
    return NextResponse.json({ ...report, readOnly: true }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const missing = message.includes("ENOENT");
    return NextResponse.json({
      error: missing
        ? "ไม่พบ Model Predictions หรือ Metrics บน Server"
        : "ไม่สามารถตรวจสอบลำดับเวลา Model Refresh ได้; ตรวจไฟล์ JSON และขนาดไฟล์",
    }, { status: missing ? 503 : 422, headers: noStore });
  }
}
