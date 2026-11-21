import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/health-assistant/request-body";
import { searchHealthKnowledge, validateKnowledgeQuery } from "@/lib/health-assistant/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsedBody = await readBoundedJson(request);
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, {
      status: parsedBody.status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  const validated = validateKnowledgeQuery(parsedBody.value);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const results = searchHealthKnowledge(validated.query, 5);
  return NextResponse.json({
    mode: "retrieval-only",
    generatedAnswer: false,
    reviewStatus: "awaiting_clinical_review",
    query: validated.query,
    results,
    message: results.length
      ? "พบเอกสารที่เกี่ยวข้อง โปรดเปิดอ่านแหล่งข้อมูลต้นฉบับและพิจารณาวันที่เผยแพร่"
      : "ยังไม่พบเอกสารที่ตรงกับคำค้นนี้ อย่าใช้ผลค้นหาที่ไม่พบเป็นข้อสรุปทางการแพทย์",
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
