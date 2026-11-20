"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Bot, BookOpen, LoaderCircle, MessageCircle, Send, ShieldAlert, Trash2 } from "lucide-react";

type Citation = {
  marker: string;
  id: string;
  title: string;
  publisher: string;
  publishedAt: string;
  sourceUrl: string;
  reviewStatus: string;
};
type EvidencePassage = {
  chunkId: string; documentId: string; title: string; sectionLabel: string; text: string;
  publisher: string; publishedAt: string; sourceUrl: string; reviewStatus: string;
};
type ChatTurn = { role: "user" | "assistant"; content: string };
type DisplayTurn = ChatTurn & { citations?: Citation[]; evidencePassages?: EvidencePassage[]; disclaimer?: string; abstained?: boolean; evidenceOnly?: boolean };

const suggestions = [
  "ไข้เลือดออกติดต่อได้อย่างไร?",
  "สัญญาณเตือนของไข้เลือดออกมีอะไรบ้าง?",
  "NS1, IgM และ IgG แตกต่างกันอย่างไร?",
  "มีวิธีป้องกันยุงลายในบ้านอย่างไร?",
];

export function HealthAssistantChatPanel() {
  const [query, setQuery] = useState("");
  const [turns, setTurns] = useState<DisplayTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastMessages = turns.slice(-8).map(({ role, content }) => ({ role, content }));

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
      const response = await fetch("/api/health-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question, history: lastMessages }),
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "ระบบถามตอบยังไม่พร้อมใช้งาน");
        return;
      }
      const answer = typeof payload?.answer === "string"
        ? payload.answer
        : typeof payload?.safetyMessage === "string"
          ? payload.safetyMessage
          : typeof payload?.message === "string" ? payload.message : "ระบบงดตอบคำถามนี้เพื่อความปลอดภัย";
      setTurns((current) => [...current, {
        role: "assistant",
        content: answer,
        citations: Array.isArray(payload?.citations) ? payload.citations : [],
        evidencePassages: Array.isArray(payload?.evidencePassages) ? payload.evidencePassages : [],
        disclaimer: typeof payload?.disclaimer === "string" ? payload.disclaimer : undefined,
        abstained: payload?.abstained === true,
        evidenceOnly: payload?.mode === "evidence-only" && payload?.abstained !== true,
      }]);
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบถามตอบได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dg-card" aria-labelledby="health-assistant-chat-title">
      <div className="dg-section-head">
        <div>
          <span className="dg-eyebrow"><MessageCircle size={14} /> GROUNDED CONVERSATIONAL ASSISTANT</span>
          <h2 id="health-assistant-chat-title">ถาม–ตอบความรู้ไข้เลือดออก</h2>
          <p>ค้นคืนเอกสารและประเด็นที่เกี่ยวข้อง พร้อมเปิดอ่านต้นฉบับได้ โดยไม่สังเคราะห์คำตอบทางการแพทย์ด้วย AI</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="dg-pill dg-pill-muted">Evidence-only · Production</span>
          <button type="button" className="dg-chip" onClick={startNewConversation} disabled={busy || turns.length === 0} aria-label="เริ่มบทสนทนาใหม่">
            <Trash2 size={14} /> เริ่มบทสนทนาใหม่
          </button>
        </div>
      </div>

      <div className="dg-note" style={{ marginTop: 14 }}>
        <ShieldAlert size={18} />
        <div><strong>โหมดค้นคืนหลักฐาน</strong><div>ระบบแสดงเอกสารและประเด็นจากคลังความรู้ ยังไม่สร้างคำตอบด้วย AI เพราะแหล่งความรู้รอผู้เชี่ยวชาญทบทวน ระบบไม่รับผลตรวจส่วนบุคคล ไม่วินิจฉัย และไม่แนะนำยา หากมีอาการรุนแรงให้ไปโรงพยาบาลโดยไม่รอแชต</div></div>
      </div>

      <div aria-live="polite" style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {turns.map((turn, index) => (
          <article key={`${turn.role}-${index}`} className="dg-card" style={{ background: turn.role === "user" ? "var(--surface-soft, #f3f7f6)" : undefined }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, color: "#17685f", fontWeight: 700 }}>
              {turn.role === "assistant" ? <Bot size={17} /> : <MessageCircle size={17} />}
              {turn.role === "assistant" ? "DengueYosoku Assistant" : "คุณ"}
              {turn.evidenceOnly && <span className="dg-pill dg-pill-muted">แสดงหลักฐานเท่านั้น</span>}
              {turn.abstained && <span className="dg-pill dg-pill-muted">งดตอบเพื่อความปลอดภัย</span>}
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.75 }}>{turn.content}</div>
            {turn.citations && turn.citations.length > 0 && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border, #dce7e4)", paddingTop: 10 }}>
                <strong style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><BookOpen size={15} /> แหล่งอ้างอิง</strong>
                <ul style={{ paddingLeft: 20, marginTop: 7, lineHeight: 1.7 }}>
                  {turn.citations.map((citation) => (
                    <li key={citation.id}>
                      <a className="dg-source-link" href={citation.sourceUrl} target="_blank" rel="noopener noreferrer">
                        {citation.marker} {citation.title}
                      </a>
                      <span className="dg-source-meta"> · {citation.publisher} · {citation.publishedAt} · {citation.reviewStatus === "awaiting_clinical_review" ? "รอผู้เชี่ยวชาญทบทวน" : citation.reviewStatus}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {turn.evidencePassages && turn.evidencePassages.length > 0 && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border, #dce7e4)", paddingTop: 10 }}>
                <strong style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><BookOpen size={15} /> ข้อความจากทะเบียนความรู้ที่ใช้ประกอบคำตอบ</strong>
                <p className="dg-source-meta">ข้อความต่อไปนี้เป็นสรุป/ประเด็นสำคัญในทะเบียน ไม่ใช่ข้อความคัดตรงจากต้นฉบับหรือเอกสารฉบับเต็ม</p>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {turn.evidencePassages.map((passage) => (
                    <article key={passage.chunkId} className="dg-card">
                      <strong>{passage.title} · {passage.sectionLabel}</strong>
                      <p>{passage.text}</p>
                      <a className="dg-source-link" href={passage.sourceUrl} target="_blank" rel="noopener noreferrer">เปิดต้นฉบับ · {passage.publisher}</a>
                      <span className="dg-source-meta">{passage.publishedAt} · {passage.reviewStatus}</span>
                    </article>
                  ))}
                </div>
              </div>
            )}
            {turn.disclaimer && <p className="dg-source-meta" style={{ marginTop: 10 }}>{turn.disclaimer}</p>}
          </article>
        ))}
        {busy && <div className="dg-note"><LoaderCircle size={17} /> กำลังค้นหลักฐานและเตรียมคำตอบ…</div>}
      </div>

      {turns.length === 0 && (
        <div style={{ marginTop: 16 }}>
          <p className="dg-source-meta">ลองถามคำถามความรู้ทั่วไป</p>
          <div className="dg-chip-row">
            {suggestions.map((item) => <button key={item} type="button" className="dg-chip" disabled={busy} onClick={() => void send(undefined, item)}>{item}</button>)}
          </div>
        </div>
      )}

      {error && <div role="alert" className="dg-note" style={{ marginTop: 14 }}>{error}</div>}
      <form onSubmit={(event) => void send(event)} style={{ display: "flex", gap: 9, marginTop: 16 }}>
        <label htmlFor="health-assistant-chat-input" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>พิมพ์คำถาม</label>
        <input
          id="health-assistant-chat-input"
          className="dg-search"
          style={{ flex: 1, minWidth: 0, margin: 0 }}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={500}
          minLength={2}
          placeholder="พิมพ์คำถามเกี่ยวกับไข้เลือดออก…"
          disabled={busy}
        />
        <button type="submit" disabled={busy || query.trim().length < 2} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: 0, borderRadius: 12, padding: "0 16px", background: "#17685f", color: "white", fontWeight: 700 }}>
          <Send size={16} /> ส่ง
        </button>
      </form>
      <div className="dg-source-meta" style={{ marginTop: 9 }}>บทสนทนาเก็บไว้ในหน่วยความจำของหน้าเว็บเท่านั้น ไม่บันทึกลงฐานข้อมูล เมื่อปิดหรือโหลดหน้าใหม่ ประวัติจะหายไป · โหมดนี้ใช้ค้นหลักฐาน ไม่ใช่คำตอบที่สร้างโดย AI</div>
    </section>
  );
}
