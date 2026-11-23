import { NextResponse } from "next/server";
import { classifyHealthQuery } from "@/lib/health-assistant/evidence";
import { containsPersonalLabValue } from "@/lib/health-assistant/chat-contract";
import { readBoundedJson } from "@/lib/health-assistant/request-body";
import { getLocalSqliteRagStatus, searchLocalSqliteRagEvidence } from "@/lib/health-assistant/sqlite-rag";
import { isDraftAnswersEnabled } from "@/lib/health-assistant/runtime-policy";
import { DEFAULT_AI_GATEWAY_ENDPOINT, DEFAULT_HEALTH_ASSISTANT_MODEL, readChatProviderConfig, requestChatCompletion } from "@/lib/health-assistant/chat-provider";
import { buildSqliteCitations, buildSqliteGroundedMessages, validateSqliteCitedAnswer } from "@/lib/health-assistant/sqlite-answer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "no-store, max-age=0" };
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requests = new Map<string, { startedAt: number; count: number }>();

function sqliteAiProviderConfig(request: Request) {
  // Keep SQLite generation on Vercel AI Gateway. Do not accidentally route through
  // an old Ollama endpoint/model configured for the separate local-vector prototype.
  const env = {
    ...process.env,
    HEALTH_ASSISTANT_CHAT_ENDPOINT: DEFAULT_AI_GATEWAY_ENDPOINT,
    HEALTH_ASSISTANT_MODEL: process.env.SQLITE_HEALTH_ASSISTANT_MODEL?.trim() || DEFAULT_HEALTH_ASSISTANT_MODEL,
    HEALTH_ASSISTANT_API_KEY: undefined,
  };
  return readChatProviderConfig(env, process.env.NODE_ENV, request.headers.get("x-vercel-oidc-token"));
}

function isLoopback(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]";
}

function blockedResponse(query: string, reason: string, message: string) {
  return NextResponse.json({
    mode: "sqlite-evidence-only",
    generatedAnswersEnabled: false,
    generatedAnswer: false,
    status: "blocked",
    query,
    audience: "public",
    safety: { blocked: true, gateReasons: [reason], message },
    retrieval: {
      engine: "public-safety-preflight",
      version: "1.0",
      indexedChunks: 0,
      eligibleChunks: 0,
      resultCount: 0,
      semanticWeight: 0,
      queryIntent: reason,
      withheld: { sourcePolicy: 0, audiencePolicy: 0, textQuality: 0 },
    },
    results: [],
    warnings: ["คำถามนี้ไม่ถูกส่งไปยัง Python, SQLite หรือ Ollama"],
    abstained: true,
    answer: null,
    citations: [],
    evidencePassages: [],
  }, { headers: noStore });
}

function rateLimitKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local-client";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const current = requests.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requests.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

function isSameLoopbackRequest(request: Request): boolean {
  const url = new URL(request.url);
  const hostHeader = request.headers.get("host") ?? "";
  let headerHost = "";
  try {
    headerHost = new URL("http://" + hostHeader).hostname;
  } catch {
    return false;
  }
  if (!isLoopback(url.hostname) || !isLoopback(headerHost) || url.hostname !== headerHost) return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === url.origin;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const status = getLocalSqliteRagStatus();
  const draftAnswersEnabled = isDraftAnswersEnabled(process.env);
  const provider = sqliteAiProviderConfig(request);
  const generatedAnswersEnabled = status.available && draftAnswersEnabled && provider.ok;
  const message = !status.available
    ? status.message
    : generatedAnswersEnabled
      ? "เชื่อมต่อ SQLite Local แล้ว พร้อมสร้างร่างคำตอบด้วย AI Gateway จากหลักฐานสาธารณะที่ค้นพบ โดยไม่ส่งประวัติแชต"
      : !draftAnswersEnabled
        ? "เชื่อมต่อ SQLite Local แล้ว ขณะนี้แสดงหลักฐานเท่านั้น หากเปิด HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS=true และตั้งค่า AI Gateway credential ระบบจะสร้างร่างคำตอบได้"
        : provider.error;

  return NextResponse.json({
    mode: generatedAnswersEnabled ? "sqlite-grounded-ai-preview" : "sqlite-evidence-only",
    generatedAnswersEnabled,
    provider: status.configured ? "SQLite Local" : null,
    aiProvider: provider.ok ? "Vercel AI Gateway" : null,
    model: provider.ok ? provider.config.model : null,
    configured: status.configured,
    available: status.available,
    message,
    reviewStatus: "awaiting_clinical_review",
    productionPolicy: "local-development-only; generated answers are educational drafts; production remains evidence-only",
  }, { headers: noStore });
}
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Local SQLite RAG ใช้ได้เฉพาะ Local Development" }, { status: 503, headers: noStore });
  }
  if (!isSameLoopbackRequest(request)) {
    return NextResponse.json({ error: "Local SQLite RAG อนุญาตเฉพาะ Loopback และ Same-Origin Request" }, { status: 403, headers: noStore });
  }

  if (isRateLimited(rateLimitKey(request))) {
    return NextResponse.json({ error: "ส่งคำถามถี่เกินไป กรุณารอสักครู่" }, { status: 429, headers: noStore });
  }

  const parsedBody = await readBoundedJson(request, 4096);
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status, headers: noStore });
  }
  const body = parsedBody.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400, headers: noStore });
  }

  const rawQuery = (body as Record<string, unknown>).query;
  if (typeof rawQuery !== "string" || rawQuery.trim().length < 2 || rawQuery.trim().length > 500) {
    return NextResponse.json({ error: "คำถามต้องมีความยาว 2–500 ตัวอักษร" }, { status: 400, headers: noStore });
  }
  const query = rawQuery.trim();

  const intent = classifyHealthQuery(query);
  if (intent === "emergency-warning") {
    return blockedResponse(query, "emergency_warning",
      "หากมีอาการปวดท้องรุนแรง อาเจียนต่อเนื่อง เลือดออก ซึม สับสน หรือหายใจลำบาก ให้ไปโรงพยาบาลหรือห้องฉุกเฉินทันที อย่ารอผลค้นจากระบบนี้");
  }
  if (intent === "personal-medical" || containsPersonalLabValue(query)) {
    return blockedResponse(query, "personal_medical",
      "ระบบนี้ไม่วินิจฉัย แปลผลตรวจเฉพาะบุคคล เลือกยา หรือกำหนดขนาดยา โปรดปรึกษาบุคลากรทางการแพทย์");
  }

  const result = await searchLocalSqliteRagEvidence(query);
  if (!result.ok) {
    return NextResponse.json({
      error: result.message,
      code: result.code,
      mode: "sqlite-rag-unavailable",
      generatedAnswersEnabled: false,
    }, { status: 503, headers: noStore });
  }

  const payload = result.data;
  if (payload.status === "blocked") {
    return blockedResponse(query, payload.safety.gateReasons[0] || "safety_gate",
      payload.safety.message || "ระบบงดค้นคำถามนี้เพื่อความปลอดภัย");
  }

  const citations = buildSqliteCitations(payload);
  const retrievalSummary = "Indexed " + payload.retrieval.indexedChunks +
    " · Eligible public " + payload.retrieval.eligibleChunks +
    " · Retrieved " + payload.retrieval.resultCount +
    " · Withheld by policy: source " + payload.retrieval.withheld.sourcePolicy +
    ", audience " + payload.retrieval.withheld.audiencePolicy +
    ", quality " + payload.retrieval.withheld.textQuality +
    ". คะแนนจัดอันดับไม่ใช่คะแนนความถูกต้องทางการแพทย์";

  const evidencePassages = payload.results.map((item) => ({
    chunkId: item.sourceId + "-" + item.rank,
    documentId: item.sourceId,
    title: item.title,
    sectionLabel: item.pageLabel,
    text: item.text,
    publisher: item.authority,
    publishedAt: "สกัดข้อมูลเมื่อ " + (item.retrievedAt || "ไม่ระบุ"),
    sourceUrl: item.sourceUrl,
    reviewStatus: item.extractionMethod === "legacy_unknown"
      ? "วิธีสกัดเดิมไม่ทราบแน่ชัด · รอทบทวนทางคลินิก"
      : "Public general · รอทบทวนทางคลินิก",
    similarity: item.scores.combined,
  }));

  const evidenceOnlyResponse = (reason: string) => NextResponse.json({
    mode: "evidence-only",
    generatedAnswer: false,
    generatedAnswersEnabled: false,
    abstained: payload.status === "no_evidence",
    answer: payload.status === "no_evidence"
      ? "ยังไม่พบหลักฐานจากคลัง SQLite ที่ผ่าน Public Allow-list ตรงกับคำถามนี้ ระบบจึงงดสรุปคำตอบ"
      : "ค้นพบหลักฐานจาก SQLite ในเครื่อง " + payload.results.length +
        " รายการ ด้านล่างเป็นข้อความจากเอกสารต้นทางที่ผ่านตัวกรองสาธารณะ ระบบไม่ได้สร้างคำตอบด้วย AI",
    citations,
    evidencePassages,
    retrievalMethod: payload.retrieval.engine + " v" + payload.retrieval.version,
    fullDocumentRag: false,
    disclaimer: retrievalSummary + ". " + reason +
      " ผลลัพธ์เป็น excerpt จาก chunk ที่ผ่าน Public Allow-list เท่านั้น; extraction quality ok ไม่ได้หมายถึงผ่านการทบทวนทางคลินิก",
    sqliteRetrieval: payload.retrieval,
    warnings: payload.warnings,
  }, { headers: noStore });

  if (payload.status === "no_evidence") {
    return evidenceOnlyResponse("ไม่พบหลักฐานเพียงพอ จึงงดใช้ AI สรุป");
  }

  const draftAnswersEnabled = isDraftAnswersEnabled(process.env);
  const provider = sqliteAiProviderConfig(request);
  if (!draftAnswersEnabled) {
    return evidenceOnlyResponse("AI draft ถูกปิดไว้ในสภาพแวดล้อมนี้");
  }
  if (!provider.ok) {
    return evidenceOnlyResponse(provider.error);
  }

  // Only the current public question and the retrieved allow-listed excerpts are sent.
  // No conversation history, personal data, review-only material, or Ollama model is sent.
  const completion = await requestChatCompletion(
    provider.config,
    buildSqliteGroundedMessages(query, payload),
  );
  if (!completion.ok) {
    return evidenceOnlyResponse("AI Gateway ยังสร้างคำตอบไม่ได้: " + completion.error);
  }

  const checked = validateSqliteCitedAnswer(completion.answer, payload);
  if (!checked.ok) {
    return evidenceOnlyResponse("ระบบปฏิเสธคำตอบจาก AI เพราะตรวจ citation/safety ไม่ผ่าน (" + checked.error + ")");
  }

  return NextResponse.json({
    mode: "sqlite-grounded-draft-answer",
    generatedAnswer: true,
    generatedAnswersEnabled: true,
    draftOnly: true,
    abstained: false,
    intent: "general-education",
    safetyLevel: "education",
    answer: checked.answer,
    citations: checked.citations,
    evidencePassages,
    retrievalMethod: payload.retrieval.engine + " v" + payload.retrieval.version,
    fullDocumentRag: false,
    reviewStatus: "awaiting_clinical_review",
    disclaimer: retrievalSummary +
      ". คำตอบนี้เป็นร่างเพื่อการศึกษา สร้างจาก excerpt ที่ผ่าน Public Allow-list เท่านั้น ไม่ใช่เอกสารฉบับเต็มและยังไม่ผ่านการทบทวนทางคลินิก",
    sqliteRetrieval: payload.retrieval,
    warnings: payload.warnings,
  }, { headers: noStore });
}
}
