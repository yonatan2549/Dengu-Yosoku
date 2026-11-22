import { NextRequest, NextResponse } from "next/server";
import { getAuthCookieOptions, getSupabaseServerConfig, isSameOriginRequest } from "@/lib/supabase/config";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) {
    return NextResponse.json({ error: "คำขอไม่ผ่านการตรวจสอบแหล่งที่มา" }, { status: 403 });
  }
  const config = getSupabaseServerConfig();
  const accessToken = request.cookies.get("dy-supabase-access")?.value;

  if (config && accessToken) {
    try {
      await fetch(config.url + "/auth/v1/logout", {
        method: "POST",
        headers: {
          apikey: config.anonKey,
          Authorization: "Bearer " + accessToken,
        },
        cache: "no-store",
      });
    } catch {
      // Local cookies are still cleared if the upstream logout is unavailable.
    }
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  const options = getAuthCookieOptions();
  response.cookies.set("dy-supabase-access", "", { ...options, maxAge: 0 });
  response.cookies.set("dy-supabase-refresh", "", { ...options, maxAge: 0 });
  return response;
}
