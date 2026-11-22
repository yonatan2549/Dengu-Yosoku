"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { BookOpen, LoaderCircle, MessageCircle, Send, ShieldAlert, Trash2 } from "lucide-react";

type RagResult = {
  rank: number;
  sourceId: string;
  title: string;
  authority: string;
  pageLabel: string;
  extractionMethod: string;
  qualityStatus: "ok";
  replacementChars: 0;
  retrievedAt: string | null;
  sourceUrl: string;
  text: string;
  scores: { combined: number; semantic: number; lexical: number; intentAdjustment: number };
};

type RagResponse = {
  mode: string;
  generatedAnswer: false;
  status: "ok" | "no_evidence" | "blocked";
  query: string;
  audience: "public";
  safety: { blocked: boolean; gateReasons: string[]; message?: string };
  retrieval: {
    engine: string;
    version: string;
    indexedChunks: number;
    eligibleChunks: number;
    resultCount: number;
    semanticWeight: number;
    queryIntent: string | null;
    withheld: { sourcePolicy: number; audiencePolicy: number; textQuality: number };
  };
  results: RagResult[];
  warnings: string[];
  disclaimer?: string;
};

type DisplayTurn = {
  role: "user" | "assistant";
  content: string;
  rag?: RagResponse;
  abstained?: boolean;
};

const suggestions = [
  "ไข้เลือดออกติดต่อได้อย่างไร?",
  "สัญญาณเตือนของไข้เลือดออกมีอะไรบ้าง?",
  "NS1, IgM และ IgG แตกต่างกันอย่างไร?",
  "มีวิธีป้องกันยุงลายในบ้านอย่างไร?",
];

function assistantMessage(payload: RagResponse): string {
  if (payload.status === "blocked") {
    return payload.safety.message ?? "ระบบงดค้นคืนคำถามนี้เพื่อความปลอดภัย";
  }
  if (payload.status === "no_evidence") {
    return "ยังไม่พบข้อความหลักฐานที่ผ่าน Public Allow-list สำหรับคำถามนี้ ระบบจึงไม่สร้างคำตอบขึ้นเอง";
  }
  return "ค้นพบหลักฐานจากคลังความรู้ในเครื่อง " + payload.results.length +
    " รายการ ด้านล่างเป็นข้อความจากเอกสารต้นทางที่ผ่านตัวกรองสาธารณะ ระบบยังไม่สังเคราะห์เป็นคำตอบด้วย AI";
}

export function HealthAssistantChatPanel() {
  const [query, setQuery] = useState("");
  const [turns, setTurns] = useState<DisplayTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startNewConversation() {
    if (busy) return;
    setTurns([]);
    setQuery("");
    setError(null);
  }

  async function send(event?: FormEvent<HTMLFormElement>, preset?: string) {
    event?.preventDefault();
    const question = (preset ?? query).trim();
    if (question.length < 2 || busy) return;

    setError(null);
    setBusy(true);
    setTurns((current) => [...current, { role: "user", content: question }]);
    setQuery("");

    try {
      const response = await fetch("/api/health-assistant/rag-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question }),
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "Local RAG ยังไม่พร้อมใช้งาน");
        return;
      }

      const rag = payload as RagResponse;
      setTurns((current) => [...current, {
        role: "assistant",
        content: assistantMessage(rag),
        rag,
        abstained: rag.status !== "ok",
      }]);
    } catch {
      setError("ไม่สามารถเชื่อมต่อ Local RAG ได้ กรุณาตรวจว่า Ollama และ Next.js ทำงานอยู่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dg-card" aria-labelledby="health-assistant-chat-title">
      <div className="dg-section-head">
        <div>
          <span className="dg-eyebrow"><MessageCircle size={14} /> LOCAL SQLITE RAG · EVIDENCE SEARCH</span>
          <h2 id="health-assistant-chat-title">ค้นคืนหลักฐานความรู้ไข้เลือดออก</h2>
          <p>ค้นจาก SQLite Knowledge Base ในเครื่องด้วย Embedding และ Hybrid Retrieval โดยแสดงแหล่งที่มา ไม่สร้างคำตอบจาก AI</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="dg-pill dg-pill-muted">Local RAG · Evidence only</span>
          <button type="button" className="dg-chip" onClick={startNewConversation} disabled={busy || turns.length === 0} aria-label="เริ่มบทสนทนาใหม่">
            <Trash2 size={14} /> เริ่มบทสนทนาใหม่
          </button>
        </div>
      </div>

      <div className="dg-note" style={{ marginTop: 14 }}>
        <ShieldAlert size={18} />
        <div>
          <strong>โหมดค้นหลักฐานในเครื่อง</strong>
          <div>คำถามทั่วไปจะถูกส่งไปยัง Local RAG บนเครื่องนี้เท่านั้น ไม่ส่งประวัติสนทนาหรือผลตรวจส่วนบุคคลไปยัง AI Provider ระบบไม่วินิจฉัย ไม่แปลผลตรวจ และไม่แนะนำยา</div>
        </div>
      </div>

      <div aria-live="polite" style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {turns.map((turn, index) => (
          <article key={turn.role + "-" + index} className="dg-card" style={{ background: turn.role === "user" ? "var(--surface-soft, #f3f7f6)" : undefined }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, color: "#17685f", fontWeight: 700 }}>
              <MessageCircle size={17} />
              {turn.role === "assistant" ? "DengueYosoku Local RAG" : "คุณ"}
              {turn.abstained && <span className="dg-pill dg-pill-muted">งดค้นคืน</span>}
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.75 }}>{turn.content}</div>

            {turn.rag?.status === "ok" && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border, #dce7e4)", paddingTop: 10 }}>
                <div className="dg-source-meta" style={{ marginBottom: 8 }}>
                  Indexed {turn.rag.retrieval.indexedChunks} · Eligible public {turn.rag.retrieval.eligibleChunks} · Retrieved {turn.rag.retrieval.resultCount}
                </div>
                <div style={{ display: "grid", gap: 9 }}>
                  {turn.rag.results.map((result) => (
                    <article key={result.sourceId + "-" + result.rank} className="dg-card">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <strong>{result.rank}. {result.title}</strong>
                        <span className="dg-pill dg-pill-muted">Public general</span>
                      </div>
                      <div className="dg-source-meta">{result.authority} · {result.pageLabel}</div>
                      <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{result.text}</p>
                      <a className="dg-source-link" href={result.sourceUrl} target="_blank" rel="noopener noreferrer">
                        เปิดแหล่งข้อมูลต้นฉบับ
                      </a>
                      <div className="dg-source-meta">
                        Extraction: {result.extractionMethod} · Quality: {result.qualityStatus}
                        {result.retrievedAt ? " · Retrieved: " + result.retrievedAt : ""}
                      </div>
                      <div className="dg-source-meta">
                        Retrieval rank score: {result.scores.combined.toFixed(3)} · คะแนนจัดอันดับไม่ใช่คะแนนความถูกต้องทางการแพทย์
                      </div>
                    </article>
                  ))}
                </div>
                <div className="dg-source-meta" style={{ marginTop: 9 }}>
                  Withheld by policy: source {turn.rag.retrieval.withheld.sourcePolicy}, audience {turn.rag.retrieval.withheld.audiencePolicy}, quality {turn.rag.retrieval.withheld.textQuality}
                </div>
              </div>
            )}

            {turn.rag?.warnings?.map((warning, warningIndex) => (
              <div className="dg-source-meta" key={warningIndex} style={{ marginTop: 8 }}>{warning}</div>
            ))}
            {turn.rag?.disclaimer && <p className="dg-source-meta" style={{ marginTop: 9 }}>{turn.rag.disclaimer}</p>}
          </article>
        ))}
        {busy && <div className="dg-note"><LoaderCircle size={17} /> กำลังสร้าง Embedding และค้นหลักฐานจาก SQLite…</div>}
      </div>

      {turns.length === 0 && (
        <div style={{ marginTop: 16 }}>
          <p className="dg-source-meta">ลองค้นคำถามความรู้ทั่วไป</p>
          <div className="dg-chip-row">
            {suggestions.map((item) => (
              <button key={item} type="button" className="dg-chip" disabled={busy} onClick={() => void send(undefined, item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div role="alert" className="dg-note" style={{ marginTop: 14 }}>{error}</div>}
      <form onSubmit={(event) => void send(event)} style={{ display: "flex", gap: 9, marginTop: 16 }}>
        <label htmlFor="health-assistant-chat-input" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
          พิมพ์คำถาม
        </label>
        <input
          id="health-assistant-chat-input"
          className="dg-search"
          style={{ flex: 1, minWidth: 0, margin: 0 }}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={500}
          minLength={2}
          placeholder="พิมพ์คำถามความรู้เกี่ยวกับไข้เลือดออก…"
          disabled={busy}
        />
        <button type="submit" disabled={busy || query.trim().length < 2} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: 0, borderRadius: 12, padding: "0 16px", background: "#17685f", color: "white", fontWeight: 700 }}>
          <Send size={16} /> ค้นหา
        </button>
      </form>
      <div className="dg-source-meta" style={{ marginTop: 9 }}>
        คำถามถูกส่งไปยัง Local RAG บนเครื่องนี้เพื่อค้นหลักฐาน ไม่มีการส่งประวัติสนทนาไปยัง AI Provider และไม่มีการบันทึกบทสนทนาลงฐานข้อมูล
      </div>
    </section>
  );
}
