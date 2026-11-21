import { NextRequest, NextResponse } from "next/server";
import { authorizeAlertReviewer, alertSupabaseHeaders } from "@/lib/alerting/server-auth";
import { isDatabaseUuid } from "@/lib/alerting/api-contract-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EventRow {
  id: string; event_key: string; province_name: string; target_week: string;
  signal_type: "predicted_cases_threshold"; current_level: "WATCH" | "ALERT";
  status: "new" | "acknowledged" | "resolved" | "reopened";
  predicted_cases: number | string; triggering_threshold: number | string;
  rule_profile_id: string; rule_profile_version: string;
  snapshot_is_stale: boolean; delivery_state: "not_sent_dry_run_only";
  last_seen_fingerprint: string; model_revision: string | null;
  first_seen_at: string; last_seen_at: string; updated_at: string;
}
interface TransitionRow {
  id: string; event_id: string;
  transition_type: "created" | "acknowledged" | "resolved" | "reopened" | "level_changed";
  from_status: "new" | "acknowledged" | "resolved" | "reopened" | null;
  to_status: "new" | "acknowledged" | "resolved" | "reopened" | null;
  from_level: "WATCH" | "ALERT" | null; to_level: "WATCH" | "ALERT" | null;
  note: string; created_at: string;
}

export async function GET(request: NextRequest) {
  const access = await authorizeAlertReviewer(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, {
      status: access.status, headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    const eventsUrl = new URL(access.context.config.url + "/rest/v1/alert_events");
    eventsUrl.searchParams.set("select",
      "id,event_key,province_name,target_week,signal_type,current_level,status,predicted_cases,triggering_threshold,rule_profile_id,rule_profile_version,snapshot_is_stale,delivery_state,last_seen_fingerprint,model_revision,first_seen_at,last_seen_at,updated_at");
    eventsUrl.searchParams.set("order", "updated_at.desc");
    eventsUrl.searchParams.set("limit", "200");
    const eventResponse = await fetch(eventsUrl, {
      headers: { ...alertSupabaseHeaders(access.context), Prefer: "count=exact" },
      cache: "no-store",
    });
    if (!eventResponse.ok) {
      return NextResponse.json({ error: "อ่านรายการ Alert events จากฐานข้อมูลไม่สำเร็จ" }, { status: 502 });
    }
    const rows = await eventResponse.json() as EventRow[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: true, role: access.context.role, events: [], total: 0 }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const databaseIds = rows.map(row => row.id).filter(isDatabaseUuid);
    if (databaseIds.length !== rows.length) {
      return NextResponse.json({ error: "พบ Event ID ที่ไม่ถูกต้องในฐานข้อมูล" }, { status: 502 });
    }

    const transitionsUrl = new URL(access.context.config.url + "/rest/v1/alert_event_transitions");
    transitionsUrl.searchParams.set("select",
      "id,event_id,transition_type,from_status,to_status,from_level,to_level,note,created_at");
    transitionsUrl.searchParams.set("event_id", "in.(" + databaseIds.join(",") + ")");
    transitionsUrl.searchParams.set("order", "created_at.asc");
    transitionsUrl.searchParams.set("limit", "5000");
    const transitionResponse = await fetch(transitionsUrl, {
      headers: alertSupabaseHeaders(access.context), cache: "no-store",
    });
    if (!transitionResponse.ok) {
      return NextResponse.json({ error: "อ่านประวัติการเปลี่ยนสถานะไม่สำเร็จ" }, { status: 502 });
    }
    const transitionRows = await transitionResponse.json() as TransitionRow[];
    const byEvent = new Map<string, TransitionRow[]>();
    for (const transition of transitionRows) {
      const list = byEvent.get(transition.event_id) ?? [];
      list.push(transition);
      byEvent.set(transition.event_id, list);
    }
    const events = rows.map(row => ({
      databaseId: row.id, eventId: row.event_key, province: row.province_name,
      weekStart: row.target_week, signal: row.signal_type, level: row.current_level,
      predictedCases: Number(row.predicted_cases), threshold: Number(row.triggering_threshold),
      ruleProfileId: row.rule_profile_id, ruleProfileVersion: row.rule_profile_version,
      snapshotIsStale: row.snapshot_is_stale, delivery: row.delivery_state, status: row.status,
      createdAtUtc: row.first_seen_at, updatedAtUtc: row.updated_at, lastSeenAtUtc: row.last_seen_at,
      lastSeenModelRevision: row.model_revision?.trim() || null,
      lastSeenFingerprint: row.last_seen_fingerprint,
      transitions: (byEvent.get(row.id) ?? []).map(item => ({
        id: item.id, kind: item.transition_type, atUtc: item.created_at, note: item.note,
        ...(item.from_status ? { fromStatus: item.from_status } : {}),
        ...(item.to_status ? { toStatus: item.to_status } : {}),
        ...(item.from_level ? { fromLevel: item.from_level } : {}),
        ...(item.to_level ? { toLevel: item.to_level } : {}),
      })),
    }));
    const range = eventResponse.headers.get("content-range");
    const totalMatch = range?.match(/\/(\d+|\*)$/);
    const total = totalMatch && totalMatch[1] !== "*" ? Number(totalMatch[1]) : events.length;
    return NextResponse.json({ ok: true, role: access.context.role, events, total }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถเชื่อมต่อฐานข้อมูล Alert events ได้" }, { status: 502 });
  }
}
