import { NextRequest, NextResponse } from "next/server";
import { getAuthCookieOptions, getSupabaseServerConfig } from "@/lib/supabase/config";

export const runtime = "nodejs";

function clearSession(response: NextResponse) {
  response.cookies.set("dy-supabase-access", "", { ...getAuthCookieOptions(), maxAge: 0 });
  response.cookies.set("dy-supabase-refresh", "", { ...getAuthCookieOptions(), maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const config = getSupabaseServerConfig();
  if (!config) {
    return NextResponse.json({ configured: false, authenticated: false, role: null });
  }

  let accessToken = request.cookies.get("dy-supabase-access")?.value;
  const refreshToken = request.cookies.get("dy-supabase-refresh")?.value;
  if (!accessToken && !refreshToken) {
    return NextResponse.json({ configured: true, authenticated: false, role: null });
  }

  try {
    let userResponse = accessToken
      ? await fetch(config.url + "/auth/v1/user", {
          headers: { apikey: config.anonKey, Authorization: "Bearer " + accessToken },
          cache: "no-store",
        })
      : null;

    let refreshed: { access_token?: string; refresh_token?: string; expires_in?: number } | null = null;
    if ((!userResponse || !userResponse.ok) && refreshToken) {
      const refreshResponse = await fetch(
        config.url + "/auth/v1/token?grant_type=refresh_token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: config.anonKey },
          body: JSON.stringify({ refresh_token: refreshToken }),
          cache: "no-store",
        },
      );
      refreshed = await refreshResponse.json().catch(() => null);
      if (refreshResponse.ok && refreshed?.access_token) {
        accessToken = refreshed.access_token;
        userResponse = await fetch(config.url + "/auth/v1/user", {
          headers: { apikey: config.anonKey, Authorization: "Bearer " + accessToken },
          cache: "no-store",
        });
      }
    }

    if (!userResponse?.ok || !accessToken) {
      return clearSession(NextResponse.json({
        configured: true, authenticated: false, role: null,
      }));
    }

    const user = await userResponse.json();
    const profileUrl = new URL(config.url + "/rest/v1/user_profiles");
    profileUrl.searchParams.set("select", "role,display_name");
    profileUrl.searchParams.set("id", "eq." + user.id);
    const profileResponse = await fetch(profileUrl, {
      headers: { apikey: config.anonKey, Authorization: "Bearer " + accessToken },
      cache: "no-store",
    });
    const profiles = profileResponse.ok ? await profileResponse.json() : [];
    const profile = Array.isArray(profiles) ? profiles[0] : null;

    const result = NextResponse.json({
      configured: true,
      authenticated: true,
      user: { id: user.id, email: user.email },
      role: profile?.role ?? "viewer",
      displayName: profile?.display_name ?? null,
    });

    if (refreshed?.access_token && refreshed.refresh_token) {
      const options = getAuthCookieOptions();
      result.cookies.set("dy-supabase-access", refreshed.access_token, {
        ...options,
        maxAge: Math.max(60, Number(refreshed.expires_in) || 3600),
      });
      result.cookies.set("dy-supabase-refresh", refreshed.refresh_token, {
        ...options,
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return result;
  } catch {
    return NextResponse.json(
      { configured: true, authenticated: false, role: null, error: "ตรวจสอบเซสชันไม่สำเร็จ" },
      { status: 502 },
    );
  }
}
