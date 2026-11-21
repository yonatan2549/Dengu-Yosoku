import { ALERT_RULE_PROFILE } from "@/lib/alerting/profile";
import type { AlertActorContext } from "@/lib/alerting/server-auth";
import type { AlertRuleProfile, ProvinceAlertThreshold } from "@/lib/alerting/types";

export type StoredProfileResult =
  | { ok: true; source: "database" | "application_fallback"; profile: AlertRuleProfile }
  | { ok: false; status: number; message: string };

function databaseCode(value: unknown): string {
  return value && typeof value === "object" && typeof (value as Record<string, unknown>).code === "string"
    ? String((value as Record<string, unknown>).code)
    : "";
}

/** Reads the governed Rule Profile and thresholds using the caller's verified JWT. */
export async function readStoredAlertRuleProfile(context: AlertActorContext): Promise<StoredProfileResult> {
  const headers = {
    apikey: context.config.anonKey,
    Authorization: `Bearer ${context.accessToken}`,
  };
  try {
    const profileUrl = new URL(`${context.config.url}/rest/v1/alert_rule_profiles`);
    profileUrl.searchParams.set("select", "id,profile_id,version,status,scope,metric,methodology,approval_reference,effective_from_week,external_notifications_enabled");
    profileUrl.searchParams.set("profile_id", `eq.${ALERT_RULE_PROFILE.profileId}`);
    profileUrl.searchParams.set("version", `eq.${ALERT_RULE_PROFILE.version}`);
    profileUrl.searchParams.set("limit", "1");
    const profileResponse = await fetch(profileUrl, { headers, cache: "no-store" });
    const profilePayload = await profileResponse.json().catch(() => null);
    if (!profileResponse.ok) {
      const code = databaseCode(profilePayload);
      const missing = ["PGRST205", "42P01"].includes(code);
      return { ok: false, status: missing ? 503 : 502, message: missing ? "ยังไม่พบตาราง Rule Profile ใน Supabase" : "อ่าน Rule Profile จาก Supabase ไม่สำเร็จ" };
    }

    const row = Array.isArray(profilePayload) ? profilePayload[0] as Record<string, unknown> | undefined : undefined;
    if (!row) return { ok: true, source: "application_fallback", profile: ALERT_RULE_PROFILE };
    if ((row.status !== "draft" && row.status !== "approved") ||
        row.scope !== "national_77_provinces" || row.metric !== "weekly_predicted_cases" ||
        row.external_notifications_enabled !== false) {
      return { ok: false, status: 409, message: "Rule Profile ในฐานข้อมูลมีสถานะหรือรูปแบบที่ไม่รองรับ" };
    }
    if (row.profile_id !== ALERT_RULE_PROFILE.profileId || row.version !== ALERT_RULE_PROFILE.version || typeof row.id !== "string") {
      return { ok: false, status: 409, message: "Rule Profile ในฐานข้อมูลไม่ตรงกับ Profile ที่แอปรองรับ" };
    }

    const thresholdUrl = new URL(`${context.config.url}/rest/v1/alert_rule_thresholds`);
    thresholdUrl.searchParams.set("select", "province_name,watch_threshold,alert_threshold");
    thresholdUrl.searchParams.set("profile_id", `eq.${row.id}`);
    thresholdUrl.searchParams.set("order", "province_name.asc");
    thresholdUrl.searchParams.set("limit", "100");
    const thresholdResponse = await fetch(thresholdUrl, { headers, cache: "no-store" });
    const thresholdPayload = await thresholdResponse.json().catch(() => null);
    if (!thresholdResponse.ok || !Array.isArray(thresholdPayload)) {
      return { ok: false, status: 502, message: "อ่าน Threshold จาก Supabase ไม่สำเร็จ" };
    }

    const thresholdsByProvince: Record<string, ProvinceAlertThreshold> = {};
    for (const item of thresholdPayload as Array<Record<string, unknown>>) {
      const province = typeof item.province_name === "string" ? item.province_name : "";
      const watch = Number(item.watch_threshold);
      const alert = Number(item.alert_threshold);
      if (!province || Object.prototype.hasOwnProperty.call(thresholdsByProvince, province) ||
          !Number.isFinite(watch) || !Number.isFinite(alert) || watch < 0 || alert <= watch) {
        return { ok: false, status: 409, message: "Threshold ในฐานข้อมูลมีชื่อซ้ำหรือค่าไม่ถูกต้อง" };
      }
      thresholdsByProvince[province] = { watch, alert };
    }

    return {
      ok: true,
      source: "database",
      profile: {
        profileId: String(row.profile_id),
        version: String(row.version),
        status: row.status,
        scope: "national_77_provinces",
        metric: "weekly_predicted_cases",
        methodology: typeof row.methodology === "string" ? row.methodology : "",
        effectiveFromWeek: typeof row.effective_from_week === "string" ? row.effective_from_week : null,
        approvalReference: typeof row.approval_reference === "string" ? row.approval_reference : null,
        thresholdsByProvince,
        externalNotificationsEnabled: false,
      },
    };
  } catch {
    return { ok: false, status: 502, message: "ไม่สามารถเชื่อมต่อเพื่ออ่าน Rule Profile จาก Supabase ได้" };
  }
}
