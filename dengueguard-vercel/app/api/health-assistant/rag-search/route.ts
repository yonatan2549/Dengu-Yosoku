import { NextResponse } from "next/server";
import { classifyHealthQuery } from "@/lib/health-assistant/evidence";
import { containsPersonalLabValue } from "@/lib/health-assistant/chat-contract";
import { searchLocalRagEvidence } from "@/lib/health-assistant/local-rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "no-store, max-age=0" };
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requests = new Map<string, { startedAt: number; count: number }>();

function isLoopback(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function blockedResponse(query: string, reason: string, message: string) {
  return NextResponse.json({
    mode: "safety-abstention",
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
    warnings: ["คำถามนี้ไม่ถูกส่งไปยัง Ollama หรือ Local RAG"],
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

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Local RAG ใช้ได้เฉพาะ Local Development" }, { status: 503, headers: noStore });
  }

  const url = new URL(request.url);
  const hostHeader = request.headers.get("host") ?? "";
  let headerHost = "";
  try {
    headerHost = new URL("http://" + hostHeader).hostname;
  } catch {
    headerHost = "";
  }
  if (!isLoopback(url.hostname) || !isLoopback(headerHost) || url.hostname !== headerHost) {
    return NextResponse.json({ error: "Local RAG endpoint อนุญาตเฉพาะ Loopback Host" }, { status: 403, headers: noStore });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) {
        return NextResponse.json({ error: "คำขอต้องมาจาก Origin เดียวกัน" }, { status: 403, headers: noStore });
      }
    } catch {
      return NextResponse.json({ error: "Origin ไม่ถูกต้อง" }, { status: 403, headers: noStore });
    }
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return NextResponse.json({ error: "คำขอมีขนาดเกินกำหนด" }, { status: 413, headers: noStore });
  }
  if (isRateLimited(rateLimitKey(request))) {
    return NextResponse.json({ error: "ส่งคำถามถี่เกินไป กรุณารอสักครู่" }, { status: 429, headers: noStore });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "คำขอต้องอยู่ในรูปแบบ JSON" }, { status: 400, headers: noStore });
  }

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
    return blockedResponse(
      query,
      "emergency_warning",
      "หากมีอาการปวดท้องรุนแรง อาเจียนต่อเนื่อง เลือดออก ซึม สับสน หรือหายใจลำบาก ให้ไปโรงพยาบาลหรือห้องฉุกเฉินทันที อย่ารอผลค้นจากระบบนี้ การแจ้งเตือนนี้ไม่ใช่การวินิจฉัย",
    );
  }
  if (intent === "personal-medical" || containsPersonalLabValue(query)) {
    return blockedResponse(
      query,
      "personal_medical",
      "ระบบค้นคืนนี้ไม่สามารถวินิจฉัย แปลผลตรวจเฉพาะบุคคล เลือกยา หรือกำหนดขนาดยาได้ โปรดปรึกษาบุคลากรทางการแพทย์",
    );
  }

  const result = await searchLocalRagEvidence(query);
  if (!result.ok) {
    return NextResponse.json({
      error: result.message,
      code: result.code,
      mode: "local-rag-unavailable",
      generatedAnswer: false,
    }, { status: 503, headers: noStore });
  }

  return NextResponse.json({
    mode: "local-rag-evidence-only",
    generatedAnswer: false,
    ...result.data,
    disclaimer: "ระบบแสดงหลักฐานจาก Public Allow-list เท่านั้น ไม่สร้างคำตอบด้วย AI และไม่ใช่คำแนะนำทางการแพทย์เฉพาะบุคคล",
  }, { headers: noStore });
}
