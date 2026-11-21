import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { analyzeModelTemporalPerformance } from "@/lib/model/temporal-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

async function readPredictions(): Promise<Record<string, unknown>> {
  const filePath = path.join(process.cwd(), "public", "data", "model_predictions.json");
  const metadata = await stat(filePath);
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_ARTIFACT_BYTES) {
    throw new Error("INVALID_MODEL_ARTIFACT_SIZE");
  }
  const raw = await readFile(filePath);
  const parsed: unknown = JSON.parse(raw.toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_MODEL_ARTIFACT_JSON");
  }
  return parsed as Record<string, unknown>;
}

export async function GET() {
  const noStore = { "Cache-Control": "no-store, max-age=0" };
  try {
    const predictions = await readPredictions();
    const report = analyzeModelTemporalPerformance(predictions);
    return NextResponse.json({ ...report, observedAt: new Date().toISOString(), readOnly: true }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const missing = message.includes("ENOENT");
    return NextResponse.json({
      error: missing
        ? "ไม่พบ public/data/model_predictions.json บน Server"
        : "ไม่สามารถอ่าน Model Holdout เพื่อวิเคราะห์แนวโน้มได้; ตรวจสอบไฟล์ JSON และขนาดไฟล์",
    }, { status: missing ? 503 : 422, headers: noStore });
  }
}
