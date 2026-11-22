"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, ArrowUpRight, BookOpen, Search, ShieldCheck } from "lucide-react";

type SearchResult = {
  id: string;
  category: string;
  title: string;
  summary: string;
  keyPoints: string[];
  publisher: string;
  publishedAt: string;
  sourceUrl: string;
  sourceType: string;
  reviewStatus: "awaiting_clinical_review";
  relevance: number;
};

type EvidencePassage = {
  chunkId: string; documentId: string; title: string; sectionLabel: string; text: string;
  publisher: string; publishedAt: string; sourceUrl: string; reviewStatus: string;
};

type SearchResponse = {
  mode: "evidence-only";
  generatedAnswer: false;
  intent: "emergency-warning" | "personal-medical" | "general-education";
  safetyLevel: "urgent" | "caution" | "education" | "no-evidence";
  safetyMessage: string;
  abstained: boolean;
  query: string;
  results: SearchResult[];
  citations: Array<{ id: string; title: string; publisher: string; publishedAt: string; sourceUrl: string; reviewStatus: string }>;
  message: string;
  evidencePassages?: EvidencePassage[];
  retrievalMethod?: string;
  fullDocumentRag?: boolean;
};

const suggestions = [
  "สัญญาณเตือนไข้เลือดออก",
  "NS1, IgM และ IgG ต่างกันอย่างไร",
  "การดูแลผู้ป่วยไข้เลือดออก",
  "การป้องกันยุงลาย",
];

export function HealthAssistantKnowledgePanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResults(null);
    setLoading(true);
    try {
      const response = await fetch("/api/health-assistant/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "ค้นหาเอกสารอ้างอิงไม่สำเร็จ");
      setResults(payload as SearchResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เกิดข้อผิดพลาดในการค้นหา");
    } finally {
      setLoading(false);
    }
  }

  function chooseSuggestion(value: string) {
    setQuery(value);
    setResults(null);
    setError(null);
  }

  const safetyTitle = results?.safetyLevel === "urgent"
    ? "ข้อความเพื่อความปลอดภัยเร่งด่วน"
    : results?.safetyLevel === "caution"
      ? "คำถามนี้ต้องได้รับการประเมินเฉพาะบุคคล"
      : results?.safetyLevel === "no-evidence"
        ? "ยังไม่มีหลักฐานรองรับในคลังความรู้"
        : "ขอบเขตและสถานะของหลักฐาน";

  return (
    <section className="dg-card" aria-labelledby="health-knowledge-search-title">
      <div className="dg-section-head">
        <div>
          <span className="dg-eyebrow"><BookOpen size={14} /> EVIDENCE-FIRST HEALTH KNOWLEDGE</span>
          <h2 id="health-knowledge-search-title">ค้นหาความรู้จากเอกสารอ้างอิง</h2>
          <p>ค้นคืนเอกสารพร้อมแหล่งที่มา และใช้ Safety Gate ก่อนแสดงผล</p>
        </div>
        <span className="dg-pill dg-pill-muted">HA-2 · Evidence Preview</span>
      </div>

      <form onSubmit={submit} style={{ display: "flex", gap: 9, alignItems: "stretch", marginTop: 16 }}>
        <label htmlFor="health-knowledge-query" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>คำถามหรือคำค้นหา</label>
        <input
          id="health-knowledge-query"
          className="dg-search"
          style={{ flex: 1, minWidth: 0, margin: 0 }}
          value={query}
          maxLength={500}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหา เช่น สัญญาณเตือน, NS1, IgM, การป้องกัน…"
          required
          minLength={2}
        />
        <button type="submit" disabled={loading || query.trim().length < 2} style={{ display: "inline-flex", gap: 7, alignItems: "center", justifyContent: "center", border: 0, borderRadius: 12, padding: "0 16px", background: "#17685f", color: "#fff", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>
          <Search size={16} /> {loading ? "กำลังค้นหา" : "ค้นหา"}
        </button>
      </form>

      <div className="dg-chip-row" style={{ marginTop: 12 }}>
        {suggestions.map((suggestion) => (
          <button key={suggestion} type="button" className="dg-chip" onClick={() => chooseSuggestion(suggestion)}>{suggestion}</button>
        ))}
      </div>

      <div className="dg-note" style={{ marginTop: 16 }}>
        <ShieldCheck size={18} />
        <div><strong>HA-2 ยังไม่สร้างคำตอบด้วย LLM</strong><div>ระบบทำ Evidence Retrieval และ Safety Routing เท่านั้น ไม่วินิจฉัย ไม่แปลผลตรวจเฉพาะบุคคล ไม่เลือกยา และไม่เก็บประวัติคำค้น</div></div>
      </div>

      {error && <div role="alert" className="dg-note" style={{ marginTop: 14 }}><AlertTriangle size={18} /><span>{error}</span></div>}
      {results && (
        <div style={{ marginTop: 20 }} aria-live="polite">
          <div className="dg-note" role={results.safetyLevel === "urgent" ? "alert" : "status"} style={{ marginBottom: 15, borderColor: results.safetyLevel === "urgent" ? "#d97706" : undefined }}>
            <AlertTriangle size={19} />
            <div><strong>{safetyTitle}</strong><div>{results.safetyMessage}</div></div>
          </div>
          <div className="dg-section-head">
            <div><h3>Evidence ที่ค้นพบ</h3><p>{results.message}</p></div>
            <span className="dg-pill">{results.results.length} แหล่ง</span>
          </div>
          {results.results.length === 0 ? (
            <p className="dg-card">ยังไม่มีเอกสารในคลังที่ตรงกับคำค้นนี้ ระบบจะไม่คาดเดาคำตอบแทนหลักฐาน</p>
          ) : (
            <div className="dg-grid-2">
              {results.results.map((result) => (
                <article className="dg-card dg-article-card" key={result.id}>
                  <div className="dg-source-meta"><span className="dg-pill dg-pill-muted">{result.sourceType}</span><span>{result.publisher}</span></div>
                  <h3>{result.title}</h3>
                  <p>{result.summary}</p>
                  <ul style={{ paddingLeft: 18, lineHeight: 1.65 }}>{result.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul>
                  <div className="dg-source-meta">เผยแพร่: {result.publishedAt} · รอผู้เชี่ยวชาญทบทวน</div>
                  <a className="dg-source-link" href={result.sourceUrl} target="_blank" rel="noopener noreferrer">เปิดเอกสารต้นฉบับ <ArrowUpRight size={14} /></a>
                </article>
              ))}
            </div>
          )}
          {results.evidencePassages && results.evidencePassages.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="dg-section-head"><div><h3>ข้อความจากทะเบียนความรู้ที่ใช้ประกอบคำตอบ</h3><p>ข้อความสรุป/ประเด็นสำคัญในทะเบียน ไม่ใช่ข้อความคัดตรงจากต้นฉบับหรือเอกสารฉบับเต็ม</p></div><span className="dg-pill">{results.evidencePassages.length} passages</span></div>
              <div className="dg-grid-2">
                {results.evidencePassages.map((passage) => (
                  <article className="dg-card" key={passage.chunkId}>
                    <span className="dg-pill dg-pill-muted">{passage.sectionLabel}</span>
                    <h3>{passage.title}</h3>
                    <p>{passage.text}</p>
                    <div className="dg-source-meta">{passage.publisher} · {passage.publishedAt} · {passage.reviewStatus}</div>
                    <a className="dg-source-link" href={passage.sourceUrl} target="_blank" rel="noopener noreferrer">เปิดเอกสารต้นฉบับ <ArrowUpRight size={14} /></a>
                  </article>
                ))}
              </div>
            </div>
          )}
          <div className="dg-source-meta" style={{ marginTop: 12 }}>Intent: {results.intent} · Generated answer: No · Retrieval: {results.retrievalMethod ?? "document-level"} · Full-document RAG: {results.fullDocumentRag ? "Yes" : "No"} · Abstained: {results.abstained ? "Yes" : "No"}</div>
        </div>
      )}
    </section>
  );
}
