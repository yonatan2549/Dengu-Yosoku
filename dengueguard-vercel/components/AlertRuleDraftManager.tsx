"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, FileCheck2, History, LockKeyhole, RefreshCw, Save, Send, ShieldCheck } from "lucide-react";
import { validateProfileDraftPayload } from "@/lib/alerting/profile-draft-contract";
import { ALERT_RULE_PROFILE } from "@/lib/alerting/profile";

interface StoredProfile {
  id: string;
  profile_id: string;
  version: string;
  status: "draft" | "approved";
  methodology: string;
  created_at?: string;
}

interface StoredThreshold {
  province_name: string;
  watch_threshold: string | number;
  alert_threshold: string | number;
}

interface ChangeRecord {
  id: string;
  actor_id: string;
  action: "draft_saved" | "submitted_for_review";
  note: string;
  created_at: string;
}

type ReviewDecision = "approved" | "changes_requested" | "rejected";

interface ReviewRequest {
  id: string;
  requested_by: string;
  status: "pending";
  submission_note: string;
  submitted_at: string;
  profile_version: string;
  threshold_count: number;
  decisionRecord?: {
    decision: ReviewDecision;
    reviewer_id: string;
    review_note: string;
    evidence_reference: string | null;
    effective_from_week: string | null;
    reviewed_at: string;
  } | null;
}

interface ProfileResponse {
  ok?: boolean;
  role?: string;
  profile?: StoredProfile | null;
  thresholds?: StoredThreshold[];
  changes?: ChangeRecord[];
  reviewRequests?: ReviewRequest[];
  error?: string;
  migrationRequired?: boolean;
}

type LoadState = "loading" | "ready" | "signed_out" | "forbidden" | "unavailable";
type ThresholdInput = { watch: string; alert: string };

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function actionLabel(action: ChangeRecord["action"]): string {
  return action === "submitted_for_review" ? "ส่งผู้เชี่ยวชาญทบทวน" : "บันทึกฉบับร่าง";
}

function reviewDecisionLabel(decision: ReviewDecision): string {
  if (decision === "approved") return "รับรองแล้ว";
  if (decision === "changes_requested") return "ขอให้แก้ไข";
  return "ไม่รับรอง";
}

export function AlertRuleDraftManager({ provinces }: { provinces: string[] }) {
  const [state, setState] = useState<LoadState>("loading");
  const [role, setRole] = useState<string | null>(null);
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [thresholdInputs, setThresholdInputs] = useState<Record<string, ThresholdInput>>({});
  const [methodology, setMethodology] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [reviewRequests, setReviewRequests] = useState<ReviewRequest[]>([]);
  const [unexpectedStoredProvinces, setUnexpectedStoredProvinces] = useState<string[]>([]);
  const [savedThresholdCount, setSavedThresholdCount] = useState(0);
  const [usingApplicationCandidate, setUsingApplicationCandidate] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    setMessage("");
    try {
      // This endpoint refreshes an expired access token using the HttpOnly refresh cookie.
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json().catch(() => null) as { authenticated?: boolean; role?: string } | null;
      if (!sessionResponse.ok || !session?.authenticated) {
        setProfile(null);
        setState("signed_out");
        setMessage("กรุณาเข้าสู่ระบบก่อนจัดการ Rule Profile");
        return;
      }
      setRole(session.role ?? null);
      if (session.role !== "administrator" && session.role !== "reviewer") {
        setProfile(null);
        setState("forbidden");
        setMessage("บัญชีนี้ไม่มีสิทธิ์ดูแล Rule Profile");
        return;
      }

      const response = await fetch("/api/alerts/admin/profile", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as ProfileResponse | null;
      if (!response.ok || !payload?.ok) {
        setState(response.status === 401 ? "signed_out" : response.status === 403 ? "forbidden" : "unavailable");
        setMessage(payload?.error ?? "โหลด Rule Profile จากฐานข้อมูลไม่สำเร็จ");
        return;
      }

      const databaseThresholds = payload.thresholds ?? [];
      const useCandidate = databaseThresholds.length === 0 &&
        payload.profile?.status === "draft" &&
        payload.profile.version === ALERT_RULE_PROFILE.version &&
        Object.keys(ALERT_RULE_PROFILE.thresholdsByProvince).length === 77;
      const stored = new Map<string, ThresholdInput>();
      const unexpected = databaseThresholds
        .filter((item) => !provinces.includes(item.province_name))
        .map((item) => item.province_name);
      for (const item of databaseThresholds) {
        if (provinces.includes(item.province_name)) {
          stored.set(item.province_name, {
            watch: String(item.watch_threshold),
            alert: String(item.alert_threshold),
          });
        }
      }
      setUnexpectedStoredProvinces(unexpected);
      setSavedThresholdCount(databaseThresholds.length);
      setUsingApplicationCandidate(useCandidate);
      const nextInputs: Record<string, ThresholdInput> = {};
      for (const province of provinces) {
        const candidate = useCandidate ? ALERT_RULE_PROFILE.thresholdsByProvince[province] : undefined;
        nextInputs[province] = stored.get(province) ?? (candidate
          ? { watch: String(candidate.watch), alert: String(candidate.alert) }
          : { watch: "", alert: "" });
      }
      setThresholdInputs(nextInputs);
      setProfile(payload.profile ?? null);
      setMethodology(useCandidate ? ALERT_RULE_PROFILE.methodology : payload.profile?.methodology ?? "");
      setChanges(payload.changes ?? []);
      setReviewRequests(payload.reviewRequests ?? []);
      setState("ready");
    } catch {
      setState("unavailable");
      setMessage("ไม่สามารถติดต่อ Draft Profile API ได้");
    }
  }, [provinces]);

  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("dy:alerts-updated", refresh);
    return () => window.removeEventListener("dy:alerts-updated", refresh);
  }, [load]);

  const parsedThresholds = useMemo(() => {
    const rows: Array<{ provinceName: string; watch: number; alert: number }> = [];
    let incompleteCount = 0;
    let invalidCount = 0;
    for (const provinceName of provinces) {
      const item = thresholdInputs[provinceName] ?? { watch: "", alert: "" };
      const watchEmpty = item.watch.trim() === "";
      const alertEmpty = item.alert.trim() === "";
      if (watchEmpty && alertEmpty) continue;
      if (watchEmpty !== alertEmpty) {
        incompleteCount += 1;
        continue;
      }
      const watch = Number(item.watch);
      const alert = Number(item.alert);
      const precisionValid = (value: number) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7;
      if (Number.isFinite(watch) && Number.isFinite(alert) && watch >= 0 && alert > watch &&
          watch <= 99_999_999_999.999 && alert <= 99_999_999_999.999 &&
          precisionValid(watch) && precisionValid(alert)) {
        rows.push({ provinceName, watch, alert });
      } else {
        invalidCount += 1;
      }
    }
    return { rows, incompleteCount, invalidCount };
  }, [provinces, thresholdInputs]);

  const isAdmin = role === "administrator";
  const canEdit = isAdmin && profile?.status === "draft";
  const filteredProvinces = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("th");
    return provinces.filter((province) => !normalized || province.toLocaleLowerCase("th").includes(normalized));
  }, [provinces, query]);
  const allComplete = provinces.length === 77 && parsedThresholds.rows.length === 77 && parsedThresholds.incompleteCount === 0;

  function updateThreshold(province: string, field: keyof ThresholdInput, value: string) {
    setThresholdInputs((previous) => ({
      ...previous,
      [province]: { ...(previous[province] ?? { watch: "", alert: "" }), [field]: value },
    }));
  }

  async function saveDraft(submitForReview: boolean) {
    setErrors([]);
    setMessage("");
    if (!profile) {
      setErrors(["ไม่พบ Rule Profile ฉบับร่างในฐานข้อมูล"]);
      return;
    }
    if (!canEdit) {
      setErrors(["ต้องใช้บัญชี Administrator และ Profile ต้องอยู่ในสถานะ Draft"]);
      return;
    }
    if (unexpectedStoredProvinces.length > 0) {
      setErrors([`พบ Threshold ในฐานข้อมูลที่ไม่อยู่ใน Model Snapshot: ${unexpectedStoredProvinces.join(", ")} กรุณาตรวจสอบข้อมูลก่อนแก้ไข`]);
      return;
    }
    if (parsedThresholds.incompleteCount > 0) {
      setErrors(["มีจังหวัดที่กรอก Threshold เพียงค่าเดียว กรุณากรอก Watch และ Alert ให้ครบคู่ หรือเว้นว่างทั้งคู่"]);
      return;
    }
    if (parsedThresholds.invalidCount > 0) {
      setErrors(["มีจังหวัดที่ค่า Threshold ไม่ถูกต้อง: ต้องเป็น 0 ≤ Watch < Alert และมีทศนิยมไม่เกิน 3 ตำแหน่ง"]);
      return;
    }
    const validation = validateProfileDraftPayload({
      methodology,
      changeNote,
      submitForReview,
      thresholds: parsedThresholds.rows,
    }, provinces);
    if (!validation.ok || !validation.value) {
      setErrors(validation.errors);
      return;
    }
    if (submitForReview && !allComplete) {
      setErrors(["ก่อนส่งทบทวนต้องมี Threshold ที่ถูกต้องครบ 77 จังหวัด"]);
      return;
    }
    if (parsedThresholds.rows.length < savedThresholdCount) {
      const confirmed = window.confirm(
        `การบันทึกครั้งนี้จะแทนที่ Threshold ใน Draft จาก ${savedThresholdCount} เหลือ ${parsedThresholds.rows.length} รายการ ต้องการดำเนินการต่อหรือไม่?`,
      );
      if (!confirmed) return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/alerts/admin/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          methodology: validation.value.methodology,
          changeNote: validation.value.changeNote,
          submitForReview,
          thresholds: validation.value.thresholds,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        result?: { threshold_count?: number; review_status?: string };
        error?: string;
        errors?: string[];
      } | null;
      if (!response.ok || !payload?.ok) {
        setErrors(payload?.errors?.length ? payload.errors : [payload?.error ?? "บันทึก Rule Profile ไม่สำเร็จ"]);
        return;
      }
      setChangeNote("");
      const successMessage = submitForReview
        ? "บันทึก Draft และส่งคำขอทบทวนแล้ว สถานะ Profile ยังคงเป็น Draft และยังไม่มีการอนุมัติ"
        : `บันทึก Draft แล้ว (${payload.result?.threshold_count ?? 0}/77 จังหวัด)`;
      window.dispatchEvent(new Event("dy:alerts-updated"));
      await load();
      setMessage(successMessage);
    } catch {
      setErrors(["ไม่สามารถเชื่อมต่อ API เพื่อบันทึก Draft ได้"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel alert-rule-draft-panel" aria-live="polite">
      <div className="panel-heading">
        <div>
          <h2><ClipboardList size={19} aria-hidden="true" /> Rule Profile · Draft Management</h2>
          <p>จัดการฉบับร่างและ Threshold รายจังหวัด พร้อมประวัติผู้แก้ไขและคำขอทบทวน</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => void load()} disabled={state === "loading" || busy}>
          <RefreshCw size={15} /> โหลดข้อมูล
        </button>
      </div>

      <div className="inline-callout warning">
        <LockKeyhole size={17} />
        <span><strong>Draft workflow เท่านั้น</strong><br />หน้านี้ไม่มีคำสั่งอนุมัติ Profile ไม่เปลี่ยนสถานะเป็น Approved และไม่เปิดการส่งแจ้งเตือนภายนอก</span>
      </div>

      {state === "loading" ? <div className="loading-card"><div className="spinner" /><strong>กำลังโหลด Rule Profile</strong></div> : null}
      {state !== "loading" && state !== "ready" ? <p className="panel-note">{message}</p> : null}

      {state === "ready" && (
        <>
          {!profile ? (
            <div className="inline-callout warning"><AlertTriangle size={17} /><span>ยังไม่พบ Profile {"dengueyosoku-national-alerts / 0.1.0-draft"} ในฐานข้อมูล ให้บันทึก Evaluation จาก Alert Dry-run ก่อน</span></div>
          ) : (
            <>
              <div className="performance-grid">
                <div><span>Profile</span><strong>{profile.version}</strong></div>
                <div><span>สถานะ</span><strong>{profile.status === "draft" ? "Draft · ยังไม่อนุมัติ" : "Approved · แก้ไขไม่ได้"}</strong></div>
                <div><span>Threshold ใน Supabase</span><strong>{savedThresholdCount}/77</strong></div>
                <div><span>ค่าที่กรอก/แนะนำในหน้าจอ</span><strong>{parsedThresholds.rows.length}/77</strong></div>
              </div>

              {usingApplicationCandidate && (
                <div className="inline-callout warning" role="status">
                  <AlertTriangle size={17} />
                  <span>
                    <strong>เติมค่า Candidate จากไฟล์คำนวณใน repository แล้ว แต่ยังไม่ได้บันทึกลง Supabase</strong>
                    <br />
                    ค่าทั้ง 77 จังหวัดเป็น Draft เชิงสถิติจาก Holdout 26 สัปดาห์เท่านั้น ต้องตรวจสอบรายละเอียดก่อนบันทึก และไม่มีผลอนุมัติ/เปิดใช้ Alert
                  </span>
                </div>
              )}

              <div className="alert-rule-draft-meta">
                <label htmlFor="alert-rule-methodology"><strong>ระเบียบวิธีและที่มาของเกณฑ์</strong>
                  <textarea
                    id="alert-rule-methodology"
                    className="alert-rule-draft-textarea"
                    value={methodology}
                    onChange={(event) => setMethodology(event.target.value)}
                    maxLength={4000}
                    disabled={!canEdit || busy}
                    placeholder="ระบุวิธีคำนวณ/หลักฐาน/เอกสารที่ใช้กำหนด Threshold และข้อจำกัดของเกณฑ์ (20–4,000 ตัวอักษร)"
                    rows={4}
                  />
                </label>
                <label htmlFor="alert-rule-change-note"><strong>บันทึกการเปลี่ยนแปลง</strong>
                  <textarea
                    id="alert-rule-change-note"
                    className="alert-rule-draft-textarea"
                    value={changeNote}
                    onChange={(event) => setChangeNote(event.target.value)}
                    maxLength={500}
                    disabled={!canEdit || busy}
                    placeholder="อธิบายว่าแก้ไขอะไร และอ้างอิงการประชุม/เอกสารใด (อย่างน้อย 3 ตัวอักษร)"
                    rows={2}
                  />
                </label>
              </div>

              <div className="alert-rule-draft-toolbar">
                <div><strong>Threshold รายจังหวัด</strong><p>กรอกเฉพาะค่าที่ได้รับจากผู้เชี่ยวชาญ ไม่ควรเดาหรือคัดลอกค่าจากโมเดลมาใช้เป็นเกณฑ์</p></div>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาจังหวัด" aria-label="ค้นหาจังหวัด" />
              </div>

              {provinces.length !== 77 && (
                <div className="inline-callout warning"><AlertTriangle size={16} /><span>Model Snapshot ปัจจุบันมีรายชื่อจังหวัด {provinces.length}/77 รายการ จึงปิดการบันทึกและส่งทบทวนจนกว่าข้อมูลอ้างอิงจะครบ</span></div>
              )}

              {unexpectedStoredProvinces.length > 0 && (
                <div className="inline-callout warning"><AlertTriangle size={16} /><span>พบ Threshold ในฐานข้อมูลที่ไม่อยู่ในโมเดลปัจจุบัน: {unexpectedStoredProvinces.join(", ")} การบันทึกถูกระงับเพื่อไม่ลบ/เปลี่ยนข้อมูลเหล่านี้โดยไม่ตั้งใจ</span></div>
              )}

              <div className="alert-rule-draft-progress">
                <span>ค่าที่กรอกครบและถูกต้อง <strong>{parsedThresholds.rows.length}/77</strong></span>
                <span>พร้อมส่งทบทวน: <strong>{allComplete && parsedThresholds.incompleteCount === 0 ? "ครบ" : "ยังไม่ครบ"}</strong></span>
              </div>

              <div className="table-scroll alert-rule-draft-table-wrap">
                <table className="data-table alert-rule-draft-table">
                  <thead><tr><th>จังหวัด</th><th>Watch Threshold</th><th>Alert Threshold</th><th>สถานะ</th></tr></thead>
                  <tbody>
                    {filteredProvinces.map((province) => {
                      const item = thresholdInputs[province] ?? { watch: "", alert: "" };
                      const complete = item.watch.trim() !== "" && item.alert.trim() !== "";
                      const watchValue = Number(item.watch);
                      const alertValue = Number(item.alert);
                      const valid = complete && Number.isFinite(watchValue) && Number.isFinite(alertValue) && watchValue >= 0 && alertValue > watchValue && Math.abs(watchValue * 1000 - Math.round(watchValue * 1000)) < 1e-7 && Math.abs(alertValue * 1000 - Math.round(alertValue * 1000)) < 1e-7;
                      return (
                        <tr key={province}>
                          <td>{province}</td>
                          <td><input className="alert-rule-draft-number" type="number" min="0" step="0.001" value={item.watch} disabled={!canEdit || busy} onChange={(event) => updateThreshold(province, "watch", event.target.value)} aria-label={`Watch Threshold ${province}`} /></td>
                          <td><input className="alert-rule-draft-number" type="number" min="0" step="0.001" value={item.alert} disabled={!canEdit || busy} onChange={(event) => updateThreshold(province, "alert", event.target.value)} aria-label={`Alert Threshold ${province}`} /></td>
                          <td>{!complete ? <span className="risk-pill risk-watch">ยังไม่ระบุ</span> : valid ? <span className="risk-pill risk-normal">คู่ค่าถูกต้อง</span> : <span className="risk-pill risk-high">ตรวจค่า</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {errors.length > 0 && <div className="inline-callout warning"><AlertTriangle size={17} /><div><strong>ไม่สามารถบันทึกได้</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
              {message && <div className="historical-notice"><ShieldCheck size={17} /><span>{message}</span></div>}

              <div className="alert-rule-draft-actions">
                <button type="button" className="button button-secondary" onClick={() => void saveDraft(false)} disabled={!canEdit || busy || provinces.length !== 77 || unexpectedStoredProvinces.length > 0 || parsedThresholds.incompleteCount > 0 || parsedThresholds.invalidCount > 0}>
                  <Save size={15} /> {busy ? "กำลังบันทึก" : "บันทึกฉบับร่าง"}
                </button>
                <button type="button" className="button button-primary" onClick={() => void saveDraft(true)} disabled={!canEdit || busy || !allComplete || unexpectedStoredProvinces.length > 0 || parsedThresholds.invalidCount > 0 || parsedThresholds.incompleteCount > 0 || changeNote.trim().length < 10}>
                  <Send size={15} /> ส่งให้ผู้เชี่ยวชาญทบทวน
                </button>
              </div>
              {!canEdit && <p className="panel-note">บัญชีนี้ดูข้อมูลได้ แต่การแก้ไข Draft จำกัดเฉพาะ Administrator และเฉพาะ Profile ที่ยังไม่อนุมัติ</p>}
            </>
          )}

          <section className="alert-rule-draft-history">
            <h3><History size={16} /> ประวัติการแก้ไข Draft</h3>
            {changes.length ? <ol>{changes.slice(0, 8).map((item) => <li key={item.id}><strong>{actionLabel(item.action)}</strong><time dateTime={item.created_at}>{formatTime(item.created_at)}</time><span>{item.note}</span></li>)}</ol> : <p className="panel-note">ยังไม่มีประวัติการแก้ไข Draft</p>}
          </section>

          <section className="alert-rule-draft-history">
            <h3><FileCheck2 size={16} /> คำขอทบทวนจากผู้เชี่ยวชาญ</h3>
            {reviewRequests.length ? reviewRequests.map((item) => (
              <article className="alert-rule-review-request" key={item.id}>
                <div><strong>{item.decisionRecord ? `${reviewDecisionLabel(item.decisionRecord.decision)} · ${item.profile_version}` : `รอการทบทวน · ${item.profile_version}`}</strong><time dateTime={item.submitted_at}>{formatTime(item.submitted_at)}</time></div>
                <p>{item.submission_note}</p>
                <small>Threshold {item.threshold_count}/77 · Request ID: {item.id}</small>
                {item.decisionRecord && <p><strong>ผลทบทวน:</strong> {item.decisionRecord.review_note}<br /><small>Reviewer {item.decisionRecord.reviewer_id.slice(0, 8)}… · {formatTime(item.decisionRecord.reviewed_at)}</small></p>}
              </article>
            )) : <p className="panel-note">ยังไม่มีคำขอทบทวน</p>}
          </section>
        </>
      )}

      <p className="alert-audit-footnote">การบันทึกและส่งทบทวนไม่ถือเป็นการอนุมัติ เกณฑ์จะยังเป็น Draft และไม่สร้าง Candidate จนกว่าจะมีขั้นตอนรับรองแยกต่างหากโดยผู้มีอำนาจและผู้เชี่ยวชาญ</p>
    </section>
  );
}
