import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  BookOpen,
  FileText,
  FlaskConical,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const topics = [
  { icon: BookOpen, title: "ความรู้เกี่ยวกับโรค", desc: "เชื้อไวรัสเดงกี การติดต่อ พาหะ และระยะของโรค" },
  { icon: FlaskConical, title: "ความรู้ด้านห้องปฏิบัติการ", desc: "ทำความเข้าใจ CBC, Platelet, Hct, NS1, IgM และ IgG" },
  { icon: ShieldCheck, title: "การป้องกันโรค", desc: "แนวทางลดแหล่งเพาะพันธุ์ยุงและป้องกันยุงกัด" },
  { icon: AlertTriangle, title: "สัญญาณเตือน", desc: "เรียนรู้สัญญาณที่ต้องได้รับการประเมินทางการแพทย์โดยเร่งด่วน" },
];

const prompts = [
  "ไข้เลือดออกมีอาการอย่างไร และมีกี่ระยะ?",
  "Platelet และ Hematocrit ใช้ติดตามอะไร?",
  "NS1, IgM และ IgG แตกต่างกันอย่างไร?",
  "มีวิธีลดแหล่งเพาะพันธุ์ยุงลายในบ้านอย่างไร?",
];

export default function HealthAssistantPage() {
  return (
    <div className="dg-page">
      <section className="dg-hero">
        <div className="dg-hero-grid">
          <div>
            <span className="dg-eyebrow"><Sparkles size={14} /> DENGUE HEALTH COMPANION</span>
            <h1>AI Health Assistant</h1>
            <p className="dg-lede">
              ผู้ช่วยให้ความรู้เฉพาะด้านไข้เลือดออก ออกแบบมาเพื่อช่วยทำความเข้าใจอาการ
              การตรวจทางห้องปฏิบัติการ การป้องกัน และแหล่งข้อมูลที่เชื่อถือได้
            </p>
            <div className="dg-pill dg-pill-muted" style={{ marginTop: 17 }}>
              <span className="status-dot" style={{ background: "#b58b3b" }} /> Prototype · กำลังเตรียมเชื่อมต่อ AI
            </div>
          </div>
          <div className="dg-hero-art"><Bot size={86} strokeWidth={1.15} /></div>
        </div>
      </section>

      <section className="dg-chat-preview">
        <div className="dg-chat-head">
          <div className="dg-chat-avatar"><Bot size={22} /></div>
          <div style={{ flex: 1 }}>
            <strong style={{ display: "block", color: "#1d3c43", fontSize: 13 }}>DengueGuard AI</strong>
            <span style={{ color: "#708783", fontSize: 10 }}>Dengue-focused health education assistant</span>
          </div>
          <span className="dg-pill dg-pill-muted">Preview</span>
        </div>
        <div className="dg-chat-message">
          <div className="dg-chat-avatar"><Bot size={19} /></div>
          <div className="dg-chat-bubble">
            สวัสดีครับ ผมกำลังอยู่ระหว่างการพัฒนาให้เป็นผู้ช่วยด้านความรู้โรคไข้เลือดออก
            โดยจะค้นคำตอบจากเอกสารอ้างอิงที่ผ่านการคัดเลือก พร้อมแสดงแหล่งที่มา
            เพื่อให้ผู้ใช้ตรวจสอบข้อมูลต่อได้
          </div>
        </div>
        <div className="dg-chat-disabled">
          <MessageCircle size={17} />
          <span>ช่องสนทนาจะเปิดเมื่อเชื่อมต่อ AI และระบบค้นคืนความรู้เรียบร้อยแล้ว</span>
          <button type="button" disabled>ยังไม่เปิดใช้งาน</button>
        </div>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div>
            <h2>ขอบเขตความสามารถที่กำลังพัฒนา</h2>
            <p>ออกแบบให้ตอบคำถามเฉพาะด้าน Dengue โดยยึดฐานความรู้ที่ตรวจสอบได้</p>
          </div>
        </div>
        <div className="dg-grid">
          {topics.map((topic) => {
            const Icon = topic.icon;
            return (
              <article className="dg-card" key={topic.title}>
                <div className="dg-card-icon"><Icon size={19} /></div>
                <h3>{topic.title}</h3>
                <p>{topic.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div>
            <h2>คำถามที่เตรียมรองรับ</h2>
            <p>ตัวอย่างหัวข้อที่ AI จะช่วยอธิบายเมื่อเปิดใช้งาน</p>
          </div>
        </div>
        <div className="dg-prompt-list">
          {prompts.map((prompt) => (
            <Link className="dg-prompt-link" href="/knowledge" key={prompt}>
              <MessageCircle size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
              {prompt}
            </Link>
          ))}
        </div>
      </section>

      <section className="dg-note">
        <AlertTriangle size={18} />
        <div>
          <strong>ข้อจำกัดด้านความปลอดภัย</strong>
          AI Assistant ในหน้านี้ยังไม่เชื่อมต่อและยังไม่ให้คำตอบทางการแพทย์ ระบบในอนาคตจะมีไว้เพื่อการศึกษาและช่วยค้นหาแหล่งข้อมูลเท่านั้น
          ไม่ใช้วินิจฉัยโรค สั่งยา หรือตัดสินใจแทนบุคลากรทางการแพทย์ หากมีอาการเตือน เช่น ปวดท้องรุนแรง อาเจียนต่อเนื่อง หายใจเร็ว เลือดออก หรือผิวซีดเย็น ควรไปโรงพยาบาลทันที
          <div style={{ marginTop: 8 }}>
            <a className="dg-source-link" href="https://www.who.int/en/news-room/fact-sheets/detail/dengue-and-severe-dengue" target="_blank" rel="noreferrer">
              อ่านคำแนะนำจาก WHO <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      </section>
      <div className="dg-source-meta"><FileText size={13} /> การเชื่อมต่อ AI จะดำเนินการหลังตรวจทานฐานความรู้และมาตรการความปลอดภัย</div>
    </div>
  );
}
