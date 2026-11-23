"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from "lucide-react";

type Check = { id: string; label: string; status: "pass" | "warning" | "blocked"; detail: string };
type Report = {
  status: "ready" | "warning" | "blocked";
  forecastWeek: string | null;
  currentWeekStart: string;
  forecastLagWeeks: number | null;
  modelRevision: string | null;
  repository: string | null;
  generatedAtUtc: string | null;
  sourceRetrievedAtUtc: string | null;
  convertedAtUtc: string | null;
  currentWeekAtConversion: string | null;
  snapshotAgeHours: number | null;
  sourceAgeHours: number | null;
  sourceToConversionMinutes: number | null;
  storedForecastLagWeeks: number | null;
  generationCurrentButForecastStale: boolean;
  diagnosis: string[];
  checks: Check[];
  observedAt: string;
  note: string;
};

function dateTime(value: string | null) {
  if (!value) return "ไม่มีข้อมูล";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

function statusText(status: Report["status"]) {
  return status === "ready" ? "ลำดับเวลาและ Metadata ผ่านการตรวจ" : status === "warning" ? "Metadata บางส่วนไม่ครบ" : "พบเงื่อนไขบล็อกการประเมิน";
}

export function ModelRefreshObservabilityPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/model/refresh-observability", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "โหลด Model Refresh Observability ไม่สำเร็จ");
      setReport(payload as Report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const StatusIcon = report?.status === "ready" ? CheckCircle2 : report?.status === "warning" ? AlertTriangle : ShieldAlert;
  const statusColor = report?.status === "ready" ? "#16794b" : report?.status === "warning" ? "#9a6700" : "#b42318";

  return (
    <section className="dg-card" style={{ marginTop: 20 }} aria-labelledby="model-refresh-observability-title">
      <div className="dg-section-head">
        <div>
          <span className="dg-eyebrow"><Clock3 size={14} /> MODEL REFRESH OBSERVABILITY</span>
          <h2 id="model-refresh-observability-title">ลำดับเวลาและการส่งต่อ Model Snapshot</h2>
          <p>แยกเวลา Model Artifact, Source Retrieval, Conversion และ Forecast week เพื่อหาสาเหตุของ Forecast ที่ล่าช้า</p>
        </div>
        <button type="button" className="dg-chip" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "กำลังตรวจสอบ" : "ตรวจสอบอีกครั้ง"}
        </button>
      </div>
      {loading && <p role="status">กำลังอ่าน Metadata จาก Server…</p>}
      {error && <div role="alert" className="dg-note"><AlertTriangle size={17} /> {error}</div>}
      {report && !loading && (
        <>
          <div className="dg-note" style={{ marginTop: 14, color: statusColor }}>
            <StatusIcon size={19} />
            <div><strong>{statusText(report.status)}</strong><div>{report.forecastLagWeeks === null ? "คำนวณ Forecast lag ไม่ได้" : report.forecastLagWeeks > 0 ? `Forecast ล่าช้า ${report.forecastLagWeeks} สัปดาห์` : report.forecastLagWeeks < 0 ? `Forecast ล่วงหน้า ${Math.abs(report.forecastLagWeeks)} สัปดาห์` : "Forecast ตรงกับสัปดาห์ปัจจุบัน"}</div></div>
          </div>
          {report.generationCurrentButForecastStale && (
            <div className="dg-note" style={{ marginTop: 12 }} role="status">
              <AlertTriangle size={18} />
              <div><strong>Snapshot ใหม่กว่า Forecast target</strong><div>เวลา Artifact อยู่ในหรือหลังสัปดาห์ปัจจุบัน แต่ target week ย้อนหลัง ควรตรวจ upstream model refresh และขั้นตอนเลือก target week</div></div>
            </div>
          )}
          <div className="dg-grid-2" style={{ marginTop: 14 }}>
            <article className="dg-card"><span className="dg-source-meta">Forecast week / Current week</span><h3>{report.forecastWeek ?? "ไม่มีข้อมูล"}</h3><p>สัปดาห์ปัจจุบัน: {report.currentWeekStart}</p></article>
            <article className="dg-card"><span className="dg-source-meta">Revision</span><h3 style={{ overflowWrap: "anywhere", fontSize: 15 }}>{report.modelRevision ?? "ไม่มีข้อมูล"}</h3><p>{report.repository ?? "ไม่มี Repository"}</p></article>
          </div>
          <div style={{ marginTop: 16, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
              <thead><tr>{["จุดเวลา", "Timestamp (Asia/Bangkok)", "อายุ/ช่วงเวลา"].map((item) => <th key={item} style={{ textAlign: "left", padding: 9, borderBottom: "1px solid var(--border, #dce7e4)" }}>{item}</th>)}</tr></thead>
              <tbody>
                <tr><td style={{ padding: 9 }}>Source retrieved</td><td style={{ padding: 9 }}>{dateTime(report.sourceRetrievedAtUtc)}</td><td style={{ padding: 9 }}>{report.sourceAgeHours === null ? "—" : `${report.sourceAgeHours} ชั่วโมง`}</td></tr>
                <tr><td style={{ padding: 9 }}>Artifact generated</td><td style={{ padding: 9 }}>{dateTime(report.generatedAtUtc)}</td><td style={{ padding: 9 }}>—</td></tr>
                <tr><td style={{ padding: 9 }}>Snapshot converted</td><td style={{ padding: 9 }}>{dateTime(report.convertedAtUtc)}</td><td style={{ padding: 9 }}>{report.snapshotAgeHours === null ? "—" : `${report.snapshotAgeHours} ชั่วโมง`}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="dg-note" style={{ marginTop: 12 }}>
            <Clock3 size={17} />
            <div><strong>Source → Conversion</strong><div>{report.sourceToConversionMinutes === null ? "ยังคำนวณช่วงเวลาไม่ได้" : `${report.sourceToConversionMinutes} นาที`} · Metadata lag ณ เวลา Conversion: {report.storedForecastLagWeeks === null ? "ไม่มีข้อมูล" : `${report.storedForecastLagWeeks} สัปดาห์`}</div></div>
          </div>
          <div style={{ marginTop: 16 }}>
            <h3>รายการตรวจสอบ</h3>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {report.checks.map((check) => <div key={check.id} style={{ display: "grid", gridTemplateColumns: "minmax(130px, 0.8fr) minmax(0, 2fr)", gap: 12, padding: 10, borderBottom: "1px solid var(--border, #edf2f0)" }}>
                <strong style={{ fontSize: 13 }}>{check.label}</strong>
                <span style={{ fontSize: 13 }}>{check.detail}</span>
              </div>)}
            </div>
          </div>
          {report.diagnosis.map((item) => <div className="dg-note" key={item} style={{ marginTop: 12 }}><AlertTriangle size={17} /> {item}</div>)}
          <p className="dg-source-meta" style={{ marginTop: 12 }}>{report.note} · ตรวจเมื่อ {dateTime(report.observedAt)}</p>
        </>
      )}
    </section>
  );
}
