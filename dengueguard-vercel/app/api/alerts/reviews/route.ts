import { NextRequest, NextResponse } from "next/server";
import { authorizeAlertReviewer, alertSupabaseHeaders } from "@/lib/alerting/server-auth";
import { validateExpertReviewDecision } from "@/lib/alerting/review-decision-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === host.toLowerCase(); }
  catch { return false; }
}

function databaseCode(value: unknown): string {
  return value && typeof value === "object" && typeof (value as Record<string, unknown>).code === "string"
    ? String((value as Record<string, unknown>).code)
    : "";
}

async function readJson<T>(url: URL, headers: Record<string, string>): Promise<{ ok: true; value: T } | { ok: false; code: string }> {
  const response = await fetch(url, { headers, cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, code: databaseCode(payload) };
  return { ok: true, value: payload as T };
}

export async function GET(request: NextRequest) {
  const access = await authorizeAlertReviewer(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status, headers: { "Cache-Control": "no-store" } });
  }

  const headers = alertSupabaseHeaders(access.context);
  const requestUrl = new URL(`${access.context.config.url}/rest/v1/alert_rule_profile_review_requests`);
  requestUrl.searchParams.set("select", "id,profile_id,requested_by,status,submission_note,submitted_at,profile_version,threshold_count,profile_snapshot");
  requestUrl.searchParams.set("order", "submitted_at.desc");
  requestUrl.searchParams.set("limit", "50");

  const decisionUrl = new URL(`${access.context.config.url}/rest/v1/alert_rule_profile_review_decisions`);
  decisionUrl.searchParams.set("select", "id,review_request_id,decision,reviewer_id,review_note,evidence_reference,effective_from_week,reviewed_at");
  decisionUrl.searchParams.set("order", "reviewed_at.desc");
  decisionUrl.searchParams.set("limit", "100");

  try {
    const [requests, decisions] = await Promise.all([
      readJson<Array<Record<string, unknown>>>(requestUrl, headers),
      readJson<Array<Record<string, unknown>>>(decisionUrl, headers),
    ]);
    if (!requests.ok || !decisions.ok) {
      const codes = [!requests.ok ? requests.code : "", !decisions.ok ? decisions.code : ""];
      const missing = codes.some((code) => ["PGRST205", "42P01"].includes(code));
      return NextResponse.json({
        error: missing ? "ยังไม่ได้ติดตั้ง Migration 006 สำหรับ Expert Review Workflow" : "อ่านคำขอหรือประวัติการทบทวนจาก Supabase ไม่สำเร็จ",
        migrationRequired: missing,
      }, { status: missing ? 503 : 502, headers: { "Cache-Control": "no-store" } });
    }

    const decisionByRequest = new Map<string, Record<string, unknown>>();
    for (const decision of decisions.value) {
      if (typeof decision.review_request_id === "string") decisionByRequest.set(decision.review_request_id, decision);
    }
    const items = requests.value.map((item) => ({
      ...item,
      decisionRecord: typeof item.id === "string" ? decisionByRequest.get(item.id) ?? null : null,
    }));

    return NextResponse.json({
      ok: true,
      role: access.context.role,
      currentUserId: access.context.userId,
      requests: items,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถเชื่อมต่อข้อมูลคำขอทบทวนกับ Supabase ได้" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบแหล่งที่มา" }, { status: 403 });
  }
  const access = await authorizeAlertReviewer(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status, headers: { "Cache-Control": "no-store" } });
  }
  if (access.context.role !== "reviewer") {
    return NextResponse.json({ error: "การตัดสินคำขอสงวนไว้สำหรับบัญชี Role reviewer เท่านั้น" }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลคำขอไม่ใช่ JSON ที่ถูกต้อง" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "รูปแบบข้อมูลการตัดสินไม่ถูกต้อง" }, { status: 400 });
  }

  const requestId = (body as Record<string, unknown>).requestId;
  if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: "Request ID ไม่ใช่ UUID ที่ถูกต้อง" }, { status: 400 });
  }

  try {
    // Obtain the submitter identity from PostgreSQL, never from the browser payload.
    const requestUrl = new URL(`${access.context.config.url}/rest/v1/alert_rule_profile_review_requests`);
    requestUrl.searchParams.set("select", "id,requested_by,profile_id,profile_version,threshold_count");
    requestUrl.searchParams.set("id", `eq.${requestId}`);
    requestUrl.searchParams.set("limit", "1");
    const requestResponse = await fetch(requestUrl, { headers: alertSupabaseHeaders(access.context), cache: "no-store" });
    const requestRows = await requestResponse.json().catch(() => null) as Array<Record<string, unknown>> | null;
    if (!requestResponse.ok) {
      const code = databaseCode(requestRows);
      const missing = ["PGRST205", "42P01"].includes(code);
      return NextResponse.json({ error: missing ? "ยังไม่ได้ติดตั้ง Migration 005/006" : "ตรวจสอบคำขอทบทวนไม่สำเร็จ" }, { status: missing ? 503 : 502 });
    }
    const submittedRequest = Array.isArray(requestRows) ? requestRows[0] : undefined;
    if (!submittedRequest || typeof submittedRequest.requested_by !== "string") {
      return NextResponse.json({ error: "ไม่พบคำขอทบทวนนี้" }, { status: 404 });
    }

    const validated = validateExpertReviewDecision(body, {
      actorId: access.context.userId,
      actorRole: access.context.role,
      requestedBy: submittedRequest.requested_by,
    });
    if (!validated.ok || !validated.value) {
      return NextResponse.json({ error: "ข้อมูลการทบทวนไม่ผ่านการตรวจสอบ", errors: validated.errors }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const resultResponse = await fetch(`${access.context.config.url}/rest/v1/rpc/dengueyosoku_review_alert_rule_request`, {
      method: "POST",
      headers: alertSupabaseHeaders(access.context, true),
      body: JSON.stringify({
        p_request_id: validated.value.requestId,
        p_decision: validated.value.decision,
        p_review_note: validated.value.reviewNote,
        p_evidence_reference: validated.value.evidenceReference,
        p_effective_from_week: validated.value.effectiveFromWeek,
      }),
      cache: "no-store",
    });
    const result = await resultResponse.json().catch(() => null);
    if (!resultResponse.ok) {
      const code = databaseCode(result);
      const missing = ["PGRST202", "42883"].includes(code);
      const forbidden = code === "42501";
      return NextResponse.json({
        error: missing ? "ยังไม่ได้ติดตั้ง RPC จาก Migration 006" : forbidden ? "ฐานข้อมูลปฏิเสธสิทธิ์ Reviewer หรือพบการทบทวนคำขอตนเอง" : typeof (result as Record<string, unknown> | null)?.message === "string" ? String((result as Record<string, unknown>).message) : "บันทึกผลการทบทวนไม่สำเร็จ",
        migrationRequired: missing,
        databaseCode: code || null,
      }, { status: missing ? 503 : forbidden ? 403 : 400, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถเชื่อมต่อ RPC สำหรับการทบทวนได้" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
