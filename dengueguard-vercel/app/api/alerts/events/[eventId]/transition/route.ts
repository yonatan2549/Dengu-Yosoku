import { NextRequest, NextResponse } from "next/server";
import { authorizeAlertReviewer, alertSupabaseHeaders } from "@/lib/alerting/server-auth";
import { isDatabaseUuid, parseAlertTransitionRequest } from "@/lib/alerting/api-contract-validation";
import { isSameOriginRequest } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function databaseCode(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const code = (value as Record<string, unknown>).code;
  return typeof code === "string" ? code : "";
}

function noStore(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  if (!isSameOriginRequest(request.headers)) {
    return noStore(403, { error: "คำขอไม่ผ่านการตรวจสอบแหล่งที่มา" });
  }

  const access = await authorizeAlertReviewer(request);
  if (!access.ok) return noStore(access.status, { error: access.message });

  const { eventId } = await context.params;
  if (!isDatabaseUuid(eventId)) return noStore(400, { error: "Event ID ไม่ถูกต้อง" });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore(400, { error: "ข้อมูลคำขอไม่ใช่ JSON ที่ถูกต้อง" });
  }

  const transition = parseAlertTransitionRequest(body);
  if (!transition) {
    return noStore(400, { error: "ข้อมูลการเปลี่ยนสถานะไม่ถูกต้อง หรือเหตุผลปิดเหตุการณ์มีความยาวไม่เพียงพอ" });
  }

  try {
    const response = await fetch(
      access.context.config.url + "/rest/v1/rpc/dengueyosoku_transition_alert_event",
      {
        method: "POST",
        headers: alertSupabaseHeaders(access.context, true),
        body: JSON.stringify({ p_event_id: eventId, p_action: transition.action, p_note: transition.note }),
        cache: "no-store",
      },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = databaseCode(payload);
      if (code === "PGRST202" || code === "42883") {
        return noStore(503, { error: "ยังไม่ได้ติดตั้ง Migration 004 สำหรับ Event Lifecycle", migrationRequired: true });
      }
      if (code === "42501") return noStore(403, { error: "ฐานข้อมูลปฏิเสธสิทธิ์ Reviewer/Admin สำหรับเปลี่ยนสถานะ" });
      if (code === "P0002") return noStore(404, { error: "ไม่พบเหตุการณ์ที่ต้องการเปลี่ยนสถานะ" });
      if (code === "22023") return noStore(409, { error: "ไม่สามารถเปลี่ยนสถานะจากสถานะปัจจุบันได้ หรือข้อมูลไม่ผ่านเงื่อนไข" });
      return noStore(502, { error: "บันทึกการเปลี่ยนสถานะเหตุการณ์ลงฐานข้อมูลไม่สำเร็จ" });
    }
    return noStore(200, { ok: true, result: payload });
  } catch {
    return noStore(502, { error: "ไม่สามารถเชื่อมต่อ Supabase เพื่อเปลี่ยนสถานะเหตุการณ์ได้" });
  }
}
