import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { authorizeAlertReviewer, alertSupabaseHeaders } from "@/lib/alerting/server-auth";
import { ALERT_RULE_PROFILE } from "@/lib/alerting/profile";
import { validateProfileDraftPayload } from "@/lib/alerting/profile-draft-contract";

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

function codeOf(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const code = (value as Record<string, unknown>).code;
  return typeof code === "string" ? code : "";
}

let canonicalModelProvincesCache: string[] | null | undefined;

async function readCanonicalModelProvinces(): Promise<string[] | null> {
  if (canonicalModelProvincesCache !== undefined) return canonicalModelProvincesCache;
  try {
    const file = path.join(process.cwd(), "public", "data", "model_predictions.json");
    const raw = await readFile(file, "utf8");
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    const provinces = record.provinces;
    if (record.province_count !== 77 || !Array.isArray(provinces) || provinces.length !== 77) return null;
    if (!provinces.every((item) => typeof item === "string" && item.trim().length > 0)) return null;
    const names = provinces as string[];
    canonicalModelProvincesCache = new Set(names).size === 77 ? names : null;
    return canonicalModelProvincesCache;
  } catch {
    canonicalModelProvincesCache = null;
    return null;
  }
}

async function supabaseGet<T>(
  url: URL,
  headers: Record<string, string>,
): Promise<{ ok: true; value: T } | { ok: false; code: string }> {
  const response = await fetch(url, { headers, cache: "no-store" });
  const value = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, code: codeOf(value) };
  return { ok: true, value: value as T };
}

export async function GET(request: NextRequest) {
  const access = await authorizeAlertReviewer(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, {
      status: access.status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const headers = alertSupabaseHeaders(access.context);
  const profileUrl = new URL(`${access.context.config.url}/rest/v1/alert_rule_profiles`);
  profileUrl.searchParams.set("select", "id,profile_id,version,status,scope,metric,methodology,approval_reference,effective_from_week,external_notifications_enabled,created_at,created_by,approved_at,approved_by");
  profileUrl.searchParams.set("profile_id", `eq.${ALERT_RULE_PROFILE.profileId}`);
  profileUrl.searchParams.set("version", `eq.${ALERT_RULE_PROFILE.version}`);
  profileUrl.searchParams.set("limit", "1");

  try {
    const profileResult = await supabaseGet<Array<Record<string, unknown>>>(profileUrl, headers);
    if (!profileResult.ok) {
      const missing = ["PGRST205", "42P01"].includes(profileResult.code);
      return NextResponse.json({
        error: missing ? "ยังไม่พบตาราง Rule Profile ใน Supabase" : "อ่าน Rule Profile ไม่สำเร็จ",
        migrationRequired: missing,
      }, { status: missing ? 503 : 502, headers: { "Cache-Control": "no-store" } });
    }
    const profile = profileResult.value[0] ?? null;
    if (!profile || typeof profile.id !== "string") {
      return NextResponse.json({
        ok: true,
        role: access.context.role,
        profile: null,
        thresholds: [],
        changes: [],
        reviewRequests: [],
        expectedProvinceCount: 77,
        workflowMigrations: { migration005: "not_checked", migration006: "not_checked" },
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const profileId = profile.id;
    const thresholdsUrl = new URL(`${access.context.config.url}/rest/v1/alert_rule_thresholds`);
    thresholdsUrl.searchParams.set("select", "province_name,watch_threshold,alert_threshold,updated_at");
    thresholdsUrl.searchParams.set("profile_id", `eq.${profileId}`);
    thresholdsUrl.searchParams.set("order", "province_name.asc");
    thresholdsUrl.searchParams.set("limit", "100");

    const changesUrl = new URL(`${access.context.config.url}/rest/v1/alert_rule_profile_change_log`);
    changesUrl.searchParams.set("select", "id,actor_id,action,note,created_at");
    changesUrl.searchParams.set("profile_id", `eq.${profileId}`);
    changesUrl.searchParams.set("order", "created_at.desc");
    changesUrl.searchParams.set("limit", "20");

    const reviewsUrl = new URL(`${access.context.config.url}/rest/v1/alert_rule_profile_review_requests`);
    reviewsUrl.searchParams.set("select", "id,requested_by,status,submission_note,submitted_at,profile_version,threshold_count");
    reviewsUrl.searchParams.set("profile_id", `eq.${profileId}`);
    reviewsUrl.searchParams.set("order", "submitted_at.desc");
    reviewsUrl.searchParams.set("limit", "20");

    const decisionsUrl = new URL(`${access.context.config.url}/rest/v1/alert_rule_profile_review_decisions`);
    decisionsUrl.searchParams.set("select", "id,review_request_id,decision,reviewer_id,review_note,evidence_reference,effective_from_week,reviewed_at");
    decisionsUrl.searchParams.set("profile_id", `eq.${profileId}`);
    decisionsUrl.searchParams.set("order", "reviewed_at.desc");
    decisionsUrl.searchParams.set("limit", "50");

    const [thresholdResult, changeResult, reviewResult, decisionResult] = await Promise.all([
      supabaseGet<Array<Record<string, unknown>>>(thresholdsUrl, headers),
      supabaseGet<Array<Record<string, unknown>>>(changesUrl, headers),
      supabaseGet<Array<Record<string, unknown>>>(reviewsUrl, headers),
      supabaseGet<Array<Record<string, unknown>>>(decisionsUrl, headers),
    ]);
    const failures = [thresholdResult, changeResult, reviewResult, decisionResult].filter((item) => !item.ok);
    if (failures.length) {
      const missing005 = [thresholdResult, changeResult, reviewResult].some(
        (item) => !item.ok && ["PGRST205", "42P01"].includes(item.code),
      );
      const missing006 = !decisionResult.ok && ["PGRST205", "42P01"].includes(decisionResult.code);
      const missing = missing005 || missing006;
      return NextResponse.json({
        error: missing006
          ? "ยังไม่พบตารางประวัติผลทบทวนของ Migration 006 กรุณาติดตั้ง Migration 006"
          : missing005
            ? "ยังไม่พบตาราง Workflow ของ Migration 005 กรุณาติดตั้ง Migration 005"
            : "อ่านประวัติ Rule Profile จาก Supabase ไม่สำเร็จ",
        migrationRequired: missing,
        workflowMigrations: {
          migration005: missing005 ? "missing" : thresholdResult.ok && changeResult.ok && reviewResult.ok ? "ready" : "unavailable",
          migration006: missing006 ? "missing" : reviewResult.ok && decisionResult.ok ? "ready" : "unavailable",
        },
      }, { status: missing ? 503 : 502, headers: { "Cache-Control": "no-store" } });
    }

    const decisionsByRequest = new Map<string, Record<string, unknown>>();
    if (decisionResult.ok) {
      for (const decision of decisionResult.value) {
        if (typeof decision.review_request_id === "string") {
          decisionsByRequest.set(decision.review_request_id, decision);
        }
      }
    }
    const reviewRequests = reviewResult.ok ? reviewResult.value.map((item) => ({
      ...item,
      decisionRecord: typeof item.id === "string" ? decisionsByRequest.get(item.id) ?? null : null,
    })) : [];

    return NextResponse.json({
      ok: true,
      role: access.context.role,
      profile,
      thresholds: thresholdResult.ok ? thresholdResult.value : [],
      changes: changeResult.ok ? changeResult.value : [],
      reviewRequests,
      expectedProvinceCount: 77,
      workflowMigrations: { migration005: "ready", migration006: "ready" },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถอ่าน Draft Rule Profile จาก Supabase ได้" }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
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
  if (access.context.role !== "administrator") {
    return NextResponse.json({ error: "ต้องมีสิทธิ์ Administrator เพื่อแก้ไข Draft Rule Profile" }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลคำขอไม่ใช่ JSON ที่ถูกต้อง" }, { status: 400 });
  }

  const provinces = await readCanonicalModelProvinces();
  if (!provinces) {
    return NextResponse.json({
      error: "ไม่พบ Model Snapshot ที่มีรายชื่อจังหวัดไม่ซ้ำครบ 77 จังหวัดใน public/data/model_predictions.json",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const validated = validateProfileDraftPayload(body, provinces);
  if (!validated.ok || !validated.value) {
    return NextResponse.json({
      error: "ข้อมูล Draft ไม่ผ่านการตรวจสอบ",
      errors: validated.errors,
      completeThresholdCount: validated.completeThresholdCount,
      expectedThresholdCount: validated.expectedThresholdCount,
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const { methodology, changeNote, submitForReview, thresholds } = validated.value;
  try {
    const response = await fetch(
      `${access.context.config.url}/rest/v1/rpc/dengueyosoku_save_alert_rule_draft`,
      {
        method: "POST",
        headers: alertSupabaseHeaders(access.context, true),
        body: JSON.stringify({
          p_profile_id: ALERT_RULE_PROFILE.profileId,
          p_version: ALERT_RULE_PROFILE.version,
          p_methodology: methodology,
          p_thresholds: thresholds.map((item) => ({
            province_name: item.provinceName,
            watch_threshold: item.watch,
            alert_threshold: item.alert,
          })),
          p_change_note: changeNote,
          p_submit_for_review: submitForReview,
        }),
        cache: "no-store",
      },
    );
    const result = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const code = codeOf(result);
      const migrationRequired = ["PGRST202", "42883"].includes(code);
      return NextResponse.json({
        error: migrationRequired
          ? "ยังไม่ได้ติดตั้ง Migration 005 สำหรับ Draft Workflow"
          : code === "42501"
            ? "Supabase ปฏิเสธสิทธิ์ ต้องตรวจสอบ Role Administrator ในฐานข้อมูล"
            : typeof result?.message === "string" ? result.message : "บันทึก Draft Rule Profile ไม่สำเร็จ",
        migrationRequired,
        databaseCode: code || null,
      }, { status: migrationRequired ? 503 : code === "42501" ? 403 : 400, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({
      ok: true,
      result,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถเชื่อมต่อ Supabase Draft Workflow ได้" }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
