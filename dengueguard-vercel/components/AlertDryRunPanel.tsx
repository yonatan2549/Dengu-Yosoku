"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, CircleAlert, Download, History, ShieldAlert } from "lucide-react";
import { ALERT_RULE_PROFILE } from "@/lib/alerting/profile";
import { AlertEventLifecyclePanel } from "@/components/AlertEventLifecyclePanel";
import { evaluateAlertDryRun } from "@/lib/alerting/engine";
import {
  appendAlertAuditRecord,
  createAlertAuditRecord,
  readAlertAuditRecords,
  writeAlertAuditRecords,
  type AlertAuditRecord,
} from "@/lib/alerting/audit";
import { getCurrentEpiWeekStart } from "@/lib/utils";
import { useDengueData } from "@/components/DataProvider";
import { enforceCurrentAlertEligibility } from "@/lib/model/validation";
import type { ModelPredictionsPayload } from "@/lib/types";
import type { AlertCheckStatus, AlertModelSnapshot, AlertRuleProfile } from "@/lib/alerting/types";

type AuditStorageStatus = "loading" | "saved" | "unavailable";

function CheckIcon({ status }: { status: AlertCheckStatus }) {
  if (status === "pass") return <CheckCircle2 size={16} aria-hidden="true" />;
  if (status === "warning") return <CircleAlert size={16} aria-hidden="true" />;
  return <ShieldAlert size={16} aria-hidden="true" />;
}

function formatAuditTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(timestamp);
}

export function AlertDryRunPanel({ model }: { model: ModelPredictionsPayload | null }) {
  const { modelArtifactFingerprints } = useDengueData();
  const currentEpiWeek = useMemo(() => getCurrentEpiWeekStart(), []);
  const [runtimeProfile, setRuntimeProfile] = useState<AlertRuleProfile>(ALERT_RULE_PROFILE);
  const [runtimeProfileLoaded, setRuntimeProfileLoaded] = useState(false);
  const auditSnapshot = useMemo<AlertModelSnapshot | null>(() => {
    if (!model) return null;
    return {
      model_revision: model.model_revision,
      source_repository: model.source_repository,
      generated_at_utc: model.generated_at_utc,
      source_retrieved_at_utc: model.freshness?.source_retrieved_at_utc ?? null,
      province_count: model.province_count,
      provinces: model.provinces,
      forecast: model.forecast.map((row) => ({
        province: row.province,
        week_start: row.week_start,
        prediction: row.prediction,
      })),
      coverage: {
        forecast_rows: model.coverage.forecast_rows,
        forecast_week: model.coverage.forecast_week,
        history_end_week: model.coverage.history_end_week,
      },
    };
  }, [model]);

  useEffect(() => {
    let active = true;
    async function loadRuntimeProfile() {
      try {
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        const session = await sessionResponse.json().catch(() => null) as { authenticated?: boolean; role?: string } | null;
        if (active && sessionResponse.ok && session?.authenticated && (session.role === "reviewer" || session.role === "administrator")) {
          const response = await fetch("/api/alerts/runtime-profile", { cache: "no-store" });
          const payload = await response.json().catch(() => null) as { ok?: boolean; profile?: AlertRuleProfile } | null;
          if (response.ok && payload?.ok && payload.profile) {
            if (active) setRuntimeProfile(payload.profile);
          } else if (active) {
            setRuntimeProfile(ALERT_RULE_PROFILE);
          }
        } else if (active) {
          setRuntimeProfile(ALERT_RULE_PROFILE);
        }
      } catch {
        if (active) setRuntimeProfile(ALERT_RULE_PROFILE);
      } finally {
        if (active) setRuntimeProfileLoaded(true);
      }
    }
    const refresh = () => {
      setRuntimeProfileLoaded(false);
      void loadRuntimeProfile();
    };
    void loadRuntimeProfile();
    window.addEventListener("dy:alerts-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("dy:alerts-updated", refresh);
    };
  }, []);

  const report = useMemo(() => {
    const evaluated = evaluateAlertDryRun(auditSnapshot, runtimeProfile, currentEpiWeek);
    const releaseApproved = !model || model.schema_version < 3 || model.release_status === "approved";
    return enforceCurrentAlertEligibility(
      evaluated,
      releaseApproved,
      releaseApproved
        ? ""
        : "Model Snapshot ยังเป็น Review-only: Dashboard แสดงผลได้ แต่บล็อกการสร้าง WATCH/ALERT Candidate จนกว่าจะได้รับอนุมัติแยก",
    );
  }, [auditSnapshot, runtimeProfile, currentEpiWeek, model]);
  const [auditRecords, setAuditRecords] = useState<AlertAuditRecord[]>([]);
  const [auditStorageStatus, setAuditStorageStatus] = useState<AuditStorageStatus>("loading");
  const [databaseSyncStatus, setDatabaseSyncStatus] = useState<"checking" | "saved" | "signed_out" | "read_only" | "migration_required" | "snapshot_mismatch" | "unavailable" | "no_model">("checking");

  useEffect(() => {
    try {
      const storage = window.localStorage;
      const previous = readAlertAuditRecords(storage);
      const record = createAlertAuditRecord(
        auditSnapshot,
        runtimeProfile,
        report,
      );
      const next = appendAlertAuditRecord(previous, record);
      const saved = writeAlertAuditRecords(storage, next);
      setAuditRecords(next);
      setAuditStorageStatus(saved ? "saved" : "unavailable");
    } catch {
      setAuditStorageStatus("unavailable");
    }
  }, [auditSnapshot, report]);

  useEffect(() => {
    let active = true;
    async function syncEvaluation() {
      if (!runtimeProfileLoaded) return;
      if (!auditSnapshot) {
        setDatabaseSyncStatus("no_model");
        return;
      }
      setDatabaseSyncStatus("checking");
      try {
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        const session = await sessionResponse.json().catch(() => null) as { authenticated?: boolean; role?: string } | null;
        if (!active) return;
        if (!sessionResponse.ok || !session?.authenticated) {
          setDatabaseSyncStatus("signed_out");
          return;
        }
        if (session.role !== "reviewer" && session.role !== "administrator") {
          setDatabaseSyncStatus("read_only");
          return;
        }
        const response = await fetch("/api/alerts/evaluations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelSnapshot: auditSnapshot,
            artifactFingerprints: modelArtifactFingerprints,
          }),
        });
        const payload = await response.json().catch(() => null) as { error?: string; code?: string; migrationRequired?: boolean } | null;
        if (!active) return;
        if (response.ok) {
          setDatabaseSyncStatus("saved");
        } else if (response.status === 503 && payload?.migrationRequired) {
          setDatabaseSyncStatus("migration_required");
        } else if (response.status === 401) {
          setDatabaseSyncStatus("signed_out");
        } else if (response.status === 403) {
          setDatabaseSyncStatus("read_only");
        } else if (response.status === 409 && [
          "MODEL_ARTIFACT_MISMATCH",
          "MODEL_FINGERPRINT_MISSING",
          "MODEL_SNAPSHOT_CHANGED",
        ].includes(payload?.code ?? "")) {
          setDatabaseSyncStatus("snapshot_mismatch");
        } else {
          setDatabaseSyncStatus("unavailable");
        }
      } catch {
        if (active) setDatabaseSyncStatus("unavailable");
      }
    }
    void syncEvaluation();
    return () => { active = false; };
  }, [auditSnapshot, modelArtifactFingerprints, runtimeProfile, runtimeProfileLoaded]);

  const databaseSyncLabel = databaseSyncStatus === "saved"
    ? "บันทึกผลประเมินลงฐานข้อมูลกลางแล้ว"
    : databaseSyncStatus === "checking"
      ? "กำลังตรวจสิทธิ์และบันทึกผลประเมิน"
      : databaseSyncStatus === "signed_out"
        ? "เข้าสู่ระบบเพื่อบันทึกผลประเมินกลาง"
        : databaseSyncStatus === "read_only"
          ? "บัญชีนี้อ่านได้ แต่ไม่มีสิทธิ์ Reviewer/Admin สำหรับบันทึก"
          : databaseSyncStatus === "migration_required"
            ? "ต้องติดตั้ง Migration 004 ใน Supabase ก่อน"
            : databaseSyncStatus === "snapshot_mismatch"
            ? "ยืนยัน Snapshot จากเบราว์เซอร์กับ Server ไม่สำเร็จ กรุณาโหลดหน้าใหม่"
            : databaseSyncStatus === "no_model"
              ? "ยังไม่มี Model Snapshot สำหรับบันทึก"
              : "ยังเชื่อมต่อฐานข้อมูลกลางไม่ได้";

  const statusLabel = report.status === "evaluated"
    ? "กฎผ่านการตรวจสอบในโหมดจำลอง"
    : "ยังไม่พร้อมประเมินระดับแจ้งเตือน";
  const freshnessLabel = report.freshness === "stale"
    ? `เก่ากว่า ${report.forecastLagWeeks ?? 0} สัปดาห์`
    : report.freshness === "current_or_future"
      ? "ไม่เก่ากว่าสัปดาห์ปัจจุบัน"
      : "ไม่ทราบ";

  function exportAuditHistory() {
    if (!auditRecords.length) return;
    const exportPayload = {
      product: "DengueYosoku",
      exportType: "browser_local_alert_dry_run_audit",
      exportedAtUtc: new Date().toISOString(),
      storageScope: "this_browser_only",
      records: auditRecords,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dengueyosoku-alert-dry-run-audit.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel alert-performance-panel" aria-live="polite">
      <div className="panel-heading">
        <div>
          <h2>Alert Evaluation Engine · Dry-run</h2>
          <p>ตรวจความพร้อมของข้อมูลและเกณฑ์ โดยไม่ส่งการแจ้งเตือนจริง</p>
        </div>
        <BellRing size={20} />
      </div>

      <div className={report.status === "evaluated" ? "historical-notice" : "inline-callout warning"}>
        <CircleAlert size={17} />
        <span>
          <strong>{statusLabel}</strong>
          <br />
          ระบบกำลังทำงานในโหมดจำลองเท่านั้น การแจ้งเตือน LINE, Email, SMS และช่องทางภายนอกถูกปิดไว้เสมอ
        </span>
      </div>

      <div className={databaseSyncStatus === "saved" ? "historical-notice" : "inline-callout warning"}>
        <CircleAlert size={17} />
        <span><strong>ฐานข้อมูลกลาง: {databaseSyncLabel}</strong><br />ระบบจะคำนวณ Dry-run ซ้ำบนเซิร์ฟเวอร์ และบันทึกเฉพาะข้อมูลโมเดล/กฎ/ผลประเมิน ไม่รับผล Candidate ที่ส่งมาจากเบราว์เซอร์</span>
      </div>

      <div className="performance-grid">
        <div>
          <span>ข้อมูลพยากรณ์</span>
          <strong>{report.forecastProvinceCount}/77 จังหวัด</strong>
        </div>
        <div>
          <span>ตรวจประเมินแล้ว</span>
          <strong>{report.evaluatedProvinceCount}/77 จังหวัด</strong>
        </div>
        <div>
          <span>Rule Profile</span>
          <strong>{report.ruleProfileVersion}</strong>
        </div>
      </div>

      <div className="metric-grid metric-grid-three">
        <article className="metric-card">
          <div className="metric-card-top"><span>WATCH candidates</span><span className="metric-icon amber">W</span></div>
          <strong>{report.watchCandidateCount}</strong>
          <small>เหตุการณ์จำลองที่เข้าเกณฑ์เฝ้าระวัง</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>ALERT candidates</span><span className="metric-icon red">!</span></div>
          <strong>{report.alertCandidateCount}</strong>
          <small>เหตุการณ์จำลองที่เข้าเกณฑ์เตือน</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>ความใหม่ของ Snapshot</span><span className="metric-icon blue">◷</span></div>
          <strong>{freshnessLabel}</strong>
          <small>เป้าหมาย {report.targetWeek ?? "ไม่มีข้อมูล"}</small>
        </article>
      </div>

      <div className="panel-note">
        <strong>รายการตรวจสอบ Dry-run</strong>
      </div>
      <div className="action-list">
        {report.checks.map((check) => (
          <article className="action-item" key={check.id}>
            <div className="action-number"><CheckIcon status={check.status} /></div>
            <div className="action-copy">
              <strong>{check.label}</strong>
              <p>{check.detail}</p>
            </div>
            <span className={check.status === "pass" ? "risk-pill risk-normal" : check.status === "warning" ? "risk-pill risk-watch" : "risk-pill risk-high"}>
              {check.status === "pass" ? "ผ่าน" : check.status === "warning" ? "ข้อควรระวัง" : "ยังไม่ผ่าน"}
            </span>
          </article>
        ))}
      </div>

      {report.candidateEvents.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>จังหวัด</th>
                <th>สัญญาณจำลอง</th>
                <th>ค่าพยากรณ์</th>
                <th>เกณฑ์</th>
                <th>สถานะ Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {report.candidateEvents.map((event) => (
                <tr key={event.eventId}>
                  <td>{event.province}</td>
                  <td>{event.level === "ALERT" ? "เตือน (ALERT)" : "เฝ้าระวัง (WATCH)"}</td>
                  <td className="numeric-cell">{event.predictedCases.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
                  <td className="numeric-cell">{event.threshold.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
                  <td>{event.snapshotIsStale ? "ข้อมูลย้อนหลัง" : "ไม่เก่ากว่าสัปดาห์ปัจจุบัน"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="panel-note">
          {report.status === "blocked"
            ? `ยังไม่สร้าง Candidate events: ${report.blockedReasons.join(" · ")}`
            : "รอบการประเมินนี้ไม่พบจังหวัดที่เข้าเกณฑ์จำลอง WATCH หรือ ALERT"}
        </p>
      )}

      <AlertEventLifecyclePanel />

      <section className="alert-audit-section" aria-label="ประวัติการประเมินระบบแจ้งเตือน">
        <div className="alert-audit-toolbar">
          <div>
            <h3><History size={16} aria-hidden="true" /> ประวัติการประเมิน (Audit log)</h3>
            <p>เก็บสูงสุด 30 รอบในเบราว์เซอร์นี้ และบันทึกซ้ำเฉพาะเมื่อชุดข้อมูล/กฎ/สัปดาห์เปลี่ยน</p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={exportAuditHistory}
            disabled={!auditRecords.length}
          >
            <Download size={15} /> ส่งออก JSON
          </button>
        </div>

        {auditStorageStatus === "unavailable" && (
          <p className="panel-note">
            เบราว์เซอร์ไม่อนุญาตให้บันทึกประวัติในเครื่อง รอบปัจจุบันยังแสดงผลได้ แต่ไม่ได้บันทึกถาวร
          </p>
        )}

        {auditRecords.length ? (
          <div className="alert-audit-records">
            {auditRecords.slice(0, 6).map((record) => (
              <article className="alert-audit-record" key={record.id}>
                <div className="alert-audit-record-top">
                  <strong>{record.status === "evaluated" ? "ประเมินแล้ว · Dry-run" : "Blocked · ยังไม่พร้อมประเมิน"}</strong>
                  <time dateTime={record.evaluatedAtUtc}>{formatAuditTimestamp(record.evaluatedAtUtc)}</time>
                </div>
                <p>
                  เป้าหมาย {record.targetWeek ?? "ไม่มีข้อมูล"}
                  {" · "}สัปดาห์ปัจจุบัน {record.currentEpiWeek}
                  {" · "}{record.freshness === "stale" ? `ข้อมูลย้อนหลัง ${record.forecastLagWeeks ?? 0} สัปดาห์` : record.freshness === "unknown" ? "ไม่ทราบความใหม่" : "ไม่ล้าหลัง"}
                </p>
                <p>
                  ตรวจแล้ว {record.evaluatedProvinceCount}/77 จังหวัด
                  {" · "}WATCH {record.watchCandidateCount}
                  {" · "}ALERT {record.alertCandidateCount}
                  {" · "}Profile {record.ruleProfileVersion}
                </p>
                <small>
                  Model SHA: {record.modelRevision ? record.modelRevision.slice(0, 12) : "ไม่มี"}
                  {" · "}Source: {record.sourceRepository ?? "ไม่มี"}
                </small>
                {record.blockedReasons.length > 0 && (
                  <small className="alert-audit-reason">{record.blockedReasons.join(" · ")}</small>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="panel-note">ยังไม่มีประวัติที่บันทึกไว้ในเบราว์เซอร์นี้</p>
        )}
        <p className="alert-audit-footnote">
          รายการด้านบนเป็นสำเนา Audit สำหรับส่งออกในเบราว์เซอร์ ส่วนผลประเมินและ Event Lifecycle ที่บันทึกสำเร็จจะอยู่ในฐานข้อมูลกลาง
          ไม่มีข้อมูลผู้ป่วยหรือข้อมูลส่วนบุคคลถูกบันทึก และไม่มีการส่งการแจ้งเตือนออกนอกระบบ
        </p>
      </section>

      <p className="panel-note">
        เกณฑ์ปัจจุบัน: {report.ruleProfileStatus === "approved" ? "อนุมัติแล้ว" : "Draft · ยังไม่อนุมัติ"}
        {" · "}Threshold ครอบคลุม {Object.keys(runtimeProfile.thresholdsByProvince).length}/77 จังหวัด
        {" · "}Candidate events เป็นผลจำลองเท่านั้น ไม่มีการส่งออกไปยังผู้รับ
      </p>
    </section>
  );
}
