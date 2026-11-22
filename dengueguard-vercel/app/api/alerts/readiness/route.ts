import { NextRequest, NextResponse } from "next/server";
import { authorizeAlertReviewer, alertSupabaseHeaders } from "@/lib/alerting/server-auth";
import { ALERT_RULE_PROFILE } from "@/lib/alerting/profile";
import { assessAlertReadiness, type ReadinessProfile, type ReadinessThreshold } from "@/lib/alerting/readiness-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function databaseErrorCode(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const code = (value as Record<string, unknown>).code;
  return typeof code === "string" ? code : "";
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบแหล่งที่มา" }, { status: 403 });
  }

  const access = await authorizeAlertReviewer(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, {
      status: access.status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลรายชื่อจังหวัดไม่ถูกต้อง" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }
  const provinces = (body as Record<string, unknown>).provinces;
  if (!Array.isArray(provinces) || provinces.length > 77 || !provinces.every(
    (name) => typeof name === "string" && name.trim().length > 0 && name.length <= 100,
  )) {
    return NextResponse.json({ error: "รายชื่อจังหวัดต้องเป็นข้อความไม่เกิน 77 รายการ" }, { status: 400 });
  }

  const headers = alertSupabaseHeaders(access.context);
  const profileUrl = new URL(`${access.context.config.url}/rest/v1/alert_rule_profiles`);
  profileUrl.searchParams.set(
    "select",
    "id,profile_id,version,status,external_notifications_enabled,approval_reference,effective_from_week,approved_at,approved_by",
  );
  profileUrl.searchParams.set("profile_id", `eq.${ALERT_RULE_PROFILE.profileId}`);
  profileUrl.searchParams.set("version", `eq.${ALERT_RULE_PROFILE.version}`);
  profileUrl.searchParams.set("limit", "1");

  try {
    const profileResponse = await fetch(profileUrl, { headers, cache: "no-store" });
    if (!profileResponse.ok) {
      const error = await profileResponse.json().catch(() => null);
      const code = databaseErrorCode(error);
      const migrationRequired = ["PGRST205", "42P01"].includes(code);
      return NextResponse.json({
        error: migrationRequired
          ? "ยังไม่พบตาราง Alert Center ใน Supabase กรุณาตรวจสอบ Migration 001–003"
          : "อ่าน Rule Profile จาก Supabase ไม่สำเร็จ",
        migrationRequired,
      }, { status: migrationRequired ? 503 : 502, headers: { "Cache-Control": "no-store" } });
    }
    const profiles = await profileResponse.json() as Array<{
      id: string;
      profile_id: string;
      version: string;
      status: "draft" | "approved";
      external_notifications_enabled: boolean;
    }>;
    const dbProfile = Array.isArray(profiles) ? profiles[0] : undefined;

    let thresholds: ReadinessThreshold[] = [];
    if (dbProfile?.id) {
      const thresholdsUrl = new URL(`${access.context.config.url}/rest/v1/alert_rule_thresholds`);
      thresholdsUrl.searchParams.set("select", "province_name,watch_threshold,alert_threshold");
      thresholdsUrl.searchParams.set("profile_id", `eq.${dbProfile.id}`);
      thresholdsUrl.searchParams.set("limit", "100");
      const thresholdResponse = await fetch(thresholdsUrl, { headers, cache: "no-store" });
      if (!thresholdResponse.ok) {
        return NextResponse.json({ error: "อ่าน Threshold จาก Supabase ไม่สำเร็จ" }, { status: 502 });
      }
      const rows = await thresholdResponse.json() as Array<{
        province_name: string;
        watch_threshold: string | number;
        alert_threshold: string | number;
      }>;
      thresholds = Array.isArray(rows) ? rows.map((row) => ({
        provinceName: row.province_name,
        watch: Number(row.watch_threshold),
        alert: Number(row.alert_threshold),
      })) : [];
    }

    // Safe, no-write probe: the RPC checks auth.uid()/role and rejects this
    // deliberately invalid action before looking up or mutating any event.
    const probeResponse = await fetch(
      `${access.context.config.url}/rest/v1/rpc/dengueyosoku_transition_alert_event`,
      {
        method: "POST",
        headers: alertSupabaseHeaders(access.context, true),
        body: JSON.stringify({
          p_event_id: "00000000-0000-4000-8000-000000000000",
          p_action: "__readiness_probe__",
          p_note: "",
        }),
        cache: "no-store",
      },
    );
    const probePayload = await probeResponse.json().catch(() => null);
    const probeCode = databaseErrorCode(probePayload);
    const permissionMismatch = !probeResponse.ok && probeCode === "42501";
    const migration004Available = !probeResponse.ok && (probeCode === "22023" || permissionMismatch);

    const profile: ReadinessProfile | null = dbProfile ? {
      profileId: dbProfile.profile_id,
      version: dbProfile.version,
      status: dbProfile.status,
      externalNotificationsEnabled: dbProfile.external_notifications_enabled,
    } : null;
    const report = assessAlertReadiness({
      migration004Available,
      profile,
      thresholds,
      expectedProvinces: provinces as string[],
      applicationProfileId: ALERT_RULE_PROFILE.profileId,
      applicationProfileVersion: ALERT_RULE_PROFILE.version,
      applicationProfileStatus: dbProfile?.status ?? ALERT_RULE_PROFILE.status,
      databaseRoleMismatch: permissionMismatch,
    });

    return NextResponse.json({
      ok: true,
      role: access.context.role,
      permissionMismatch,
      profileApprovalReference: (profiles?.[0] as { approval_reference?: string | null } | undefined)?.approval_reference ?? null,
      profileEffectiveFromWeek: (profiles?.[0] as { effective_from_week?: string | null } | undefined)?.effective_from_week ?? null,
      report,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถตรวจสอบความพร้อมของ Alert Center กับ Supabase ได้" }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
