"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import type { ModelValidationReport } from "@/lib/model/validation";
import { useDengueData } from "@/components/DataProvider";
import { assessModelSnapshotConsistency } from "@/lib/model/snapshot-consistency";
import { deriveModelConsumerReadiness } from "@/lib/model/consumer-readiness";
import type { RefreshObservabilityStatus } from "@/lib/model/refresh-observability";

type DiagnosticsResponse = {
  ok?: boolean;
  report?: ModelValidationReport;
  artifacts?: {
    predictionsSha256?: string | null;
    metricsSha256?: string | null;
    predictionsAvailable?: boolean;
    metricsAvailable?: boolean;
  };
  error?: string;
};

function formatTime(value: string | null) {
  if (!value) return "ไม่มีข้อมูล";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "ไม่มีข้อมูล";
  return date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
}

function statusText(status: ModelValidationReport["status"]) {
  if (status === "valid") return "ผ่านการตรวจสอบ";
  if (status === "warning") return "ผ่านโครงสร้างหลัก แต่มีข้อควรระวัง";
  if (status === "missing") return "ไม่พบ Model Snapshot";
  return "ไม่ผ่านการตรวจสอบ";
}

export function ModelValidationPanel({ compact = false }: { compact?: boolean }) {
  const { modelArtifactFingerprints, loading: dataLoading } = useDengueData();
  const [payload, setPayload] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshStatus, setRefreshStatus] = useState<RefreshObservabilityStatus | "unavailable">("unavailable");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/model/diagnostics", { cache: "no-store" });
      const result = await response.json().catch(() => null) as DiagnosticsResponse | null;
      if (!response.ok || !result?.ok || !result.report) {
        throw new Error(result?.error ?? "โหลดรายงานตรวจสอบโมเดลไม่สำเร็จ");
      }
      setPayload(result);
      try {
        const refreshResponse = await fetch("/api/model/refresh-observability", { cache: "no-store" });
        const refreshPayload = await refreshResponse.json().catch(() => null) as { status?: RefreshObservabilityStatus } | null;
        setRefreshStatus(refreshResponse.ok && (refreshPayload?.status === "ready" || refreshPayload?.status === "warning" || refreshPayload?.status === "blocked")
          ? refreshPayload.status
          : "unavailable");
      } catch {
        setRefreshStatus("unavailable");
      }
    } catch (cause) {
      setPayload(null);
      setRefreshStatus("unavailable");
      setError(cause instanceof Error ? cause.message : "ไม่สามารถเชื่อมต่อ Model Diagnostics API ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const report = payload?.report;
  const consistency = assessModelSnapshotConsistency({
    client: modelArtifactFingerprints,
    server: {
      predictions: {
        available: payload?.artifacts?.predictionsAvailable ?? false,
        sha256: payload?.artifacts?.predictionsSha256 ?? null,
      },
      metrics: {
        available: payload?.artifacts?.metricsAvailable ?? false,
        sha256: payload?.artifacts?.metricsSha256 ?? null,
      },
    },
    serverDiagnosticsAvailable: Boolean(payload?.ok && payload?.report),
  });
  const readiness = report ? deriveModelConsumerReadiness({
    validation: report,
    consistency,
    refreshStatus,
  }) : null;
  const consistencyClass = consistency.status === "match" ? "historical-notice" : "inline-callout warning";
  const consistencyTitle = consistency.status === "match"
    ? "Snapshot บน Dashboard/Prevention ตรงกับ Server"
    : consistency.status === "mismatch"
      ? "พบ Model Snapshot คนละชุดระหว่างเบราว์เซอร์กับ Server"
      : consistency.status === "missing"
        ? "ยังไม่มี Model Snapshot ให้เปรียบเทียบ"
        : "ยังยืนยันความตรงกันของ Model Snapshot ไม่ได้";
  const bannerClass = report?.status === "valid" ? "historical-notice" : "inline-callout warning";

  return (
    <section className="panel model-validation-panel" aria-live="polite">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">MODEL RELEASE & DATA INTEGRITY</div>
          <h2>{compact ? "ความพร้อมของข้อมูลสำหรับแต่ละระบบ" : "Model Snapshot · Validation Report"}</h2>
          <p>{compact ? "ตรวจความตรงกันและความใหม่ก่อนใช้ Forecast ประกอบการป้องกันหรือประเมิน Alert" : "ตรวจไฟล์โมเดลจาก Server ที่ให้บริการจริง ไม่ใช้ข้อมูลสถานะที่ส่งมาจากเบราว์เซอร์"}</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => setRefreshToken((value) => value + 1)} disabled={loading}>
          <RefreshCw size={15} /> ตรวจสอบอีกครั้ง
        </button>
      </div>

      {loading ? <p className="panel-note">กำลังตรวจสอบ Model Predictions และ Metrics จาก Server...</p> : null}
      {error ? <div className="inline-callout warning"><AlertTriangle size={17} /><span>{error}</span></div> : null}

      {!loading && !dataLoading ? (
        <div className={consistencyClass}>
          <CircleAlert size={17} />
          <span>
            <strong>{consistencyTitle}</strong><br />
            {consistency.detail}
            {consistency.status === "mismatch" || consistency.status === "unverifiable" ? (
              <>
                <br />
                <button type="button" className="button button-secondary" onClick={() => window.location.reload()}>
                  โหลดหน้าและ Model Snapshot ใหม่
                </button>
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      {readiness && !loading && (
        <div style={{ marginTop: 16 }}>
          <div className="eyebrow">CROSS-SYSTEM DATA USE</div>
          <div className="metric-grid metric-grid-three model-validation-metrics">
            <article className="metric-card">
              <div className="metric-card-top"><span>Dashboard</span><span className="metric-icon blue">D</span></div>
              <strong>{readiness.dashboard.label}</strong>
              <small>{readiness.dashboard.detail}</small>
            </article>
            <article className="metric-card">
              <div className="metric-card-top"><span>Prevention</span><span className="metric-icon aqua">P</span></div>
              <strong>{readiness.prevention.label}</strong>
              <small>{readiness.prevention.detail}</small>
            </article>
            <article className="metric-card">
              <div className="metric-card-top"><span>Alert · Model Gate</span><span className="metric-icon amber">A</span></div>
              <strong>{readiness.alerts.label}</strong>
              <small>{readiness.alerts.detail}</small>
            </article>
          </div>
          <div className="panel-note" style={{ marginTop: 8 }}>
            <strong>Refresh Observability:</strong> {refreshStatus} · {readiness.note}
          </div>
        </div>
      )}

      {!compact && report ? <>
        <div className={bannerClass}>
          {report.status === "valid" ? <ShieldCheck size={17} /> : <CircleAlert size={17} />}
          <span><strong>{statusText(report.status)}</strong><br />{report.summary}</span>
        </div>

        <div className="metric-grid metric-grid-four model-validation-metrics">
          <article className="metric-card"><div className="metric-card-top"><span>จังหวัด</span><span className="metric-icon blue">77</span></div><strong>{report.provinceCount}/77</strong><small>รายชื่อจังหวัดไม่ซ้ำ</small></article>
          <article className="metric-card"><div className="metric-card-top"><span>Forecast rows</span><span className="metric-icon aqua">F</span></div><strong>{report.forecastRows}/77</strong><small>{report.forecastWeek ?? "ไม่มีสัปดาห์เป้าหมาย"}</small></article>
          <article className="metric-card"><div className="metric-card-top"><span>Holdout</span><span className="metric-icon blue">H</span></div><strong>{report.historyRows.toLocaleString("th-TH")}</strong><small>{report.historyWeeks} สัปดาห์</small></article>
          <article className="metric-card"><div className="metric-card-top"><span>Snapshot Freshness</span><span className="metric-icon amber">◷</span></div><strong>{report.freshness === "stale" ? `ย้อนหลัง ${report.forecastLagWeeks ?? 0} สัปดาห์` : report.freshness === "current_or_future" ? "ไม่ล้าหลัง" : "ไม่ทราบ"}</strong><small>สัปดาห์ปัจจุบัน {report.currentEpiWeek}</small></article>
        </div>

        <div className="action-list model-validation-checks">
          {report.checks.map((check) => (
            <article className="action-item" key={check.id}>
              <div className="action-number">{check.status === "pass" ? <CheckCircle2 size={16} /> : check.status === "warning" ? <CircleAlert size={16} /> : <AlertTriangle size={16} />}</div>
              <div className="action-copy"><strong>{check.label}</strong><p>{check.detail}</p></div>
              <span className={`risk-pill ${check.status === "pass" ? "risk-normal" : check.status === "warning" ? "risk-watch" : "risk-high"}`}>{check.status === "pass" ? "ผ่าน" : check.status === "warning" ? "ข้อควรระวัง" : "ไม่ผ่าน"}</span>
            </article>
          ))}
        </div>

        <div className="model-validation-provenance">
          <strong>แหล่งที่มาและรุ่นข้อมูล</strong>
          <p>Model: {report.modelName ?? "ไม่มีข้อมูล"}</p>
          <p>Repository: {report.sourceRepository ?? "ไม่มีข้อมูล"}</p>
          <p>Commit: {report.modelRevision ?? "ไม่มีข้อมูล"}</p>
          <p>สร้าง Snapshot: {formatTime(report.generatedAtUtc)}</p>
          <p>ดึงจาก Repository: {formatTime(report.sourceRetrievedAtUtc)}</p>
          <p>สร้างไฟล์สำหรับเว็บ: {formatTime(report.convertedAtUtc)}</p>
          <p>Metrics: {report.metricsMatch ? `MAE ${report.mae} · RMSE ${report.rmse} · cutoff ${report.evalCutoff}` : "ยังยืนยันไม่ได้"}</p>
          <p>SHA-256 Predictions: {payload?.artifacts?.predictionsSha256 ?? "ไม่มีไฟล์"}</p>
          <p>SHA-256 Metrics: {payload?.artifacts?.metricsSha256 ?? "ไม่มีไฟล์"}</p>
        </div>

        <div className={report.canUseForCurrentAlerting ? "historical-notice" : "inline-callout warning"}>
          <ShieldCheck size={17} />
          <span><strong>{report.canUseForCurrentAlerting ? "ผ่านเงื่อนไขข้อมูลสำหรับประเมิน Alert ปัจจุบัน" : "ยังไม่ผ่านเงื่อนไขข้อมูลสำหรับ Alert ปัจจุบัน"}</strong><br />Dry-run อาจตรวจสอบ Snapshot ย้อนหลังได้ แต่ Engine จะไม่สร้าง Candidate จาก Forecast ที่เก่า; สถานะนี้ไม่ใช่การอนุมัติเกณฑ์หรือเปิดการแจ้งเตือนภายนอก</span>
        </div>
      </> : null}
    </section>
  );
}
