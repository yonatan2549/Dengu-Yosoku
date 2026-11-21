import type { NextRequest } from "next/server";
import { getSupabaseServerConfig } from "@/lib/supabase/config";

export interface AlertActorContext {
  config: { url: string; anonKey: string };
  accessToken: string;
  userId: string;
  role: "reviewer" | "administrator";
}

export type AlertActorResult =
  | { ok: true; context: AlertActorContext }
  | { ok: false; status: number; message: string };

export async function authorizeAlertReviewer(request: NextRequest): Promise<AlertActorResult> {
  const config = getSupabaseServerConfig();
  if (!config) return { ok: false, status: 503, message: "ยังไม่ได้ตั้งค่า Supabase สำหรับ Alert Center" };
  const accessToken = request.cookies.get("dy-supabase-access")?.value;
  if (!accessToken) return { ok: false, status: 401, message: "กรุณาเข้าสู่ระบบก่อนใช้งาน Alert Center" };

  try {
    const userResponse = await fetch(config.url + "/auth/v1/user", {
      headers: { apikey: config.anonKey, Authorization: "Bearer " + accessToken },
      cache: "no-store",
    });
    if (!userResponse.ok) return { ok: false, status: 401, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };
    const user = await userResponse.json() as { id?: unknown };
    if (typeof user.id !== "string") return { ok: false, status: 401, message: "ไม่สามารถยืนยันตัวตนได้" };

    const profileUrl = new URL(config.url + "/rest/v1/user_profiles");
    profileUrl.searchParams.set("select", "role");
    profileUrl.searchParams.set("id", "eq." + user.id);
    const profileResponse = await fetch(profileUrl, {
      headers: { apikey: config.anonKey, Authorization: "Bearer " + accessToken },
      cache: "no-store",
    });
    if (!profileResponse.ok) return { ok: false, status: 502, message: "ตรวจสอบสิทธิ์ผู้ใช้จากฐานข้อมูลไม่สำเร็จ" };
    const profiles = await profileResponse.json() as Array<{ role?: unknown }>;
    const role = Array.isArray(profiles) ? profiles[0]?.role : null;
    if (role !== "reviewer" && role !== "administrator") {
      return { ok: false, status: 403, message: "ต้องมีสิทธิ์ผู้ทบทวนหรือผู้ดูแลระบบจึงจัดการเหตุการณ์ได้" };
    }
    return { ok: true, context: { config, accessToken, userId: user.id, role } };
  } catch {
    return { ok: false, status: 502, message: "ไม่สามารถตรวจสอบสิทธิ์กับ Supabase ได้" };
  }
}

export function alertSupabaseHeaders(context: AlertActorContext, json = false): Record<string, string> {
  return {
    apikey: context.config.anonKey,
    Authorization: "Bearer " + context.accessToken,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}
