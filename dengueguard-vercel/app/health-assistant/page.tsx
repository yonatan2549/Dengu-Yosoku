import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Bot, BookOpen, ShieldCheck, Sparkles } from "lucide-react";
import { HealthAssistantKnowledgePanel } from "@/components/HealthAssistantKnowledgePanel";
import { HealthAssistantChatPanel } from "@/components/HealthAssistantChatPanel";
import { HealthAssistantGovernancePanel } from "@/components/HealthAssistantGovernancePanel";

const topics = [
  { title: "ความรู้เกี่ยวกับโรค", desc: "เชื้อไวรัสเดงกี การติดต่อ พาหะ และระยะของโรค" },
  { title: "ความรู้ด้านห้องปฏิบัติการ", desc: "ทำความเข้าใจ CBC, Platelet, Hct, NS1, IgM และ IgG" },
  { title: "การป้องกันโรค", desc: "แนวทางลดแหล่งเพาะพันธุ์ยุงและป้องกันยุงกัด" },
  { title: "สัญญาณเตือน", desc: "เรียนรู้สัญญาณที่ต้องได้รับการประเมินทางการแพทย์โดยเร่งด่วน" },
];

export default function HealthAssistantPage() {
  return (
    <div className="dg-page">
      <section className="dg-hero">
        <div className="dg-hero-grid">
          <div>
            <span className="dg-eyebrow"><Sparkles size={14} /> DENGUE HEALTH COMPANION</span>
            <h1>AI Health Assistant</h1>
            <p className="dg-lede">ผู้ช่วยค้นหาความรู้เฉพาะด้านไข้เลือดออก โดยเริ่มจากเอกสารอ้างอิงที่เชื่อถือได้ แสดงที่มา และระบุข้อจำกัดของเนื้อหาอย่างชัดเจน</p>
            <div className="dg-pill dg-pill-muted" style={{ marginTop: 17 }}>
              <span className="status-dot" style={{ background: "#b58b3b" }} /> HA-4 · Local SQLite RAG Preview · Evidence only
            </div>
          </div>
          <div className="dg-hero-art"><Bot size={86} strokeWidth={1.15} /></div>
        </div>
      </section>

      <HealthAssistantKnowledgePanel />

      <HealthAssistantGovernancePanel />

      <HealthAssistantChatPanel />

      <section className="dg-page">
        <div className="dg-section-head"><div><h2>ขอบเขตความรู้</h2><p>หัวข้อเริ่มต้นของคลังความรู้ DengueYosoku</p></div><Link href="/knowledge" className="dg-card-link">Dengue Knowledge Hub <ArrowUpRight size={14} /></Link></div>
        <div className="dg-grid">
          {topics.map((topic) => <article className="dg-card" key={topic.title}><div className="dg-card-icon"><BookOpen size={19} /></div><h3>{topic.title}</h3><p>{topic.desc}</p></article>)}
        </div>
      </section>

      <section className="dg-note">
        <AlertTriangle size={18} />
        <div>
          <strong>ข้อจำกัดด้านความปลอดภัย</strong>
          ระบบนี้ให้บริการค้นคืนเอกสารเพื่อการศึกษาเท่านั้น ไม่วินิจฉัยโรค ไม่คำนวณความเสี่ยงรายบุคคล ไม่สั่งยา และไม่แทนคำแนะนำจากบุคลากรทางการแพทย์ หากมีสัญญาณเตือน เช่น ปวดท้องรุนแรง อาเจียนต่อเนื่อง เลือดออก ซึมหรือกระสับกระส่าย หรือหายใจลำบาก ให้ไปสถานพยาบาลโดยเร่งด่วน
          <div style={{ marginTop: 8 }}><a className="dg-source-link" href="https://www.who.int/publications/i/item/9789240111110" target="_blank" rel="noopener noreferrer">WHO Clinical Management Guideline 2025 <ArrowUpRight size={13} /></a></div>
          <div style={{ marginTop: 6 }}><a className="dg-source-link" href="https://www.cdc.gov/dengue/hcp/clinical-care/" target="_blank" rel="noopener noreferrer">CDC Clinical Care of Dengue <ArrowUpRight size={13} /></a></div>
        </div>
      </section>
      <div className="dg-source-meta"><ShieldCheck size={13} /> เอกสารในคลังรุ่นนี้ยังรอผู้เชี่ยวชาญทบทวนก่อนเปิดใช้เป็นคำตอบทางคลินิก</div>
    </div>
  );
}
