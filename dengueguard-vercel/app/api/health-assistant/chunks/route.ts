import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/health-assistant/request-body";
import { retrieveHealthKnowledgeChunks } from "@/lib/health-assistant/chunk-retrieval";
import { validateKnowledgeQuery } from "@/lib/health-assistant/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  const passages = retrieveHealthKnowledgeChunks(validated.query, 8);
  return NextResponse.json({
    mode: "curated-registry-chunk-retrieval",
    retrievalMethod: "lexical-registry-chunks",
    fullDocumentRag: false,
    clinicalReviewStatus: "awaiting_clinical_review",
    generatedAnswer: false,
    query: validated.query,
    passages,
    message: passages.length
      ? "พบข้อความจาก Summary/Key Points ในทะเบียนความรู้ โปรดเปิดเอกสารต้นฉบับและตรวจสอบฉบับเต็ม"
      : "ไม่พบข้อความที่ตรงกับคำค้น ระบบจะไม่สร้างหลักฐานขึ้นเอง",
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
