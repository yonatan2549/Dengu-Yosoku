"use client";

import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  BookOpen,
  LoaderCircle,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type EvidenceItem = {
  rank: number;
  source: string;
  authority: string;
  page: string;
  language: string;
  url: string;
  excerpt: string;
};

type ApiResult = {
  status: "evidence" | "no_evidence" | "blocked" | "emergency" | "unavailable" | "error";
  message: string;
  evidence?: EvidenceItem[];
  disclaimer?: string;
  emergencySignals?: string[];
};

type ChatTurn = {
  id: number;
  question: string;
  result: ApiResult;
};

const SUGGESTIONS = [
  "อาการเตือนของโรคไข้เลือดออกที่ต้องรีบไปโรงพยาบาลมีอะไรบ้าง?",
  "มีวิธีป้องกันยุงลายและกำจัดแหล่งเพาะพันธุ์อย่างไร?",
  "ยุงลายกัดช่วงเวลาใด และควรป้องกันยุงกัดอย่างไร?",
];

export function HealthAssistantChat() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState("");

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedQuestion = question.trim();
    if (!submittedQuestion || pending) return;

    setPending(true);
    setRequestError("");

    try {
      const response = await fetch("/api/health-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: submittedQuestion }),
      });

      const payload = (await response.json()) as ApiResult;
      if (!response.ok && payload.status !== "unavailable") {
        throw new Error(payload.message || "ส่งคำถามไม่สำเร็จ");
      }

      setTurns((current) => [
        ...current,
        {
          id: Date.now(),
          question: submittedQuestion,
          result: payload,
        },
      ]);
      setQuestion("");
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : "ไม่สามารถส่งคำถามได้",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="dg-chat-preview dg-assistant-shell" aria-label="ผู้ช่วยค้นหลักฐานไข้เลือดออก">
      <div className="dg-chat-head dg-assistant-head">
        <div className="dg-chat-avatar"><Bot size={22} /></div>
        <div className="dg-assistant-head-copy">
          <strong>DengueYosoku Evidence Assistant</strong>
          <span>Local RAG · Evidence-only mode</span>
        </div>
        <span className="dg-pill dg-pill-muted">ทดลองในเครื่อง</span>
      </div>

      <div className="dg-assistant-mode-note">
        <ShieldCheck size={17} />
        <span>
          ระบบค้นข้อความจากฐานความรู้ที่ผ่านตัวกรองและแสดงแหล่งต้นฉบับ
          <strong> ยังไม่มีการใช้โมเดลสร้างคำตอบทางการแพทย์</strong>
        </span>
      </div>

      <div className="dg-assistant-conversation" aria-live="polite">
        {turns.length === 0 ? (
          <div className="dg-assistant-welcome">
            <div className="dg-chat-avatar"><Sparkles size={20} /></div>
            <div>
              <strong>เริ่มค้นหาความรู้เรื่องไข้เลือดออก</strong>
              <p>
                พิมพ์คำถามเกี่ยวกับอาการเตือนหรือการป้องกัน
                ระบบจะแสดงข้อความหลักฐานและลิงก์ไปยังเอกสารต้นฉบับ
              </p>
            </div>
          </div>
        ) : (
          turns.map((turn) => (
            <div className="dg-assistant-turn" key={turn.id}>
              <div className="dg-assistant-user-question">{turn.question}</div>
              <div className={"dg-assistant-response " + turn.result.status}>
                <div className="dg-assistant-response-title">
                  {turn.result.status === "emergency" ? <AlertTriangle size={17} /> : <BookOpen size={17} />}
                  <strong>
                    {turn.result.status === "emergency"
                      ? "ข้อความแจ้งเตือนเร่งด่วน"
                      : turn.result.status === "blocked"
                        ? "คำถามถูกจำกัดเพื่อความปลอดภัย"
                        : turn.result.status === "no_evidence"
                          ? "ไม่พบหลักฐานที่เหมาะสม"
                          : turn.result.status === "unavailable"
                            ? "ระบบค้นคืนยังไม่พร้อม"
                            : "หลักฐานจากฐานความรู้"}
                  </strong>
                </div>
                <p>{turn.result.message}</p>
                {turn.result.evidence && turn.result.evidence.length > 0 && (
                  <div className="dg-evidence-list">
                    {turn.result.evidence.map((item) => (
                      <article className="dg-evidence-card" key={item.rank + item.url}>
                        <div className="dg-evidence-meta">
                          <div>
                            <strong>{item.source}</strong>
                            <small>{item.authority} · {item.page} · {item.language}</small>
                          </div>
                          <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={"เปิดแหล่งข้อมูล " + item.source}>
                            เปิดต้นฉบับ <ArrowUpRight size={13} />
                          </a>
                        </div>
                        <p>{item.excerpt}</p>
                      </article>
                    ))}
                  </div>
                )}
                {turn.result.disclaimer && <small className="dg-assistant-disclaimer">{turn.result.disclaimer}</small>}
              </div>
            </div>
          ))
        )}
        {pending && (
          <div className="dg-assistant-loading" role="status">
            <LoaderCircle size={17} className="dg-spin" /> กำลังค้นหลักฐานจากฐานความรู้ในเครื่อง...
          </div>
        )}
      </div>

      {requestError && <div className="dg-assistant-error" role="alert">{requestError}</div>}

      <form className="dg-assistant-form" onSubmit={submitQuestion}>
        <label htmlFor="health-assistant-question">คำถามของคุณ</label>
        <textarea
          id="health-assistant-question"
          className="dg-assistant-textarea"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="เช่น อาการเตือนที่ควรไปโรงพยาบาลมีอะไรบ้าง?"
          maxLength={600}
          rows={3}
          disabled={pending}
        />
        <div className="dg-assistant-form-footer">
          <small>{question.length}/600 ตัวอักษร · ไม่บันทึกประวัติการสนทนา</small>
          <button type="submit" className="dg-assistant-send" disabled={pending || !question.trim()}>
            {pending ? <LoaderCircle size={16} className="dg-spin" /> : <Send size={16} />}
            ส่งคำถาม
          </button>
        </div>
      </form>

      <div className="dg-assistant-suggestions">
        <span>ตัวอย่างคำถาม</span>
        <div>
          {SUGGESTIONS.map((suggestion) => (
            <button
              type="button"
              className="dg-chip"
              key={suggestion}
              disabled={pending}
              onClick={() => setQuestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
