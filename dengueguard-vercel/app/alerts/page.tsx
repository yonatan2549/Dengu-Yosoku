"use client";

import { BellRing, Info } from "lucide-react";
import { AlertDryRunPanel } from "@/components/AlertDryRunPanel";
import { AlertReadinessPanel } from "@/components/AlertReadinessPanel";
import { AlertRuleDraftManager } from "@/components/AlertRuleDraftManager";
import { AlertExpertReviewPanel } from "@/components/AlertExpertReviewPanel";
import { useDengueData } from "@/components/DataProvider";

export default function AlertCenterPage() {
  const { data, loading, error } = useDengueData();
  const model = data?.modelPredictions ?? null;

  return (
    <div className="page-stack">
      <section className="page-heading-row">
        <div>
          <div className="eyebrow">ALERT EVENT MANAGEMENT · SERVER AUDIT</div>
          <h1>ศูนย์จัดการเหตุการณ์แจ้งเตือน</h1>
          <p>ประเมินความพร้อมของโมเดล บันทึกผลตรวจสอบ และจัดการ Event Lifecycle ผ่านฐานข้อมูลกลาง</p>
        </div>
        <div className="heading-icon-card"><BellRing size={26} /><span>ALERT CENTER</span></div>
      </section>

      <div className="inline-callout warning">
        <Info size={17} />
        <span>
          <strong>โหมด Dry-run เท่านั้น · ยังไม่ใช่ระบบแจ้งเตือนการระบาดจริง</strong>
          <br />
          สถานะ Rule Profile และ Threshold อ่านจากฐานข้อมูลกลางตามสิทธิ์ผู้ใช้
          และระบบยังปิดการส่ง LINE, Email, SMS และข้อความภายนอกทั้งหมด
        </span>
      </div>

      {loading ? <div className="loading-card"><div className="spinner" /><strong>กำลังโหลดข้อมูลโมเดล</strong></div> : null}
      {error ? <div className="global-error"><strong>โหลดข้อมูลโมเดลไม่สำเร็จ</strong><span>{error}</span></div> : null}
      <AlertReadinessPanel provinces={model?.provinces ?? []} />
      <AlertRuleDraftManager provinces={model?.provinces ?? []} />
      <AlertExpertReviewPanel />
      <AlertDryRunPanel model={model} />
    </div>
  );
}
