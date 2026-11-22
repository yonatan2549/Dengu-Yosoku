import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/supabase/config";
import { detectEmergencySignals } from "@/lib/health-assistant/contracts";
import {
  LocalRagUnavailableError,
  retrieveLocalPublicEvidence,
} from "@/lib/health-assistant/local-rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUESTION_LENGTH = 600;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 8;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function rateLimitKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

function isRateLimited(request: Request): boolean {
  const key = rateLimitKey(request);
  const now = Date.now();

  if (requestCounts.size > 500) {
    for (const [entryKey, entry] of requestCounts) {
      if (entry.resetAt <= now) requestCounts.delete(entryKey);
    }
  }

  const current = requestCounts.get(key);
  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > RATE_LIMIT;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers)) {
    return NextResponse.json(
      { status: "error", message: "คำขอไม่ผ่านการตรวจสอบแหล่งที่มา" },
      { status: 403 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 8_000) {
    return NextResponse.json(
      { status: "error", message: "คำถามมีขนาดใหญ่เกินกำหนด" },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", message: "รูปแบบคำขอไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const question =
    body && typeof body === "object" && "question" in body
      ? (body as { question?: unknown }).question
      : undefined;

  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json(
      { status: "error", message: "กรุณาพิมพ์คำถามก่อนส่ง" },
      { status: 400 },
    );
  }

  const normalizedQuestion = question.trim();
  if (normalizedQuestion.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      {
        status: "error",
        message: "คำถามยาวเกิน 600 ตัวอักษร กรุณาย่อคำถามแล้วลองใหม่",
      },
      { status: 400 },
    );
  }

  // Never rate-limit an emergency response behind a retrieval request.
  const emergencySignals = detectEmergencySignals(normalizedQuestion);
  if (emergencySignals.length > 0) {
    return NextResponse.json({
      status: "emergency",
      message:
        "ข้อความของคุณมีการกล่าวถึงอาการที่อาจเป็นสัญญาณอันตราย ได้แก่ " +
        emergencySignals.join(", ") +
        " หากอาการนี้กำลังเกิดขึ้นกับคุณหรือคนใกล้ชิด ให้ไปห้องฉุกเฉินหรือขอความช่วยเหลือทางการแพทย์ฉุกเฉินในพื้นที่ทันที อย่ารอคำตอบจากระบบ AI",
      evidence: [],
      emergencySignals,
    });
  }

  if (isRateLimited(request)) {
    return NextResponse.json(
      { status: "error", message: "ส่งคำถามถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429 },
    );
  }

  try {
    const result = await retrieveLocalPublicEvidence(normalizedQuestion);
    return NextResponse.json({
      ...result,
      disclaimer:
        "ระบบนี้แสดงหลักฐานจากเอกสารที่ผ่านตัวกรองเท่านั้น ไม่วินิจฉัยโรค ไม่แปลผลตรวจ และไม่สั่งการรักษา",
    });
  } catch (error) {
    const message =
      error instanceof LocalRagUnavailableError
        ? error.message
        : "ไม่สามารถเรียกใช้ระบบค้นคืนความรู้ในเครื่องได้";
    console.error("[health-assistant]", error);
    return NextResponse.json(
      { status: "unavailable", message, evidence: [] },
      { status: 503 },
    );
  }
}
