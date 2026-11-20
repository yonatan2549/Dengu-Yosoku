"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from "lucide-react";

type Check = { id: string; label: string; status: "pass" | "warning" | "blocked"; detail: string };
type Report = {
  status: "ready" | "stale" | "blocked";
  eligibleForCurrentEvaluation: boolean;
  forecastWeek: string | null;
  currentWeekStart: string;
  lagWeeks: number | null;
  modelRevision: string | null;
  repository: string | null;
  checks: Check[];
  summary: string;
};

function thDate(value: string | null) {
  if (!value) return "ไม่มีข้อมูล";
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("th-TH", { dateStyle: "long" });
}

export function ModelOperationsPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/model/operations", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "ตรวจสอบ Model Operations ไม่สำเร็จ");
      setReport(payload as Report);
      setUpdatedAt(new Date().toISOString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const statusLabel = report?.status === "ready" ? "พร้อมสำหรับการประเมิน" : report?.status === "stale" ? "มีข้อมูลที่ควรตรวจสอบ" : "บล็อกการประเมินปัจจุบัน";
  const StatusIcon = report?.status === "ready" ? CheckCircle2 : report?.status === "stale" ? AlertTriangle : ShieldAlert;

  return (
    <div className="dg-page">
      <section className="dg-hero">
        <div className="dg-hero-grid">
          <div>
            <span className="dg-eyebrow"><Activity size={14} /> MODEL OPERATIONS</span>
            <h1>ความพร้อมของระบบพยากรณ์</h1>
            <p className="dg-lede">ตรวจสอบ Forecast freshness, Model revision และความครอบคลุมของข้อมูลก่อนนำไปใช้ประเมินสถานการณ์ปัจจุบัน</p>
          </div>
          <div className="dg-hero-art"><Activity size={76} strokeWidth={1.2} /></div>
        </div>
      </section>

      <section className="dg-card" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="dg-eyebrow">OPERATIONAL GATE</div>
            <h2 style={{ margin: "8px 0 4px" }}>สถานะ Model Snapshot</h2>
            <p style={{ margin: 0, color: "var(--muted, #64748b)" }}>อ่านไฟล์ Predictions และ Metrics จาก Server โดยตรง · ไม่แก้ไขข้อมูลต้นทาง</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #cbd5e1", borderRadius: 10, padding: "9px 13px", background: "#fff", color: "#164e48", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>
            <RefreshCw size={15} /> ตรวจสอบอีกครั้ง
          </button>
        </div>
        {loading && <p role="status" style={{ marginTop: 18 }}>กำลังตรวจสอบ Model Snapshot…</p>}
        {error && <div role="alert" className="dg-note" style={{ marginTop: 16 }}><AlertTriangle size={18} /><span>{error}</span></div>}
        {report && !loading && (
          <>
            <div className="dg-note" style={{ marginTop: 18 }}>
              <StatusIcon size={20} />
              <div><strong>{statusLabel}</strong><div>{report.summary}</div></div>
            </div>
            <div className="dg-grid" style={{ marginTop: 16 }}>
              <article className="dg-card"><span className="dg-source-meta">Forecast week</span><h3>{thDate(report.forecastWeek)}</h3><p>สัปดาห์ปัจจุบัน: {thDate(report.currentWeekStart)}</p></article>
              <article className="dg-card"><span className="dg-source-meta">Freshness lag</span><h3>{report.lagWeeks === null ? "ไม่ทราบ" : report.lagWeeks > 0 ? `${report.lagWeeks} สัปดาห์` : "ไม่ล่าช้า"}</h3><p>{report.eligibleForCurrentEvaluation ? "ผ่านเงื่อนไขความใหม่" : "ไม่ผ่านเงื่อนไขความใหม่หรือ Gate อื่น"}</p></article>
              <article className="dg-card"><span className="dg-source-meta">Model revision</span><h3 style={{ overflowWrap: "anywhere" }}>{report.modelRevision ?? "ไม่มีข้อมูล"}</h3><p>{report.repository ?? "ไม่พบ Repository"}</p></article>
            </div>
            <div style={{ marginTop: 22 }}>
              <h3>รายการตรวจสอบ</h3>
              <div style={{ display: "grid", gap: 9 }}>
                {report.checks.map((check) => (
                  <div key={check.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", borderBottom: "1px solid var(--border, #e2e8f0)", padding: "10px 0" }}>
                    {check.status === "pass" ? <CheckCircle2 size={17} color="#16845b" /> : check.status === "warning" ? <AlertTriangle size={17} color="#b7791f" /> : <ShieldAlert size={17} color="#c2413b" />}
                    <div><strong>{check.label}</strong><div style={{ color: "var(--muted, #64748b)", fontSize: 13 }}>{check.detail}</div></div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 14, color: "var(--muted, #64748b)", fontSize: 12 }}><Clock3 size={13} /> ตรวจล่าสุด: {updatedAt ? new Date(updatedAt).toLocaleString("th-TH") : "—"}</div>
          </>
        )}
      </section>
      <section className="dg-note" style={{ marginTop: 16 }}>
        <ShieldAlert size={18} />
        <div><strong>ข้อจำกัดการใช้งาน</strong><div>หน้านี้เป็นเครื่องมือตรวจสอบความพร้อม ไม่ได้ปรับแต่งหรือสร้างผลพยากรณ์ใหม่ และไม่อนุมัติ Threshold หรือเปิดการแจ้งเตือนเอง หาก Forecast ล่าช้า ระบบต้องถือว่าไม่พร้อมสำหรับการประเมินเหตุการณ์ปัจจุบัน</div></div>
      </section>
    </div>
  );
}
