import { NextRequest, NextResponse } from "next/server";
import { authorizeAlertReviewer } from "@/lib/alerting/server-auth";
import { readStoredAlertRuleProfile } from "@/lib/alerting/server-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await authorizeAlertReviewer(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status, headers: { "Cache-Control": "no-store" } });
  }
  const result = await readStoredAlertRuleProfile(access.context);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, source: result.source, role: access.context.role, profile: result.profile }, {
    headers: { "Cache-Control": "no-store" },
  });
}
