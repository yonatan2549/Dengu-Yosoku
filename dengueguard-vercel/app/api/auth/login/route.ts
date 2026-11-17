import { NextRequest, NextResponse } from "next/server";
import { getAuthCookieOptions, getSupabaseServerConfig } from "@/lib/supabase/config";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const config = getSupabaseServerConfig();
  if (!config) {
    return NextResponse.json(
      { error: "ระบบเข้าสู่ระบบยังไม่ได้ตั้งค่า Supabase" },
      { status: 503 },
    );
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || email.length > 320 || password.length > 1024) {
    return NextResponse.json({ error: "กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน" }, { status: 400 });
  }

  try {
    const response = await fetch(
      config.url + "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.anonKey,
        },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
      },
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.access_token || !payload?.refresh_token) {
      return NextResponse.json(
        { error: "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมลและรหัสผ่าน" },
        { status: 401 },
      );
    }

    const result = NextResponse.json({ ok: true });
    const cookieOptions = getAuthCookieOptions();
    result.cookies.set("dy-supabase-access", payload.access_token, {
      ...cookieOptions,
      maxAge: Math.max(60, Number(payload.expires_in) || 3600),
    });
    result.cookies.set("dy-supabase-refresh", payload.refresh_token, {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * 30,
    });
    return result;
  } catch {
    return NextResponse.json({ error: "ไม่สามารถเชื่อมต่อบริการเข้าสู่ระบบได้" }, { status: 502 });
  }
}
