"use client";

import { BellRing, Info } from "lucide-react";
import { AlertDryRunPanel } from "@/components/AlertDryRunPanel";
import { AlertReadinessPanel } from "@/components/AlertReadinessPanel";
import { AlertRuleDraftManager } from "@/components/AlertRuleDraftManager";
import { AlertExpertReviewPanel } from "@/components/AlertExpertReviewPanel";
import { AlertThresholdAuditPanel } from "@/components/AlertThresholdAuditPanel";
import { useDengueData } from "@/components/DataProvider";
import { ProductHero } from "@/components/ProductHero";
import { NationalSurveillancePanel } from "@/components/NationalSurveillancePanel";

export default function AlertCenterPage() {
  const { data, loading, error } = useDengueData();
  const model = data?.modelPredictions ?? null;

  return (
    <div className="page-stack dy-alert-page">
      <ProductHero
        eyebrow="ALERT CENTER · GOVERNED WORKFLOW"
        title="ศูนย์จัดการเหตุการณ์แจ้งเตือน"
        description="ตรวจสอบความพร้อมของข้อมูลและเกณฑ์แจ้งเตือน จัดทำร่างกฎ ส่งให้ผู้เชี่ยวชาญอิสระทบทวน และทดลองประเมินในระบบภายในก่อนพิจารณาใช้งานจริง"
        status="Dry-run เท่านั้น · ยังไม่ส่งข้อความภายนอก"
        statusTone="warning"
        icon={BellRing}
        stats={[
          { label: "Model Snapshot", value: model ? "ตรวจพบ" : "ยังไม่มี", detail: "ต้องผ่าน freshness และ validation gate" },
          { label: "สถานะรับรองเกณฑ์", value: "ยังไม่อนุมัติ", detail: "ต้องมี independent epidemiological review และผู้มีอำนาจรับรอง" },
          { label: "การแจ้งเตือนภายนอก", value: "ปิดใช้งาน", detail: "ไม่มีการส่ง LINE, Email หรือ SMS" },
        ]}
      />

      <NationalSurveillancePanel compact />
      <AlertThresholdAuditPanel />

      <div className="inline-callout warning">
        <Info size={17} />
        <span>
          <strong>โหมด Dry-run เท่านั้น · ยังไม่ใช่ระบบแจ้งเตือนการระบาดจริง</strong>
          <br />
          สถานะ Rule Profile และ Threshold อ่านจากฐานข้อมูลกลางตามสิทธิ์ผู้ใช้
          การอนุมัติของเจ้าของโครงการเพียงอย่างเดียวไม่แทนการทบทวนทางระบาดวิทยาโดยผู้เชี่ยวชาญอิสระและการรับรองจากผู้มีอำนาจ
          ระบบยังปิดการส่ง LINE, Email, SMS และข้อความภายนอกทั้งหมด
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
