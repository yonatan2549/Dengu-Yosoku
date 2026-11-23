"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Fingerprint, RefreshCw, ShieldAlert } from "lucide-react";

type Artifact = {
  fileName: string;
  exists: boolean;
  bytes: number;
  sha256: string | null;
  modifiedAt: string | null;
};
type Check = { id: string; label: string; status: "pass" | "warning" | "blocked"; detail: string };
type Report = {
  status: "intact" | "warning" | "blocked";
  eligibleForCurrentEvaluation: boolean;
  forecastWeek: string | null;
  currentWeekStart: string;
  lagWeeks: number | null;
  modelRevision: string | null;
  repository: string | null;
  checks: Check[];
  summary: string;
  releaseFingerprint: string;
  observedAt: string;
  artifacts: Artifact[];
  note: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function shortHash(value: string | null): string {
  return value ? `${value.slice(0, 16)}…${value.slice(-8)}` : "ไม่พบ SHA-256";
}

export function ModelReleaseIntegrityPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/model/release-integrity", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "ตรวจ Release Integrity ไม่สำเร็จ");
      setReport(payload as Report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เกิดข้อผิดพลาดในการตรวจ Artifact");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const statusText = report?.status === "intact" ? "Fingerprint และ Provenance สอดคล้องกัน" : report?.status === "warning" ? "มีข้อมูลที่ต้องตรวจทาน" : "ไม่ผ่าน Release Integrity";
  const StatusIcon = report?.status === "intact" ? CheckCircle2 : report?.status === "warning" ? AlertTriangle : ShieldAlert;

  return (
    <section className="dg-card" style={{ marginTop: 18 }} aria-labelledby="model-release-integrity-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span className="dg-eyebrow"><Fingerprint size={14} /> MODEL RELEASE INTEGRITY</span>
          <h2 id="model-release-integrity-title" style={{ margin: "8px 0 4px" }}>ตรวจสอบตัวตนของ Model Artifacts</h2>
          <p style={{ margin: 0, color: "var(--muted, #64748b)" }}>อ่านไฟล์ใน Deployment ปัจจุบันและคำนวณ SHA-256 ใหม่ทุกครั้ง · Read-only</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #cbd5e1", borderRadius: 10, padding: "9px 13px", background: "#fff", color: "#164e48", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>
          <RefreshCw size={15} /> ตรวจสอบ Fingerprint
        </button>
      </div>
      {loading && <p role="status" style={{ marginTop: 16 }}>กำลังอ่าน Artifact และคำนวณ SHA-256…</p>}
      {error && <div role="alert" className="dg-note" style={{ marginTop: 16 }}><AlertTriangle size={18} /><span>{error}</span></div>}
      {report && !loading && (
        <>
          <div className="dg-note" style={{ marginTop: 16 }}>
            <StatusIcon size={20} />
            <div><strong>{statusText}</strong><div>{report.summary}</div></div>
          </div>
          <div className="dg-grid-2" style={{ marginTop: 14 }}>
            {report.artifacts.map((artifact) => (
              <article className="dg-card" key={artifact.fileName}>
                <strong>{artifact.fileName}</strong>
                <div style={{ marginTop: 7, fontSize: 13, color: "var(--muted, #64748b)" }}>{formatBytes(artifact.bytes)} · {artifact.modifiedAt ? new Date(artifact.modifiedAt).toLocaleString("th-TH") : "ไม่มีเวลาไฟล์"}</div>
                <code style={{ display: "block", marginTop: 9, fontSize: 11, overflowWrap: "anywhere" }}>SHA-256: {shortHash(artifact.sha256)}</code>
              </article>
            ))}
          </div>
          <div className="dg-card" style={{ marginTop: 12 }}>
            <div className="dg-source-meta">Deployment release fingerprint</div>
            <code style={{ display: "block", marginTop: 6, fontSize: 12, overflowWrap: "anywhere" }}>{report.releaseFingerprint}</code>
            <div style={{ color: "var(--muted, #64748b)", fontSize: 12, marginTop: 7 }}>ตรวจเมื่อ {new Date(report.observedAt).toLocaleString("th-TH")} · Revision {report.modelRevision ?? "ไม่มีข้อมูล"}</div>
          </div>
          <div style={{ marginTop: 17 }}>
            <h3>Release Integrity Checks</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {report.checks.map((check) => (
                <div key={check.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", borderBottom: "1px solid var(--border, #e2e8f0)", padding: "9px 0" }}>
                  {check.status === "pass" ? <CheckCircle2 size={17} color="#16845b" /> : check.status === "warning" ? <AlertTriangle size={17} color="#b7791f" /> : <ShieldAlert size={17} color="#c2413b" />}
                  <div><strong>{check.label}</strong><div style={{ color: "var(--muted, #64748b)", fontSize: 13 }}>{check.detail}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="dg-source-meta" style={{ marginTop: 12 }}>{report.note}</div>
        </>
      )}
    </section>
  );
}
