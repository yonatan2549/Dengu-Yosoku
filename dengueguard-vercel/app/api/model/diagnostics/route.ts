import { NextResponse } from "next/server";
import { getCurrentEpiWeekStart } from "@/lib/utils";
import { loadPublicModelArtifacts } from "@/lib/model/server-loader";
import { validateModelExports } from "@/lib/model/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const artifacts = await loadPublicModelArtifacts();
    const report = validateModelExports(artifacts.predictions, artifacts.metrics, getCurrentEpiWeekStart());
    return NextResponse.json({
      ok: true,
      report,
      artifacts: {
        predictionsSha256: artifacts.predictionsSha256,
        metricsSha256: artifacts.metricsSha256,
        predictionsAvailable: artifacts.predictions !== null,
        metricsAvailable: artifacts.metrics !== null,
      },
      source: "deployed_public_model_exports",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "ตรวจสอบ Model Snapshot ไม่สำเร็จ",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
