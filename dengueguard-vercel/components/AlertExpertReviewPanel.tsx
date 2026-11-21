"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileSearch, RefreshCw, ShieldAlert, XCircle } from "lucide-react";

type ReviewDecision = "approved" | "changes_requested" | "rejected";
type DecisionRecord = {
  id: string;
  review_request_id: string;
  decision: ReviewDecision;
  reviewer_id: string;
  review_note: string;
  evidence_reference: string | null;
  effective_from_week: string | null;
  reviewed_at: string;
};
type ThresholdSnapshot = { province_name: string; watch_threshold: number; alert_threshold: number };
type ReviewRequest = {
  id: string;
  requested_by: string;
  status: "pending";
  submission_note: string;
  submitted_at: string;
  profile_version: string;
  threshold_count: number;
  profile_snapshot: {
    profile_id?: string;
    version?: string;
    status?: string;
    methodology?: string;
    thresholds?: ThresholdSnapshot[];
  };
  decisionRecord: DecisionRecord | null;
};
type ReviewForm = { note: string; evidence: string; effectiveWeek: string };
type PanelState = "loading" | "ready" | "signed_out" | "forbidden" | "unavailable";

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}

function isSunday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 0;
}

const decisionLabels: Record<ReviewDecision, string> = {
  approved: "รับรอง",
  changes_requested: "ขอให้แก้ไข",
  rejected: "ไม่รับรอง",
};

export function AlertExpertReviewPanel() {
  const [state, setState] = useState<PanelState>("loading");
  const [role, setRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [forms, setForms] = useState<Record<string, ReviewForm>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json().catch(() => null) as { authenticated?: boolean; role?: string; user?: { id?: string } } | null;
      if (!sessionResponse.ok || !session?.authenticated) {
        setRequests([]);
        setState("signed_out");
        setError("กรุณาเข้าสู่ระบบเพื่อดูคำขอทบทวน");
        return;
      }
      setRole(session.role ?? null);
      setCurrentUserId(session.user?.id ?? null);
      if (session.role !== "reviewer" && session.role !== "administrator") {
        setRequests([]);
        setState("forbidden");
        setError("บัญชีนี้ไม่มีสิทธิ์ Reviewer/Admin สำหรับอ่านคำขอทบทวน");
        return;
      }
      const response = await fetch("/api/alerts/reviews", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; requests?: ReviewRequest[]; error?: string } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.requests)) {
        setRequests([]);
        setState(response.status === 401 ? "signed_out" : response.status === 403 ? "forbidden" : "unavailable");
        setError(payload?.error ?? "อ่านคำขอทบทวนไม่สำเร็จ");
        return;
      }
      setRequests(payload.requests);
      setState("ready");
    } catch {
      setState("unavailable");
      setError("ไม่สามารถติดต่อ Expert Review API ได้");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("dy:alerts-updated", refresh);
    return () => window.removeEventListener("dy:alerts-updated", refresh);
  }, [load]);

  const pendingCount = useMemo(() => requests.filter((item) => !item.decisionRecord).length, [requests]);
  const decidedCount = requests.length - pendingCount;

  function updateForm(requestId: string, field: keyof ReviewForm, value: string) {
    setForms((previous) => ({
      ...previous,
      [requestId]: {
        ...(previous[requestId] ?? { note: "", evidence: "", effectiveWeek: "" }),
        [field]: value,
      },
    }));
  }

  async function decide(item: ReviewRequest, decision: ReviewDecision) {
    setError("");
    setMessage("");
    if (role !== "reviewer") {
      setError("การตัดสินคำขอสงวนไว้สำหรับบัญชี Role reviewer เท่านั้น");
      return;
    }
    if (!currentUserId || currentUserId === item.requested_by) {
      setError("ผู้ส่งคำขอไม่สามารถทบทวนหรือรับรองคำขอของตนเองได้ ต้องใช้บัญชี Reviewer อีกบัญชี");
      return;
    }
    const form = forms[item.id] ?? { note: "", evidence: "", effectiveWeek: "" };
    if (form.note.trim().length < 10) {
      setError("เหตุผลการทบทวนต้องมีอย่างน้อย 10 ตัวอักษร");
      return;
    }
    if (decision === "approved" && (form.evidence.trim().length < 5 || !isSunday(form.effectiveWeek))) {
      setError("การรับรองต้องมีหลักฐานอ้างอิงอย่างน้อย 5 ตัวอักษร และวันที่เริ่มใช้ต้องเป็นวันอาทิตย์");
      return;
    }
    const confirmation = decision === "approved"
      ? "ยืนยันรับรอง Rule Profile นี้หรือไม่? การดำเนินการจะทำให้ Profile เป็น Approved และเปลี่ยนเป็นข้อมูลที่ระบบใช้ประเมิน Dry-run"
      : decision === "changes_requested"
        ? "ยืนยันส่งกลับให้ผู้ดูแลแก้ไขหรือไม่?"
        : "ยืนยันไม่รับรองคำขอนี้หรือไม่?";
    if (!window.confirm(confirmation)) return;

    setBusyId(item.id);
    try {
      const response = await fetch("/api/alerts/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: item.id,
          decision,
          reviewNote: form.note.trim(),
          evidenceReference: decision === "approved" ? form.evidence.trim() : null,
          effectiveFromWeek: decision === "approved" ? form.effectiveWeek : null,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; errors?: string[] } | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.errors?.join(" · ") || payload?.error || "บันทึกผลการทบทวนไม่สำเร็จ");
        return;
      }
      setMessage(`บันทึกผลการทบทวน: ${decisionLabels[decision]} แล้ว`);
      setForms((previous) => ({ ...previous, [item.id]: { note: "", evidence: "", effectiveWeek: "" } }));
      window.dispatchEvent(new Event("dy:alerts-updated"));
      await load();
    } catch {
      setError("ไม่สามารถเชื่อมต่อเพื่อบันทึกผลการทบทวนได้");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel alert-expert-review-panel" aria-live="polite">
      <div className="panel-heading">
        <div>
          <h2><ClipboardCheck size={19} aria-hidden="true" /> Expert Review · การทบทวนโดยผู้เชี่ยวชาญ</h2>
          <p>แยกบทบาทผู้จัดทำ Draft ออกจากผู้ทบทวนและผู้รับรอง พร้อมเหตุผลและหลักฐานอ้างอิง</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => void load()} disabled={state === "loading" || busyId !== null}>
          <RefreshCw size={15} /> โหลดคำขอ
        </button>
      </div>

      <div className="inline-callout warning">
        <ShieldAlert size={17} />
        <span><strong>การรับรองต้องใช้บัญชี Role reviewer ที่ไม่ใช่ผู้ส่งคำขอ</strong><br />Administrator จัดการ Draft ได้ แต่ไม่สามารถรับรองคำขอของตนเองหรือใช้สิทธิ์ Admin แทนผู้เชี่ยวชาญได้</span>
      </div>

      <div className="alert-expert-review-summary">
        <span>คำขอทั้งหมด <strong>{requests.length}</strong></span>
        <span>รอทบทวน <strong>{pendingCount}</strong></span>
        <span>มีผลตัดสินแล้ว <strong>{decidedCount}</strong></span>
        <span>Role <strong>{role ?? "—"}</strong></span>
      </div>

      {state === "loading" && <div className="loading-card"><div className="spinner" /><strong>กำลังโหลดคำขอทบทวน</strong></div>}
      {state !== "loading" && state !== "ready" && <p className="panel-note">{error}</p>}
      {state === "ready" && error && <div className="inline-callout warning"><XCircle size={16} /><span>{error}</span></div>}
      {message && <div className="historical-notice"><CheckCircle2 size={16} /><span>{message}</span></div>}

      {state === "ready" && requests.length === 0 && <p className="panel-note">ยังไม่มีคำขอทบทวนจากผู้ดูแลระบบ</p>}

      {state === "ready" && requests.map((item) => {
        const decision = item.decisionRecord;
        const form = forms[item.id] ?? { note: "", evidence: "", effectiveWeek: "" };
        const isSubmitter = currentUserId === item.requested_by;
        const canDecide = role === "reviewer" && !isSubmitter && !decision;
        const thresholds = Array.isArray(item.profile_snapshot?.thresholds) ? item.profile_snapshot.thresholds : [];
        return (
          <article className="alert-expert-review-card" key={item.id}>
            <div className="alert-expert-review-card-heading">
              <div>
                <strong>คำขอทบทวน · {item.profile_version}</strong>
                <span className={decision?.decision === "approved" ? "risk-pill risk-normal" : decision ? "risk-pill risk-high" : "risk-pill risk-watch"}>
                  {decision ? decisionLabels[decision.decision] : "รอทบทวน"}
                </span>
              </div>
              <time dateTime={item.submitted_at}>{formatTime(item.submitted_at)}</time>
            </div>
            <p>{item.submission_note}</p>
            <div className="performance-grid">
              <div><span>Threshold ในคำขอ</span><strong>{item.threshold_count}/77</strong></div>
              <div><span>ผู้ส่งคำขอ</span><strong>{item.requested_by.slice(0, 8)}…</strong></div>
              <div><span>Profile</span><strong>{item.profile_snapshot?.status ?? "ไม่ทราบ"}</strong></div>
            </div>
            {item.profile_snapshot?.methodology && <p className="alert-expert-review-methodology"><strong>ระเบียบวิธี:</strong> {item.profile_snapshot.methodology}</p>}
            <details className="rules-details">
              <summary><FileSearch size={15} /> ตรวจสอบ Threshold ที่ส่งมา ({thresholds.length}/77)</summary>
              {thresholds.length ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>จังหวัด</th><th>Watch</th><th>Alert</th></tr></thead>
                    <tbody>{thresholds.map((row) => (
                      <tr key={row.province_name}>
                        <td>{row.province_name}</td>
                        <td className="numeric-cell">{Number(row.watch_threshold).toLocaleString("th-TH", { maximumFractionDigits: 3 })}</td>
                        <td className="numeric-cell">{Number(row.alert_threshold).toLocaleString("th-TH", { maximumFractionDigits: 3 })}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="panel-note">ไม่มี Threshold ใน Snapshot นี้</p>}
            </details>

            {decision ? (
              <div className="alert-expert-review-decision">
                <strong>ผลการทบทวน: {decisionLabels[decision.decision]}</strong>
                <p>{decision.review_note}</p>
                {decision.evidence_reference && <small>หลักฐาน: {decision.evidence_reference}</small>}
                {decision.effective_from_week && <small>เริ่มใช้สัปดาห์: {decision.effective_from_week}</small>}
                <small>Reviewer {decision.reviewer_id.slice(0, 8)}… · {formatTime(decision.reviewed_at)}</small>
              </div>
            ) : canDecide ? (
              <div className="alert-expert-review-form">
                <label><strong>เหตุผลและข้อสังเกตการทบทวน</strong>
                  <textarea value={form.note} rows={3} maxLength={1000} onChange={(event) => updateForm(item.id, "note", event.target.value)} placeholder="ระบุผลการตรวจสอบ เหตุผล และข้อจำกัด อย่างน้อย 10 ตัวอักษร" />
                </label>
                <div className="alert-expert-review-approval-fields">
                  <label><strong>หลักฐาน/มติรับรอง (กรณีรับรอง)</strong>
                    <input value={form.evidence} maxLength={500} onChange={(event) => updateForm(item.id, "evidence", event.target.value)} placeholder="เช่น เลขที่มติ / เอกสารอ้างอิง" />
                  </label>
                  <label><strong>วันที่เริ่มใช้ (กรณีรับรอง)</strong>
                    <input type="date" value={form.effectiveWeek} onChange={(event) => updateForm(item.id, "effectiveWeek", event.target.value)} />
                  </label>
                </div>
                <div className="alert-expert-review-actions">
                  <button type="button" className="button button-secondary" disabled={busyId === item.id || form.note.trim().length < 10} onClick={() => void decide(item, "changes_requested")}>ขอให้แก้ไข</button>
                  <button type="button" className="button button-secondary" disabled={busyId === item.id || form.note.trim().length < 10} onClick={() => void decide(item, "rejected")}>ไม่รับรอง</button>
                  <button type="button" className="button button-primary" disabled={busyId === item.id || form.note.trim().length < 10 || form.evidence.trim().length < 5 || !isSunday(form.effectiveWeek)} onClick={() => void decide(item, "approved")}>{busyId === item.id ? "กำลังบันทึก" : "รับรอง Rule Profile"}</button>
                </div>
                <p className="panel-note">การรับรองจะเปลี่ยนสถานะ Profile เป็น Approved และใช้เกณฑ์ Snapshot นี้ในการประเมิน Dry-run ตั้งแต่สัปดาห์ที่ระบุ โดยยังไม่ส่งการแจ้งเตือนออกภายนอก</p>
              </div>
            ) : (
              <p className="panel-note">{isSubmitter ? "บัญชีที่ส่งคำขอนี้ไม่สามารถทบทวนคำขอของตนเองได้" : role !== "reviewer" ? "บัญชี Administrator อ่านคำขอได้ แต่ต้องใช้บัญชี Role reviewer แยกต่างหากเพื่อตัดสิน" : "คำขอนี้ได้รับผลการทบทวนแล้ว"}</p>
            )}
          </article>
        );
      })}

      <p className="alert-audit-footnote">ผลการทบทวนเป็นประวัติถาวรแบบเพิ่มรายการเท่านั้น การขอแก้ไขหรือไม่รับรองจะคง Profile เป็น Draft ส่วนการรับรองต้องมีผู้ทบทวนคนละบัญชีกับผู้ส่งคำขอ มีหลักฐานอ้างอิง และมีวันเริ่มใช้เป็นสัปดาห์ระบาดวิทยา External Notifications ถูกปิดไว้เสมอ</p>
    </section>
  );
}
