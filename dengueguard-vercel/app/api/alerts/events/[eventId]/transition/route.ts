import { NextRequest, NextResponse } from "next/server";
import { authorizeAlertReviewer, alertSupabaseHeaders } from "@/lib/alerting/server-auth";
import { isDatabaseUuid, parseAlertTransitionRequest } from "@/lib/alerting/api-contract-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ eventId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || (() => {
    try { return new URL(origin).host.toLowerCase() !== host.toLowerCase(); }
    catch { return true; }
  })()) {
    return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบแหล่งที่มา" }, { status: 403 });
  }

  const access = await authorizeAlertReviewer(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const { eventId } = await context.params;
  if (!isDatabaseUuid(eventId)) {
    return NextResponse.json({ error: "Event ID ไม่ถูกต้อง" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }
  const input = parseAlertTransitionRequest(body);
  if (!input) {
    return NextResponse.json({ error: "คำสั่งเปลี่ยนสถานะไม่ถูกต้อง หรือเหตุผลปิดเหตุการณ์สั้นเกินไป" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${access.context.config.url}/rest/v1/rpc/dengueyosoku_transition_alert_event`,
      {
        method: "POST",
        headers: alertSupabaseHeaders(access.context, true),
        body: JSON.stringify({ p_event_id: eventId, p_action: input.action, p_note: input.note }),
        cache: "no-store",
      },
    );
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const code = typeof payload?.code === "string" ? payload.code : "";
      if (code === "PGRST202" || code === "42883") {
        return NextResponse.json({ error: "ยังไม่ได้ติดตั้ง Migration 004 สำหรับเปลี่ยนสถานะเหตุการณ์", migrationRequired: true }, { status: 503 });
      }
      if (code === "42501") {
        return NextResponse.json({ error: "ไม่มีสิทธิ์เปลี่ยนสถานะเหตุการณ์" }, { status: 403 });
      }
      return NextResponse.json({ error: typeof payload?.message === "string" ? payload.message : "เปลี่ยนสถานะเหตุการณ์ไม่สำเร็จ" }, {
        status: code === "22023" ? 409 : code === "P0002" ? 404 : 502,
      });
    }
    return NextResponse.json({ ok: true, result: payload }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถเชื่อมต่อฐานข้อมูลเพื่อเปลี่ยนสถานะได้" }, { status: 502 });
  }
}
