"use client";

import { useEffect, useState } from "react";
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
  publisher: string; publishedAt: string; sourceUrl: string; reviewStatus: string; similarity?: number;
};
type ChatTurn = { role: "user" | "assistant"; content: string };
type DisplayTurn = ChatTurn & { citations?: Citation[]; evidencePassages?: EvidencePassage[]; disclaimer?: string; abstained?: boolean; noEvidence?: boolean; evidenceOnly?: boolean; draftOnly?: boolean };

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
  const [runtime, setRuntime] = useState<{ generatedAnswersEnabled: boolean; model: string | null; message: string; provider?: string } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadRuntime() {
      try {
        const sqliteResponse = await fetch("/api/health-assistant/sqlite-search", { cache: "no-store" });
        const sqliteStatus = await sqliteResponse.json();
        if (active && sqliteStatus?.configured === true) {
          setRuntime({
            generatedAnswersEnabled: sqliteStatus?.generatedAnswersEnabled === true,
            model: typeof sqliteStatus?.model === "string" ? sqliteStatus.model : null,
            provider: "SQLite Local",
            message: typeof sqliteStatus?.message === "string"
              ? sqliteStatus.message
              : "พร้อมค้นหลักฐานจาก SQLite ในเครื่อง",
          });
          return;
        }
      } catch {
        // Keep the existing AI/evidence runtime as a fallback when local SQLite is not configured.
      }

      try {
        const response = await fetch("/api/health-assistant/chat", { cache: "no-store" });
        if (!response.ok) throw new Error("status unavailable");
        const payload = await response.json();
        if (active) setRuntime({
          generatedAnswersEnabled: payload?.generatedAnswersEnabled === true,
          model: typeof payload?.model === "string" ? payload.model : null,
          provider: typeof payload?.provider === "string" ? payload.provider : undefined,
          message: typeof payload?.message === "string" ? payload.message : "ยังไม่สามารถตรวจสอบสถานะ AI ได้",
        });
      } catch {
        if (active) setRuntime({
          generatedAnswersEnabled: false,
          model: null,
          message: "ไม่สามารถตรวจสถานะ AI ได้ในขณะนี้ ระบบยังให้ค้นคืนหลักฐานได้",
        });
      }
    }
    void loadRuntime();
    return () => { active = false; };
  }, []);

  const lastMessages = turns.slice(-8).map(({ role, content }) => ({ role, content }));
  const isSqliteRuntime = runtime?.provider?.startsWith("SQLite Local") === true;

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
      const sqliteMode = isSqliteRuntime;
      const response = await fetch(sqliteMode ? "/api/health-assistant/sqlite-search" : "/api/health-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sqliteMode ? { query: question } : { query: question, history: lastMessages }),
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "ระบบค้นความรู้ยังไม่พร้อมใช้งาน");
        return;
      }

      const answer = typeof payload?.answer === "string"
        ? payload.answer
        : typeof payload?.safetyMessage === "string"
          ? payload.safetyMessage
          : typeof payload?.safety?.message === "string"
            ? payload.safety.message
            : typeof payload?.message === "string" ? payload.message : "ระบบงดตอบคำถามนี้เพื่อความปลอดภัย";
      setTurns((current) => [...current, {
        role: "assistant",
        content: answer,
        citations: Array.isArray(payload?.citations) ? payload.citations : [],
        evidencePassages: Array.isArray(payload?.evidencePassages) ? payload.evidencePassages : [],
        disclaimer: typeof payload?.disclaimer === "string" ? payload.disclaimer : undefined,
        abstained: payload?.abstained === true,
        noEvidence: payload?.noEvidence === true || payload?.status === "no_evidence",
        evidenceOnly: payload?.mode === "evidence-only" && payload?.abstained !== true && payload?.noEvidence !== true,
        draftOnly: payload?.draftOnly === true,
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
          <span className="dg-eyebrow"><MessageCircle size={14} /> AI HEALTH ASSISTANT</span>
          <h2 id="health-assistant-chat-title">{isSqliteRuntime ? (runtime?.generatedAnswersEnabled ? "ถาม–ตอบความรู้ไข้เลือดออก" : "ค้นหลักฐานความรู้ไข้เลือดออก") : "ถาม–ตอบความรู้ไข้เลือดออก"}</h2>
          <p>ถามเรื่องไข้เลือดออกได้ทันที ระบบจะแสดงแหล่งอ้างอิงเมื่อมีหลักฐานรองรับ</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="dg-pill dg-pill-muted">{runtime === null ? "กำลังตรวจสอบระบบ…" : isSqliteRuntime ? (runtime.generatedAnswersEnabled ? "SQLite Local · AI Draft" : "SQLite Local · Evidence only") : runtime.generatedAnswersEnabled ? `${runtime.provider === "Ollama (local)" ? "Local AI" : "AI Preview"} · ${runtime.model ?? "Draft only"}` : "Evidence-only"}</span>
          <button type="button" className="dg-chip" onClick={startNewConversation} disabled={busy || turns.length === 0} aria-label="เริ่มบทสนทนาใหม่">
            <Trash2 size={14} /> เริ่มบทสนทนาใหม่
          </button>
        </div>
      </div>

      <div className="dg-note" style={{ marginTop: 14 }}>
        <ShieldAlert size={18} />
        <div><strong>{isSqliteRuntime ? (runtime?.generatedAnswersEnabled ? "SQLite Local RAG · AI draft จากหลักฐาน" : "SQLite Local RAG · แสดงหลักฐานเท่านั้น") : runtime?.generatedAnswersEnabled ? (runtime.provider === "Ollama (local)" ? "Local AI · คำตอบร่างเพื่อการศึกษา" : "AI Preview · คำตอบร่างเพื่อการศึกษา") : "โหมดค้นคืนหลักฐาน"}</strong><div>{runtime?.message ?? "กำลังตรวจสอบการเชื่อมต่อ AI Gateway"} ให้ข้อมูลความรู้ทั่วไปเท่านั้น ไม่วินิจฉัย ไม่แปลผลตรวจเฉพาะบุคคล และไม่ใช้แทนบุคลากรทางการแพทย์ หากมีอาการรุนแรงให้ไปโรงพยาบาลทันที</div></div>
      </div>

      <div aria-live="polite" style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {turns.map((turn, index) => (
          <article key={`${turn.role}-${index}`} className="dg-card" style={{ background: turn.role === "user" ? "var(--surface-soft, #f3f7f6)" : undefined }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, color: "#17685f", fontWeight: 700 }}>
              {turn.role === "assistant" ? <Bot size={17} /> : <MessageCircle size={17} />}
              {turn.role === "assistant" ? "DengueYosoku Assistant" : "คุณ"}
              {turn.evidenceOnly && <span className="dg-pill dg-pill-muted">แสดงหลักฐานเท่านั้น</span>}
              {turn.abstained && <span className="dg-pill dg-pill-muted">งดตอบเพื่อความปลอดภัย</span>}
              {turn.noEvidence && <span className="dg-pill dg-pill-muted">ไม่พบหลักฐาน</span>}
              {turn.draftOnly && <span className="dg-pill dg-pill-muted">AI draft · รอทบทวนทางคลินิก</span>}
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
                <strong style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><BookOpen size={15} /> {isSqliteRuntime ? "ข้อความหลักฐานจาก SQLite" : "ข้อความจากทะเบียนความรู้ที่ใช้ประกอบคำตอบ"}</strong>
                <p className="dg-source-meta">ข้อความต่อไปนี้เป็น excerpt จาก chunk ที่ผ่านตัวกรอง ไม่ใช่เอกสารฉบับเต็มหรือการรับรองความถูกต้องทางคลินิก</p>
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
        {busy && <div className="dg-note"><LoaderCircle size={17} /> {isSqliteRuntime ? (runtime?.generatedAnswersEnabled ? "กำลังค้นหลักฐานและสังเคราะห์ร่างคำตอบ…" : "กำลังค้นหลักฐานจาก SQLite…") : "กำลังค้นหลักฐานและเตรียมคำตอบ…"}</div>}
      </div>

      {turns.length === 0 && (
        <div style={{ marginTop: 16 }}>
          <p className="dg-source-meta">ลองถามคำถามความรู้ทั่วไป</p>
          <div className="dg-chip-row">
            {suggestions.map((item) => <button key={item} type="button" className="dg-chip" disabled={busy || runtime === null} onClick={() => void send(undefined, item)}>{item}</button>)}
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
          disabled={busy || runtime === null}
        />
        <button type="submit" disabled={busy || runtime === null || query.trim().length < 2} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: 0, borderRadius: 12, padding: "0 16px", background: "#17685f", color: "white", fontWeight: 700 }}>
          <Send size={16} /> ส่ง
        </button>
      </form>
      <div className="dg-source-meta" style={{ marginTop: 9 }}>
        ประวัติแชตอยู่ในหน่วยความจำของหน้าเว็บเท่านั้น ไม่บันทึกลงฐานข้อมูลของ DengueYosoku และจะหายไปเมื่อปิดหรือโหลดหน้าใหม่
        {isSqliteRuntime
          ? runtime?.generatedAnswersEnabled
            ? "· SQLite ค้นหลักฐานในเครื่องและส่งเฉพาะคำถามกับ excerpt สาธารณะที่ค้นพบไปยัง Vercel AI Gateway เพื่อสร้างร่างคำตอบ ไม่ส่งประวัติแชต"
            : "· โหมด SQLite Local ส่งเฉพาะคำถามไปค้นฐานข้อมูลบนเครื่อง ผ่าน Public Allow-list; ไม่ส่งประวัติสนทนาไปยัง AI Provider"
          : runtime?.provider === "Ollama (local)"
            ? "· โหมด Local AI ส่งคำถามความรู้ทั่วไปที่ผ่าน Safety Gate ไปยัง Ollama บนเครื่องนี้ โดยไม่เรียก Vercel AI Gateway"
            : "· ใน AI Preview เฉพาะคำถามความรู้ทั่วไปที่ผ่าน Safety Gate จะถูกส่งไปยัง Vercel AI Gateway เพื่อสร้างร่างคำตอบ"}
        · ห้ามใส่ชื่อ เลขบัตรประชาชน HN/AN เบอร์โทร วันเกิด อาการเฉพาะบุคคล หรือผลตรวจของผู้ป่วย
        {runtime?.provider === "SQLite Local" || runtime?.provider === "Ollama (local)" ? "" : "· การประมวลผลโดยผู้ให้บริการ AI เป็นไปตามนโยบายของผู้ให้บริการนั้น"}
        {isSqliteRuntime
          ? runtime?.generatedAnswersEnabled
            ? "· คำตอบ AI เป็นร่างเพื่อการศึกษา อ้างอิงเฉพาะหลักฐานที่ค้นได้ และยังไม่ผ่านการทบทวนทางคลินิก"
            : "· ข้อความที่แสดงเป็นหลักฐานจากเอกสาร ไม่ใช่ข้อสรุปที่ผ่านการทบทวนทางคลินิก"
          : "· คำตอบเป็นร่างเพื่อการศึกษา ไม่ใช่คำแนะนำทางการแพทย์ และ Production ยังคง Evidence-only"}
      </div>
    </section>
  );
}
