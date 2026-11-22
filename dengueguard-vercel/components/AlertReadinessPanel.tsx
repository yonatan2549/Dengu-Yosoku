"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { assessAlertWorkflowReadiness, type AlertWorkflowReadinessReport } from "@/lib/alerting/workflow-readiness";

interface ReadinessReport {
  migration004Available: boolean;
  databaseRoleMismatch: boolean;
  profileFound: boolean;
  profileStatus: "draft" | "approved" | null;
  profileVersion: string | null;
  profileMatchesApplication: boolean;
  thresholdCount: number;
  expectedThresholdCount: number;
  missingProvinces: string[];
  unexpectedProvinces: string[];
  duplicateThresholdProvinces: string[];
  invalidThresholdProvinces: string[];
  externalNotificationsEnabled: false;
  canCreateCandidates: boolean;
  blockers: string[];
}

type LoadState = "loading" | "ready" | "signed_out" | "forbidden" | "unavailable";

export function AlertReadinessPanel({ provinces }: { provinces: string[] }) {
  const [state, setState] = useState<LoadState>("loading");
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<AlertWorkflowReadinessReport | null>(null);
  const [message, setMessage] = useState("");
  const provinceKey = provinces.join("\u001f");

  const load = useCallback(async () => {
    setState("loading");
    setWorkflow(null);
    setMessage("");
    try {
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json().catch(() => null) as { authenticated?: boolean; role?: string } | null;
      if (!sessionResponse.ok || !session?.authenticated) {
        setReport(null);
        setWorkflow(null);
        setState("signed_out");
        setMessage("กรุณาเข้าสู่ระบบเพื่อดูสถานะฐานข้อมูลกลาง");
        return;
      }
      if (session.role !== "reviewer" && session.role !== "administrator") {
        setReport(null);
        setWorkflow(null);
        setRole(session.role ?? null);
        setState("forbidden");
        setMessage("บัญชีนี้ไม่มีสิทธิ์ Reviewer/Admin สำหรับตรวจสอบ Alert Center");
        return;
      }
      setRole(session.role);
      const response = await fetch("/api/alerts/readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provinces }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as {
        report?: ReadinessReport;
        error?: string;
      } | null;
      if (!response.ok || !payload?.report) {
        setReport(null);
        setWorkflow(null);
        setState(response.status === 401 ? "signed_out" : response.status === 403 ? "forbidden" : "unavailable");
        setMessage(payload?.error ?? "ตรวจสอบฐานข้อมูลกลางไม่สำเร็จ");
        return;
      }
      setReport(payload.report);
      const workflowResponse = await fetch("/api/alerts/admin/profile", { cache: "no-store" });
      const workflowPayload = await workflowResponse.json().catch(() => null) as unknown;
      setWorkflow(assessAlertWorkflowReadiness(workflowResponse.status, workflowPayload));
      setState("ready");
    } catch {
      setReport(null);
      setWorkflow(null);
      setState("unavailable");
      setMessage("ไม่สามารถติดต่อ API ตรวจสอบความพร้อมได้");
    }
  }, [provinceKey]); // provinceKey changes whenever the source province list changes.

  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("dy:alerts-updated", refresh);
    return () => window.removeEventListener("dy:alerts-updated", refresh);
  }, [load]);

  const headline = state !== "ready"
    ? state === "loading" ? "กำลังตรวจสอบฐานข้อมูลกลาง"
      : state === "signed_out" ? "ต้องเข้าสู่ระบบ"
      : state === "forbidden" ? "บัญชีนี้ไม่มีสิทธิ์ตรวจสอบ"
      : "ยังตรวจสอบฐานข้อมูลกลางไม่ได้"
    : report?.canCreateCandidates ? "องค์ประกอบผ่านเกณฑ์ความพร้อม"
    : "เชื่อมต่อฐานข้อมูลแล้ว แต่ยังไม่พร้อมสร้าง Candidate";

  return (
    <section className="panel alert-performance-panel" aria-live="polite">
      <div className="panel-heading">
        <div>
          <h2><Activity size={18} aria-hidden="true" /> Alert Center · Operational Readiness</h2>
          <p>ตรวจสอบ Migration, Rule Profile และ Threshold จริงจาก Supabase แบบอ่านอย่างเดียว</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => void load()} disabled={state === "loading"}>
          <RefreshCw size={15} /> ตรวจสอบอีกครั้ง
        </button>
      </div>

      <div className={state === "ready" && report?.canCreateCandidates ? "historical-notice" : "inline-callout warning"}>
        {state === "ready" && report?.canCreateCandidates ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
        <span><strong>{headline}</strong>{message ? ` · ${message}` : role ? ` · Role: ${role}` : ""}</span>
      </div>

      {report && state === "ready" && (
        <>
          <div className="performance-grid">
            <div><span>Migration 004 RPC</span><strong>{report.migration004Available ? "พร้อมใช้งาน" : "ยังไม่พบ"}</strong></div>
            <div><span>Rule Profile</span><strong>{report.profileFound ? report.profileStatus === "approved" ? "Approved" : "Draft" : "ไม่พบ"}</strong></div>
            <div><span>Threshold Coverage</span><strong>{report.thresholdCount}/{report.expectedThresholdCount}</strong></div>
          </div>
          <div className="performance-grid">
            <div><span>Profile Version</span><strong>{report.profileVersion ?? "ไม่มี"}</strong></div>
            <div><span>Profile ตรงกับแอป</span><strong>{report.profileMatchesApplication ? "ตรงกัน" : "ไม่ตรงกัน"}</strong></div>
            <div><span>External Notifications</span><strong>ปิดใช้งาน</strong></div>
          </div>
          {workflow && (
            <>
              <div className="performance-grid">
                <div><span>Migration 005 · Draft Workflow</span><strong>{workflow.migration005 === "ready" ? "พร้อมใช้งาน" : workflow.migration005 === "missing" ? "ยังไม่พบ" : workflow.migration005 === "not_checked" ? "ยังไม่ได้ตรวจ" : "ตรวจไม่ได้"}</strong></div>
                <div><span>Migration 006 · Expert Review</span><strong>{workflow.migration006 === "ready" ? "พร้อมใช้งาน" : workflow.migration006 === "missing" ? "ยังไม่พบ" : workflow.migration006 === "not_checked" ? "ยังไม่ได้ตรวจ" : "ตรวจไม่ได้"}</strong></div>
                <div><span>Workflow DB Check</span><strong>{workflow.status === "ready" ? "ผ่าน" : workflow.status === "partial" ? "ผ่านบางส่วน" : workflow.status === "blocked" ? "ขาด Migration" : workflow.status === "forbidden" ? "ไม่มีสิทธิ์" : workflow.status === "signed_out" ? "ไม่ได้เข้าสู่ระบบ" : "ตรวจไม่ได้"}</strong></div>
              </div>
              {workflow.status !== "ready" && (
                <div className="inline-callout warning"><AlertTriangle size={16} /><span>{workflow.note}</span></div>
              )}
            </>
          )}
          {report.blockers.length > 0 ? (
            <div className="action-list">
              {report.blockers.map((blocker) => (
                <article className="action-item" key={blocker}>
                  <div className="action-number"><AlertTriangle size={16} /></div>
                  <div className="action-copy"><strong>{blocker}</strong></div>
                </article>
              ))}
            </div>
          ) : (
            <div className="historical-notice"><CheckCircle2 size={17} /><span>ตรวจพบองค์ประกอบความพร้อมครบ แต่ยังต้องทดสอบการทำงานจริงและได้รับการอนุมัติตามกระบวนการของโครงการ</span></div>
          )}
          {(report.missingProvinces.length > 0 || report.unexpectedProvinces.length > 0 || report.duplicateThresholdProvinces.length > 0 || report.invalidThresholdProvinces.length > 0) && (
            <details className="rules-details">
              <summary>รายละเอียดจังหวัดที่ต้องตรวจสอบ</summary>
              {report.missingProvinces.length > 0 && <p>ไม่มี Threshold: {report.missingProvinces.join(", ")}</p>}
              {report.unexpectedProvinces.length > 0 && <p>จังหวัดที่ไม่อยู่ในโมเดล: {report.unexpectedProvinces.join(", ")}</p>}
              {report.duplicateThresholdProvinces.length > 0 && <p>รายการซ้ำ: {report.duplicateThresholdProvinces.join(", ")}</p>}
              {report.invalidThresholdProvinces.length > 0 && <p>ค่าเกณฑ์ไม่ถูกต้อง: {report.invalidThresholdProvinces.join(", ")}</p>}
            </details>
          )}
        </>
      )}
      <p className="alert-audit-footnote">หน้านี้ไม่อนุมัติ Profile ไม่แก้ Threshold และไม่เปิดการส่งข้อความภายนอก เป็นเพียงการตรวจสอบสถานะจากฐานข้อมูลกลาง</p>
    </section>
  );
}
