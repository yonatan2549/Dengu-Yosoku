
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthCookieOptions,
  getSupabaseServerConfig,
  isSameOriginRequest,
} from "@/lib/supabase/config";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Check request origin
  if (!isSameOriginRequest(request.headers)) {
    return NextResponse.json(
      { error: "คำขอไม่ถูกต้อง" },
      { status: 403 },
    );
  }

  // Check Supabase configuration
  const config = getSupabaseServerConfig();

  if (!config) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า Supabase" },
      { status: 503 },
    );
  }

  // Read request body
  let body: { email?: unknown; password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const email =
    typeof body.email === "string" ? body.email.trim() : "";

  const password =
    typeof body.password === "string" ? body.password : "";

  if (
    !email ||
    !password ||
    email.length > 320 ||
    password.length > 1024
  ) {
    return NextResponse.json(
      { error: "กรุณากรอกอีเมลและรหัสผ่าน" },
      { status: 400 },
    );
  }

  try {
    // Send login request to Supabase Auth
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

    // Handle Supabase authentication errors
    if (
      !response.ok ||
      !payload?.access_token ||
      !payload?.refresh_token
    ) {
      console.error("[auth/login] Supabase response details:", {
        status: response.status,
        contentType: response.headers.get("content-type"),
        payloadType: typeof payload,
        payloadKeys:
          payload && typeof payload === "object"
            ? Object.keys(payload)
            : [],
        error: payload?.error,
        error_code: payload?.error_code,
        code: payload?.code,
        message: payload?.message,
        msg: payload?.msg,
        error_description: payload?.error_description,
      });

      return NextResponse.json(
        {
          error: "เข้าสู่ระบบไม่สำเร็จ",
        },
        {
          status: response.status === 429 ? 429 : 401,
        },
      );
    }

    // Create successful login response
    const result = NextResponse.json(
      { ok: true },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );

    // Set authentication cookies
    const cookieOptions = getAuthCookieOptions();

    result.cookies.set(
      "dy-supabase-access",
      payload.access_token,
      {
        ...cookieOptions,
        maxAge: Math.max(
          60,
          Number(payload.expires_in) || 3600,
        ),
      },
    );

    result.cookies.set(
      "dy-supabase-refresh",
      payload.refresh_token,
      {
        ...cookieOptions,
        maxAge: 60 * 60 * 24 * 30,
      },
    );

    return result;
  } catch (error) {
    console.error("[auth/login] Connection error:", {
      message:
        error instanceof Error
          ? error.message
          : "unknown",
    });

    return NextResponse.json(
      {
        error: "ไม่สามารถเชื่อมต่อบริการเข้าสู่ระบบได้",
      },
      { status: 502 },
    );
  }
}
