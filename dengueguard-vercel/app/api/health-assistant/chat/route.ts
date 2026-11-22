import { NextResponse } from "next/server";
import { buildHealthEvidencePackage, classifyHealthQuery } from "@/lib/health-assistant/evidence";
import { retrieveHealthKnowledgeChunks } from "@/lib/health-assistant/chunk-retrieval";
import {
  buildGroundedMessages,
  containsPersonalLabValue,
  shouldAbstainForHistory,
  validateChatRequest,
  validateCitedAnswer,
} from "@/lib/health-assistant/chat-contract";
import { readChatProviderConfig, requestChatCompletion } from "@/lib/health-assistant/chat-provider";
import { evaluateDraftSourcePolicy } from "@/lib/health-assistant/source-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "คำขอต้องอยู่ในรูปแบบ JSON" }, { status: 400, headers: noStore });
  }

  const validated = validateChatRequest(body);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400, headers: noStore });

  try {
    const evidence = buildHealthEvidencePackage(validated.value.query);
    const evidencePassages = retrieveHealthKnowledgeChunks(validated.value.query, 8);
    const historyNeedsAbstention = shouldAbstainForHistory(validated.value.history, (item) =>
      containsPersonalLabValue(item) ? "personal-medical" : classifyHealthQuery(item),
    );
    const currentQueryHasLabValue = containsPersonalLabValue(validated.value.query);
    if (evidence.intent !== "general-education" || currentQueryHasLabValue || evidence.results.length === 0 || historyNeedsAbstention) {
      return NextResponse.json({
        mode: "safe-abstention",
        generatedAnswer: false,
        intent: evidence.intent,
        safetyLevel: evidence.safetyLevel,
        safetyMessage: historyNeedsAbstention || currentQueryHasLabValue
          ? "คำถามหรือบริบทมีค่าผลตรวจ/ข้อมูลสุขภาพที่อาจเป็นข้อมูลเฉพาะบุคคล ระบบจึงไม่ส่งบทสนทนานี้ไปยัง AI Provider โปรดปรึกษาบุคลากรทางการแพทย์และอย่าใส่ข้อมูลสุขภาพส่วนบุคคลในแชตนี้"
          : evidence.safetyMessage,
        abstained: true,
        answer: null,
        citations: evidence.citations,
        evidencePassages,
        retrievalMethod: "curated-registry-lexical",
        fullDocumentRag: false,
        message: evidence.message,
      }, { headers: noStore });
    }

    const sourcePolicy = evaluateDraftSourcePolicy(evidence.results, evidencePassages);
    if (!sourcePolicy.allowed) {
      return NextResponse.json({
        mode: "evidence-only",
        generatedAnswer: false,
        abstained: true,
        answer: null,
        citations: evidence.citations,
        evidencePassages,
        retrievalMethod: "curated-registry-lexical",
        fullDocumentRag: false,
        sourcePolicy,
        message: "ระบบงดส่งหลักฐานไปยัง AI Provider เพราะ Metadata หรือความเชื่อมโยงกับแหล่งต้นทางยังตรวจสอบไม่ผ่าน",
      }, { headers: noStore });
    }

    // The current knowledge registry has not completed clinical review.
    // Draft answer generation is deliberately limited to local development.
    if (process.env.NODE_ENV === "production" || process.env.HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS !== "true") {
      return NextResponse.json({
        error: "ระบบถามตอบด้วย AI ยังไม่เปิดใช้งาน เอกสารความรู้ยังรอผู้เชี่ยวชาญทบทวน",
        mode: "evidence-only",
        generatedAnswer: false,
        citations: evidence.citations,
      }, { status: 503, headers: noStore });
    }

    const provider = readChatProviderConfig(process.env, process.env.NODE_ENV);
    if (!provider.ok) {
      return NextResponse.json({ error: provider.error, mode: "evidence-only", generatedAnswer: false, citations: evidence.citations }, { status: 503, headers: noStore });
    }

    const messages = buildGroundedMessages(validated.value.query, validated.value.history, evidence, evidencePassages);
    const completion = await requestChatCompletion(provider.config, messages);
    if (!completion.ok) return NextResponse.json({ error: completion.error }, { status: 502, headers: noStore });

    const checked = validateCitedAnswer(completion.answer, evidence);
    if (!checked.ok) {
      return NextResponse.json({
        mode: "safe-abstention",
        generatedAnswer: false,
        abstained: true,
        answer: null,
        citations: evidence.citations,
        message: "ระบบไม่สามารถยืนยันการอ้างอิงในคำตอบจาก AI ได้ จึงงดแสดงคำตอบแทนการคาดเดา",
      }, { headers: noStore });
    }

    return NextResponse.json({
      mode: "grounded-draft-answer",
      generatedAnswer: true,
      draftOnly: true,
      intent: evidence.intent,
      safetyLevel: "education",
      answer: checked.answer,
      citations: checked.citations,
      evidencePassages,
      retrievalMethod: "curated-registry-lexical",
      fullDocumentRag: false,
      reviewStatus: "awaiting_clinical_review",
      sourcePolicy,
      disclaimer: "คำตอบนี้เป็นร่างเพื่อการศึกษา สร้างจากสรุปหลักฐานในคลังที่ยังรอผู้เชี่ยวชาญทบทวน ไม่ใช่คำแนะนำทางการแพทย์เฉพาะบุคคล",
      abstained: false,
    }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถประมวลผลคำถามได้ในขณะนี้" }, { status: 500, headers: noStore });
  }
}
