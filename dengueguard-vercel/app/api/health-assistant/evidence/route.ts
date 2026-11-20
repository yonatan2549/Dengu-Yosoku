import { NextResponse } from "next/server";
import { buildHealthEvidencePackage } from "@/lib/health-assistant/evidence";
import { retrieveHealthKnowledgeChunks } from "@/lib/health-assistant/chunk-retrieval";
import { validateKnowledgeQuery } from "@/lib/health-assistant/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "คำขอต้องอยู่ในรูปแบบ JSON" }, { status: 400 });
  }

  const validated = validateKnowledgeQuery(body);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  try {
    const evidence = buildHealthEvidencePackage(validated.query);
    const evidencePassages = retrieveHealthKnowledgeChunks(validated.query, 8);
    return NextResponse.json({
      ...evidence,
      evidencePassages,
      retrievalMethod: "curated-registry-lexical",
      fullDocumentRag: false,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถเตรียมเอกสารอ้างอิงได้" }, { status: 500 });
  }
}
