"use client";

import { useMemo } from "react";
import { BellRing, CheckCircle2, CircleAlert, ShieldAlert } from "lucide-react";
import { ALERT_RULE_PROFILE } from "@/lib/alerting/profile";
import { evaluateAlertDryRun } from "@/lib/alerting/engine";
import { getCurrentEpiWeekStart } from "@/lib/utils";
import type { ModelPredictionsPayload } from "@/lib/types";
import type { AlertCheckStatus } from "@/lib/alerting/types";

function CheckIcon({ status }: { status: AlertCheckStatus }) {
  if (status === "pass") return <CheckCircle2 size={16} aria-hidden="true" />;
  if (status === "warning") return <CircleAlert size={16} aria-hidden="true" />;
  return <ShieldAlert size={16} aria-hidden="true" />;
}

export function AlertDryRunPanel({ model }: { model: ModelPredictionsPayload | null }) {
  const currentEpiWeek = useMemo(() => getCurrentEpiWeekStart(), []);
  const report = useMemo(
    () => evaluateAlertDryRun(model, ALERT_RULE_PROFILE, currentEpiWeek),
    [model, currentEpiWeek],
  );

  const statusLabel = report.status === "evaluated"
    ? "กฎผ่านการตรวจสอบในโหมดจำลอง"
    : "ยังไม่พร้อมประเมินระดับแจ้งเตือน";
  const freshnessLabel = report.freshness === "stale"
    ? `เก่ากว่า ${report.forecastLagWeeks ?? 0} สัปดาห์`
    : report.freshness === "current_or_future"
      ? "ไม่เก่ากว่าสัปดาห์ปัจจุบัน"
      : "ไม่ทราบ";

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
          ยังไม่มี Candidate events เนื่องจาก Rule Profile ยังเป็น Draft และไม่มีเกณฑ์รายจังหวัดที่ผ่านการอนุมัติ
        </p>
      )}

      <p className="panel-note">
        เกณฑ์ปัจจุบัน: {report.ruleProfileStatus === "approved" ? "อนุมัติแล้ว" : "Draft · ยังไม่อนุมัติ"}
        {" · "}Threshold ครอบคลุม {Object.keys(ALERT_RULE_PROFILE.thresholdsByProvince).length}/77 จังหวัด
        {" · "}Candidate events เป็นผลจำลองเท่านั้น ไม่มีการส่งออกไปยังผู้รับ
      </p>
    </section>
  );
}
