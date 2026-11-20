"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";

type Check = { id: string; label: string; status: "pass" | "warning" | "blocked"; detail: string };
type DocumentRow = { id: string; title: string; publisher: string; publishedAt: string; sourceUrl: string; reviewStatus: string; reviewMetadataComplete: boolean };
type Report = {
  status: "ready-for-review" | "blocked"; productionAnswersAllowed: false;
  totalDocuments: number; awaitingClinicalReview: number; clinicallyReviewed: number;
  metadataIssues: number; duplicateIds: number; documents: DocumentRow[]; checks: Check[];
  summary: string; note: string; observedAt?: string;
};

export function HealthAssistantGovernancePanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/health-assistant/governance", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "ตรวจสอบ Knowledge Governance ไม่สำเร็จ");
      setReport(payload as Report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เกิดข้อผิดพลาดในการตรวจสอบคลังความรู้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="dg-card" aria-labelledby="health-governance-title">
      <div className="dg-section-head">
        <div>
          <span className="dg-eyebrow"><BookOpen size={14} /> KNOWLEDGE GOVERNANCE</span>
          <h2 id="health-governance-title">สถานะคลังความรู้และการทบทวน</h2>
          <p>ตรวจสอบที่มา Metadata และสถานะการทบทวนก่อนเปิดคำตอบ AI ใน Production</p>
        </div>
        <button type="button" className="dg-chip" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> ตรวจอีกครั้ง</button>
      </div>
      {loading && <p role="status">กำลังตรวจสอบเอกสารในคลังความรู้…</p>}
      {error && <div className="dg-note" role="alert"><AlertTriangle size={17} /> {error}</div>}
      {report && !loading && (
        <>
          <div className="dg-grid" style={{ marginTop: 14 }}>
            <article className="dg-card"><span className="dg-source-meta">เอกสารทั้งหมด</span><h3>{report.totalDocuments}</h3></article>
            <article className="dg-card"><span className="dg-source-meta">รอทบทวนทางคลินิก</span><h3>{report.awaitingClinicalReview}</h3></article>
            <article className="dg-card"><span className="dg-source-meta">ผ่านทบทวนพร้อมหลักฐาน</span><h3>{report.clinicallyReviewed}</h3></article>
          </div>
          <div className="dg-note" style={{ marginTop: 14 }}>
            <ShieldAlert size={19} />
            <div><strong>Production AI Answers: ปิดใช้งาน</strong><div>{report.summary}</div><div style={{ marginTop: 4 }}>สถานะนี้เปลี่ยนได้เมื่อมีการทบทวนเอกสารและอนุมัติตามกระบวนการแยกต่างหากเท่านั้น</div></div>
          </div>
          <div style={{ marginTop: 18 }}>
            <h3>รายการตรวจสอบ</h3>
            {report.checks.map((check) => <div key={check.id} style={{ display: "flex", gap: 9, padding: "9px 0", borderBottom: "1px solid var(--border, #e2e8f0)" }}>
              {check.status === "pass" ? <CheckCircle2 size={17} color="#16845b" /> : check.status === "warning" ? <AlertTriangle size={17} color="#b7791f" /> : <ShieldAlert size={17} color="#c2413b" />}
              <div><strong>{check.label}</strong><div className="dg-source-meta">{check.detail}</div></div>
            </div>)}
          </div>
          <div style={{ marginTop: 18 }}>
            <h3>ทะเบียนเอกสาร</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {report.documents.map((document) => <article className="dg-card" key={document.id}>
                <strong>{document.title}</strong>
                <div className="dg-source-meta">{document.publisher} · {document.publishedAt}</div>
                <div className="dg-source-meta">{document.reviewStatus === "clinically_reviewed" && document.reviewMetadataComplete ? "ผ่านการทบทวนพร้อม Metadata" : "รอผู้เชี่ยวชาญทบทวน"}</div>
                {document.sourceUrl && <a className="dg-source-link" href={document.sourceUrl} target="_blank" rel="noopener noreferrer">เปิดแหล่งต้นฉบับ</a>}
              </article>)}
            </div>
          </div>
          <div className="dg-source-meta" style={{ marginTop: 12 }}>{report.note}</div>
        </>
      )}
    </section>
  );
}
