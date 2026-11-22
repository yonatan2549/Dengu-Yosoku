export type ExpertReviewDecision = "approved" | "changes_requested" | "rejected";

export interface ExpertReviewDecisionPayload {
  requestId: string;
  decision: ExpertReviewDecision;
  reviewNote: string;
  evidenceReference: string | null;
  effectiveFromWeek: string | null;
}

export interface ReviewActorContext {
  actorId: string;
  actorRole: string;
  requestedBy: string;
}

export interface ExpertReviewValidation {
  ok: boolean;
  errors: string[];
  value: ExpertReviewDecisionPayload | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUNDAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSundayEpiWeek(value: string): boolean {
  if (!SUNDAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === 0;
}

export function validateExpertReviewDecision(
  input: unknown,
  actor: ReviewActorContext,
): ExpertReviewValidation {
  const errors: string[] = [];
  const fail = (): ExpertReviewValidation => ({ ok: false, errors, value: null });

  if (actor.actorRole !== "reviewer") {
    errors.push("การตัดสินคำขอสงวนไว้สำหรับบัญชี Role reviewer เท่านั้น");
  }
  if (!UUID_PATTERN.test(actor.actorId) || !UUID_PATTERN.test(actor.requestedBy)) {
    errors.push("ไม่พบรหัสผู้ใช้หรือผู้ส่งคำขอที่ถูกต้อง");
  } else if (actor.actorId === actor.requestedBy) {
    errors.push("ผู้ส่งคำขอไม่สามารถทบทวนคำขอของตนเองได้");
  }
  if (!isRecord(input)) {
    errors.push("รูปแบบข้อมูลการตัดสินไม่ถูกต้อง");
    return fail();
  }

  const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
  const decision = input.decision;
  const reviewNote = typeof input.reviewNote === "string" ? input.reviewNote.trim() : "";
  const evidenceRaw = input.evidenceReference;
  const weekRaw = input.effectiveFromWeek;
  const evidenceReference = typeof evidenceRaw === "string" && evidenceRaw.trim()
    ? evidenceRaw.trim()
    : null;
  const effectiveFromWeek = typeof weekRaw === "string" && weekRaw.trim()
    ? weekRaw.trim()
    : null;

  if (!UUID_PATTERN.test(requestId)) errors.push("Request ID ไม่ใช่ UUID ที่ถูกต้อง");
  if (decision !== "approved" && decision !== "changes_requested" && decision !== "rejected") {
    errors.push("ประเภทการตัดสินต้องเป็น approved, changes_requested หรือ rejected");
  }
  if (reviewNote.length < 10 || reviewNote.length > 1000) {
    errors.push("เหตุผลการทบทวนต้องมีความยาว 10–1,000 ตัวอักษร");
  }

  if (decision === "approved") {
    if (!evidenceReference || evidenceReference.length < 5 || evidenceReference.length > 500) {
      errors.push("การรับรองต้องมีรหัสเอกสารหรือหลักฐานอ้างอิง 5–500 ตัวอักษร");
    }
    if (!effectiveFromWeek || !isSundayEpiWeek(effectiveFromWeek)) {
      errors.push("วันที่เริ่มใช้ต้องเป็นวันอาทิตย์ซึ่งเป็นวันเริ่มสัปดาห์ระบาดวิทยา (YYYY-MM-DD)");
    }
  } else if (evidenceReference || effectiveFromWeek) {
    errors.push("กรณีขอแก้ไขหรือปฏิเสธ ไม่ควรระบุหลักฐานอนุมัติหรือวันที่เริ่มใช้");
  }

  if (errors.length) return fail();
  return {
    ok: true,
    errors: [],
    value: {
      requestId,
      decision: decision as ExpertReviewDecision,
      reviewNote,
      evidenceReference,
      effectiveFromWeek,
    },
  };
}
