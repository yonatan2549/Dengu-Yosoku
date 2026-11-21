import { AlertTriangle, ArrowUpRight, Bot } from "lucide-react";
import { HealthAssistantMoreTools } from "@/components/HealthAssistantMoreTools";
import { HealthAssistantChatPanel } from "@/components/HealthAssistantChatPanel";

export default function HealthAssistantPage() {
  return (
    <div className="dg-page health-assistant-page">
      <header className="ha-page-heading">
        <div className="ha-page-heading-icon"><Bot size={25} /></div>
        <div className="ha-page-heading-copy">
          <span className="dg-eyebrow">AI HEALTH ASSISTANT</span>
          <h1>ผู้ช่วยความรู้ไข้เลือดออก</h1>
          <p>ถามเรื่องอาการ การป้องกัน และความรู้ด้านห้องปฏิบัติการ พร้อมแหล่งอ้างอิง</p>
        </div>
        <span className="dg-pill dg-pill-muted">Preview</span>
      </header>

      <HealthAssistantChatPanel />
      <HealthAssistantMoreTools />

      <section className="ha-safety-note">
        <AlertTriangle size={18} />
        <div>
          <strong>ใช้เพื่อความรู้ทั่วไปเท่านั้น</strong>
          <p>
            ระบบไม่วินิจฉัยโรค ไม่แปลผลตรวจเฉพาะบุคคล และไม่ใช้แทนบุคลากรทางการแพทย์
            หากมีปวดท้องรุนแรง อาเจียนต่อเนื่อง เลือดออก ซึม หรือหายใจลำบาก ให้ไปสถานพยาบาลทันที
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
