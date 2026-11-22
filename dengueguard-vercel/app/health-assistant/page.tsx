import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { HealthAssistantChat } from "@/components/HealthAssistantChat";

const topics = [
  {
    icon: BookOpen,
    title: "ความรู้เกี่ยวกับโรค",
    desc: "ค้นข้อมูลทั่วไปเกี่ยวกับเชื้อไวรัสเดงกี การติดต่อ พาหะ และอาการจากเอกสารอ้างอิง",
  },
  {
    icon: ShieldCheck,
    title: "การป้องกันโรค",
    desc: "ค้นแนวทางลดแหล่งเพาะพันธุ์ยุงและป้องกันยุงกัดจากแหล่งข้อมูลที่ผ่านตัวกรอง",
  },
  {
    icon: AlertTriangle,
    title: "สัญญาณเตือน",
    desc: "ค้นหลักฐานเกี่ยวกับอาการเตือนและข้อความให้ไปโรงพยาบาลเมื่อมีอาการรุนแรง",
  },
];

const prompts = [
  "อาการเตือนของไข้เลือดออกที่ควรไปโรงพยาบาล",
  "การกำจัดแหล่งเพาะพันธุ์ยุงลาย",
  "วิธีป้องกันยุงกัดในเวลากลางวัน",
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
              ผู้ช่วยค้นหลักฐานด้านไข้เลือดออก เชื่อมต่อฐานความรู้ RAG บนเครื่องสำหรับการพัฒนา
              โดยแสดงข้อความจากเอกสารและแหล่งอ้างอิงให้ตรวจสอบได้
            </p>
            <div className="dg-pill dg-pill-muted" style={{ marginTop: 17 }}>
              <span className="status-dot" style={{ background: "#b58b3b" }} />
              Local RAG · Evidence-only preview
            </div>
          </div>
          <div className="dg-hero-art"><Sparkles size={86} strokeWidth={1.15} /></div>
        </div>
      </section>

      <HealthAssistantChat />

      <section className="dg-page">
        <div className="dg-section-head">
          <div>
            <h2>ขอบเขตการค้นหาที่เปิดในโหมดนี้</h2>
            <p>เริ่มจากหัวข้อที่มีหลักฐานผ่าน Public Retrieval Policy แล้ว</p>
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
            <h2>หัวข้อที่ค้นต่อได้</h2>
            <p>เปิดคลังความรู้เพื่ออ่านบทความและเอกสารประกอบ</p>
          </div>
        </div>
        <div className="dg-prompt-list">
          {prompts.map((prompt) => (
            <Link className="dg-prompt-link" href="/knowledge" key={prompt}>
              {prompt} <ArrowUpRight size={13} />
            </Link>
          ))}
        </div>
      </section>

      <section className="dg-note">
        <AlertTriangle size={18} />
        <div>
          <strong>ข้อจำกัดด้านความปลอดภัย</strong>
          โหมดนี้แสดงหลักฐานจากเอกสารที่ผ่านตัวกรอง ไม่ได้ใช้โมเดลสร้างคำแนะนำ ไม่วินิจฉัยโรค ไม่แปลผลตรวจ และไม่สั่งการรักษา
          หากมีอาการรุนแรง เช่น หายใจลำบาก หมดสติ ชัก อาเจียนเป็นเลือด มือเท้าเย็น หรือปวดท้องรุนแรง
          ให้ไปห้องฉุกเฉินหรือขอความช่วยเหลือทางการแพทย์ฉุกเฉินในพื้นที่ทันที
          <div style={{ marginTop: 8 }}>
            <a className="dg-source-link" href="https://www.who.int/en/news-room/fact-sheets/detail/dengue-and-severe-dengue" target="_blank" rel="noreferrer">
              อ่านคำแนะนำจาก WHO <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      </section>
      <div className="dg-source-meta">
        <ShieldCheck size={13} />
        ขณะนี้เชื่อมต่อเฉพาะ Local RAG สำหรับการพัฒนา การเปิดใช้บน Production ต้องมี RAG service ที่โฮสต์แยกและผ่านการตรวจสอบความปลอดภัยก่อน
      </div>
    </div>
  );
}
