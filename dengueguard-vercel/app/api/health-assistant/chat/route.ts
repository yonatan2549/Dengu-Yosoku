import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/health-assistant/request-body";
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
import { isDraftAnswersEnabled } from "@/lib/health-assistant/runtime-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "no-store, max-age=0" };

function providerConfig(request: Request) {
  return readChatProviderConfig(
    process.env,
    process.env.NODE_ENV,
    request.headers.get("x-vercel-oidc-token"),
  );
}

export async function GET(request: Request) {
  const provider = providerConfig(request);
  const draftAnswersEnabled = isDraftAnswersEnabled(process.env);
  const generatedAnswersEnabled = draftAnswersEnabled && provider.ok;

  return NextResponse.json({
    mode: generatedAnswersEnabled ? "grounded-ai-preview" : "evidence-only",
    generatedAnswersEnabled,
    provider: provider.ok ? "Vercel AI Gateway / OpenAI-compatible" : null,
    model: provider.ok ? provider.config.model : null,
    draftAnswersEnabled,
    reviewStatus: "awaiting_clinical_review",
    productionPolicy: "evidence-only-until-clinical-approval",
    message: generatedAnswersEnabled
      ? "พร้อมสร้างร่างคำตอบด้วย AI ใน Preview โดยอ้างอิงเฉพาะคลังความรู้ที่ผ่าน Source Policy"
      : process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview"
        ? "Production เปิดเฉพาะ Evidence-only จนกว่าคลังความรู้จะผ่านการทบทวนทางคลินิก"
        : provider.ok
          ? "พบ AI Provider แต่ยังไม่ได้เปิด HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS สำหรับสภาพแวดล้อมนี้"
          : provider.error,
  }, { headers: noStore });
}

export async function POST(request: Request) {
  const parsedBody = await readBoundedJson(request);
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status, headers: noStore });
  }

  const validated = validateChatRequest(parsedBody.value);
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

    // Explicitly enable generated draft answers in local development or in a
    // protected Vercel Preview branch. Production remains retrieval-only.
    const draftAnswersEnabled = isDraftAnswersEnabled(process.env);

    const evidenceOnlyResponse = (reason: string) => NextResponse.json({
      mode: "evidence-only",
      generatedAnswer: false,
      abstained: false,
      intent: evidence.intent,
      safetyLevel: "education",
      safetyMessage: reason,
      answer: null,
      citations: evidence.citations,
      evidencePassages,
      retrievalMethod: "curated-registry-lexical",
      fullDocumentRag: false,
      reviewStatus: "awaiting_clinical_review",
      sourcePolicy,
      message: evidence.results.length
        ? "ค้นคืนเอกสารที่เกี่ยวข้องแล้ว อ่านประเด็นสำคัญและเปิดต้นฉบับจากรายการอ้างอิงด้านล่าง"
        : "ยังไม่พบเอกสารที่ตรงกับคำค้น จึงงดสรุปหรือคาดเดาคำตอบ",
    }, { headers: noStore });

    if (!draftAnswersEnabled) {
      return evidenceOnlyResponse(
        "โหมดใช้งานจริงแสดงหลักฐานจากคลังความรู้เท่านั้น ยังไม่สังเคราะห์คำตอบด้วย AI เพราะเอกสารยังรอผู้เชี่ยวชาญทบทวน"
      );
    }

    const provider = providerConfig(request);
    if (!provider.ok) {
      return evidenceOnlyResponse(provider.error);
    }

    const messages = buildGroundedMessages(validated.value.query, validated.value.history, evidence, evidencePassages);
    const completion = await requestChatCompletion(provider.config, messages);
    if (!completion.ok) {
      // Keep the conversation useful during provider outages or access/budget
      // restrictions: return only retrieved evidence, never a fabricated AI answer.
      return evidenceOnlyResponse(
        "ขณะนี้ AI Provider ยังไม่สามารถสร้างคำตอบได้ ระบบจึงแสดงเฉพาะหลักฐานและแหล่งอ้างอิงที่ค้นพบ โดยไม่ได้สร้างคำตอบด้วย AI"
      );
    }

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
