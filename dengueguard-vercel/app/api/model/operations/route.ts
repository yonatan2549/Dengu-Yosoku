import { NextResponse } from "next/server";
import { evaluateModelOperations, getCurrentEpiWeekStartBangkok } from "@/lib/model/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readPublishedJson<T>(request: Request, fileName: string): Promise<T> {
  const url = new URL(`/data/${fileName}`, request.url);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`MODEL_FILE_UNAVAILABLE:${fileName}`);
  return (await response.json()) as T;
}

export async function GET(request: Request) {
  try {
    const [predictions, metrics] = await Promise.all([
      readPublishedJson<Parameters<typeof evaluateModelOperations>[0]["predictions"]>(request, "model_predictions.json"),
      readPublishedJson<Parameters<typeof evaluateModelOperations>[0]["metrics"]>(request, "model_metrics.json"),
    ]);
    if (!predictions || typeof predictions !== "object" || Array.isArray(predictions) ||
        !metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
      return NextResponse.json({ error: "รูปแบบ Model Snapshot ไม่ถูกต้อง" }, { status: 422 });
    }

    const report = evaluateModelOperations({
      predictions,
      metrics,
      currentWeekStart: getCurrentEpiWeekStartBangkok(),
    });
    return NextResponse.json(report, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({
      error: "อ่าน Model Snapshot ไม่สำเร็จ ตรวจว่าไฟล์ Predictions และ Metrics ถูกเผยแพร่ใน /public/data แล้วหรือไม่",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
