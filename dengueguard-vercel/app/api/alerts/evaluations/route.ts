import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeAlertReviewer, alertSupabaseHeaders } from "@/lib/alerting/server-auth";
import { readStoredAlertRuleProfile } from "@/lib/alerting/server-profile";
import { evaluateAlertDryRun } from "@/lib/alerting/engine";
import { createAlertAuditRecord } from "@/lib/alerting/audit";
import { getCurrentEpiWeekStart } from "@/lib/utils";
import { loadPublicModelArtifacts } from "@/lib/model/server-loader";
import { enforceCurrentAlertEligibility, toAlertModelSnapshot, validateModelExports } from "@/lib/model/validation";
import { assessModelSnapshotConsistency, type ModelArtifactFingerprints } from "@/lib/model/snapshot-consistency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseArtifactFingerprints(value: unknown): ModelArtifactFingerprints | null {
  if (!isRecord(value) || !isRecord(value.predictions) || !isRecord(value.metrics)) return null;
  const parseOne = (item: Record<string, unknown>) => {
    if (typeof item.available !== "boolean") return null;
    if (item.available) {
      if (typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(item.sha256)) return null;
      return { available: true, sha256: item.sha256.toLowerCase() };
    }
    if (item.sha256 !== null) return null;
    return { available: false, sha256: null };
  };
  const predictions = parseOne(value.predictions);
  const metrics = parseOne(value.metrics);
  return predictions && metrics ? { predictions, metrics } : null;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || (() => {
    try { return new URL(origin).host.toLowerCase() !== host.toLowerCase(); }
    catch { return true; }
  })()) {
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
    return NextResponse.json({ error: "ข้อมูลคำขอไม่ใช่ JSON ที่ถูกต้อง" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "รูปแบบคำขอประเมินไม่ถูกต้อง" }, { status: 400 });
  }
  const clientSnapshot = isRecord(body.modelSnapshot) ? body.modelSnapshot : null;
  const clientRevision = typeof clientSnapshot?.model_revision === "string"
    ? clientSnapshot.model_revision.toLowerCase()
    : null;
  const clientArtifactFingerprints = parseArtifactFingerprints(body.artifactFingerprints);
  if (!clientArtifactFingerprints) {
    return NextResponse.json({
      error: "ไม่พบ SHA-256 ของ Model Artifacts ที่เบราว์เซอร์ใช้อยู่ กรุณาโหลดหน้าเว็บใหม่",
      code: "MODEL_FINGERPRINT_MISSING",
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  // Server-served artifacts are authoritative. The browser payload is used
  // only to detect a stale page, never as input to the evaluation engine.
  let artifacts;
  try {
    artifacts = await loadPublicModelArtifacts(request.nextUrl.origin);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "อ่านไฟล์ Model Snapshot จาก Server ไม่สำเร็จ",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const serverArtifactFingerprints: ModelArtifactFingerprints = {
    predictions: { available: artifacts.predictions !== null, sha256: artifacts.predictionsSha256 },
    metrics: { available: artifacts.metrics !== null, sha256: artifacts.metricsSha256 },
  };
  const consistency = assessModelSnapshotConsistency({
    client: clientArtifactFingerprints,
    server: serverArtifactFingerprints,
    serverDiagnosticsAvailable: true,
  });
  if (consistency.status !== "match") {
    return NextResponse.json({
      error: "Model Artifacts ในเบราว์เซอร์ไม่ตรงกับชุดที่ Server ให้บริการ จึงไม่บันทึกผลประเมิน กรุณาโหลดหน้าเว็บใหม่",
      code: "MODEL_ARTIFACT_MISMATCH",
      consistency,
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  const currentEpiWeek = getCurrentEpiWeekStart();
  const modelValidation = validateModelExports(artifacts.predictions, artifacts.metrics, currentEpiWeek);
  const snapshot = toAlertModelSnapshot(artifacts.predictions);
  if (!snapshot || !modelValidation.canUseForDryRun) {
    return NextResponse.json({
      error: "Model Snapshot จาก Server ไม่ผ่านการตรวจสอบ จึงไม่บันทึกผลประเมิน",
      modelValidation,
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  if (clientRevision && snapshot.model_revision?.toLowerCase() !== clientRevision) {
    return NextResponse.json({
      error: "Model Snapshot ในเบราว์เซอร์ไม่ตรงกับไฟล์รุ่นที่ Server ให้บริการ กรุณาโหลดหน้าเว็บใหม่",
      code: "MODEL_SNAPSHOT_CHANGED",
      serverModelRevision: snapshot.model_revision,
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  // Profile, status, approval metadata, and thresholds always come from PostgreSQL.
  const storedProfile = await readStoredAlertRuleProfile(access.context);
  if (!storedProfile.ok) {
    return NextResponse.json({ error: storedProfile.message }, {
      status: storedProfile.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const activeProfile = storedProfile.profile;
  const engineReport = evaluateAlertDryRun(snapshot, activeProfile, currentEpiWeek);
  const report = enforceCurrentAlertEligibility(
    engineReport,
    modelValidation.canUseForCurrentAlerting,
    modelValidation.canUseForCurrentAlerting
      ? ""
      : "Model Snapshot ยังไม่ผ่านเงื่อนไขสำหรับ Alert ปัจจุบัน (ต้องเป็นข้อมูลไม่ล้าหลังและ Metrics ต้องตรงกับ Model Revision)",
  );
  report.checks.push({
    id: "server-model-artifact",
    label: "แหล่ง Model Snapshot ที่ใช้ประเมิน",
    status: "pass",
    detail: `อ่านจาก Server · Predictions SHA-256 ${artifacts.predictionsSha256 ?? "ไม่มี"} · Metrics SHA-256 ${artifacts.metricsSha256 ?? "ไม่มี"}`,
  });
  const audit = createAlertAuditRecord(snapshot, activeProfile, report);
  const databaseRunFingerprint = createHash("sha256").update(audit.runFingerprint).digest("hex");
  const evaluation = {
    run_fingerprint: databaseRunFingerprint,
    profile_id: activeProfile.profileId,
    profile_version: activeProfile.version,
    profile_status: activeProfile.status,
    scope: activeProfile.scope,
    metric: activeProfile.metric,
    methodology: activeProfile.methodology,
    approval_reference: activeProfile.approvalReference,
    effective_from_week: activeProfile.effectiveFromWeek,
    run_status: report.status,
    freshness: report.freshness,
    forecast_lag_weeks: report.forecastLagWeeks,
    target_week: report.targetWeek,
    current_epi_week: report.currentEpiWeek,
    model_repository: snapshot.source_repository,
    model_revision: snapshot.model_revision,
    model_generated_at: snapshot.generated_at_utc,
    source_retrieved_at: snapshot.source_retrieved_at_utc,
    history_end_week: snapshot.coverage.history_end_week,
    forecast_province_count: report.forecastProvinceCount,
    evaluated_province_count: report.evaluatedProvinceCount,
    watch_candidate_count: report.watchCandidateCount,
    alert_candidate_count: report.alertCandidateCount,
    external_notifications_enabled: false,
    checks: report.checks,
    blocked_reasons: report.blockedReasons,
    thresholds_snapshot: Object.fromEntries(
      Object.entries(activeProfile.thresholdsByProvince).map(([province, threshold]) => [
        province,
        { watch: threshold.watch, alert: threshold.alert },
      ]),
    ),
  };
  const candidates = report.candidateEvents.map((event) => ({
    event_key: event.eventId,
    province_name: event.province,
    target_week: event.weekStart,
    signal_type: event.signal,
    current_level: event.level,
    predicted_cases: event.predictedCases,
    triggering_threshold: event.threshold,
    snapshot_is_stale: event.snapshotIsStale,
  }));

  try {
    const response = await fetch(
      `${access.context.config.url}/rest/v1/rpc/dengueyosoku_record_alert_evaluation`,
      {
        method: "POST",
        headers: alertSupabaseHeaders(access.context, true),
        body: JSON.stringify({ p_evaluation: evaluation, p_candidates: candidates }),
        cache: "no-store",
      },
    );
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const databaseCode = typeof payload?.code === "string" ? payload.code : "";
      if (databaseCode === "PGRST202" || databaseCode === "42883") {
        return NextResponse.json({
          error: "ยังไม่ได้ติดตั้ง Migration 004 สำหรับบันทึก Alert Center",
          migrationRequired: true,
        }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      if (databaseCode === "42501") {
        return NextResponse.json({ error: "ฐานข้อมูลปฏิเสธสิทธิ์การบันทึก กรุณาตรวจสอบ Role และสิทธิ์ RPC" }, { status: 403 });
      }
      return NextResponse.json({
        error: typeof payload?.message === "string" ? payload.message : "บันทึกผลประเมินลงฐานข้อมูลไม่สำเร็จ",
        databaseCode: databaseCode || null,
      }, { status: databaseCode === "22023" ? 400 : 502 });
    }

    return NextResponse.json({
      ok: true,
      database: payload,
      modelSource: "server_public_model_exports",
      modelArtifactSha256: artifacts.predictionsSha256,
      metricsArtifactSha256: artifacts.metricsSha256,
      artifactConsistency: consistency.status,
      modelValidation: {
        status: modelValidation.status,
        freshness: modelValidation.freshness,
        metricsMatch: modelValidation.metricsMatch,
      },
      evaluation: {
        status: report.status,
        targetWeek: report.targetWeek,
        forecastProvinceCount: report.forecastProvinceCount,
        evaluatedProvinceCount: report.evaluatedProvinceCount,
        watchCandidateCount: report.watchCandidateCount,
        alertCandidateCount: report.alertCandidateCount,
        blockedReasons: report.blockedReasons,
        externalNotificationsEnabled: false,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถเชื่อมต่อ Supabase Alert RPC ได้" }, { status: 502 });
  }
}
