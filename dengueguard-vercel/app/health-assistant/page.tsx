import { AlertTriangle, ArrowUpRight, BookOpen, Bot, PauseCircle } from "lucide-react";
import { HealthAssistantMoreTools } from "@/components/HealthAssistantMoreTools";

export default function HealthAssistantPage() {
  return (
    <div className="dg-page health-assistant-page">
      <header className="ha-page-heading">
        <div className="ha-page-heading-icon"><Bot size={58} strokeWidth={1.35} /></div>
        <div className="ha-page-heading-copy">
          <span className="dg-eyebrow">DENGUE KNOWLEDGE ASSISTANT</span>
          <h1>คลังความรู้และหลักฐานไข้เลือดออก</h1>
          <p>ค้นคืนเอกสารอ้างอิงและตรวจสอบที่มาของข้อมูล โดยยังไม่เปิดการสร้างคำตอบด้วย AI</p>
        </div>
        <span className="dg-pill dg-pill-muted">AI พักการพัฒนา</span>
      </header>

      <section className="ha-paused-card" role="status" aria-labelledby="ha-paused-title">
        <div className="ha-paused-icon"><PauseCircle size={58} strokeWidth={1.35} /></div>
        <div className="ha-paused-copy">
          <span className="dg-eyebrow">AI ANSWER GENERATION · PAUSED</span>
          <h2 id="ha-paused-title">พักการสร้างคำตอบด้วย AI ชั่วคราว</h2>
          <p>
            ส่วนสนทนา AI ถูกปิดไว้ก่อนเพื่อรอการทบทวนด้านข้อมูล แหล่งอ้างอิง ความเป็นส่วนตัว
            และการเข้าถึงผู้ให้บริการ โมดูลอื่นของเว็บไซต์ยังทำงานแยกจากส่วนนี้ได้ตามปกติ
          </p>
          <div className="ha-paused-tags">
            <span><PauseCircle size={14} /> ไม่เรียก AI Gateway</span>
            <span><BookOpen size={14} /> ค้นคืนหลักฐานได้</span>
          </div>
        </div>
      </section>

      <HealthAssistantMoreTools />

      <section className="ha-safety-note">
        <AlertTriangle size={18} />
        <div>
          <strong>ใช้เพื่อความรู้ทั่วไปเท่านั้น</strong>
          <p>
            คลังความรู้ยังอยู่ระหว่างการทบทวนโดยผู้เชี่ยวชาญ ไม่วินิจฉัยโรค ไม่แปลผลตรวจเฉพาะบุคคล
            และไม่ใช้แทนบุคลากรทางการแพทย์ หากมีปวดท้องรุนแรง อาเจียนต่อเนื่อง เลือดออก ซึม
            หรือหายใจลำบาก ให้ไปสถานพยาบาลทันที
          </p>
          <div className="ha-safety-links">
            <a className="dg-source-link" href="https://www.who.int/publications/i/item/9789240111110" target="_blank" rel="noopener noreferrer">
              WHO Clinical Management Guideline 2025 <ArrowUpRight size={13} />
            </a>
            <a className="dg-source-link" href="https://www.cdc.gov/dengue/hcp/clinical-care/" target="_blank" rel="noopener noreferrer">
              CDC Clinical Care of Dengue <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
