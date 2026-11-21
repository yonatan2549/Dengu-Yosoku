import { NextResponse } from "next/server";
import { evaluateHealthKnowledgeGovernance } from "@/lib/health-assistant/governance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const report = evaluateHealthKnowledgeGovernance();
    return NextResponse.json({ ...report, observedAt: new Date().toISOString(), readOnly: true }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถตรวจสอบสถานะคลังความรู้ได้ในขณะนี้" }, {
      status: 500,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
