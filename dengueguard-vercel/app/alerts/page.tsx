"use client";

import { BellRing, Info, ShieldCheck } from "lucide-react";
import { AlertEventLifecyclePanel } from "@/components/AlertEventLifecyclePanel";
import { useDengueData } from "@/components/DataProvider";
import { ALERT_RULE_PROFILE } from "@/lib/alerting/profile";
import type { AlertCandidateEvent } from "@/lib/alerting/types";

const EMPTY_CANDIDATES: AlertCandidateEvent[] = [];

export default function AlertCenterPage() {
  const { data, loading, error } = useDengueData();
  const model = data?.modelPredictions ?? null;

  return (
    <div className="page-stack">
      <section className="page-heading-row">
        <div>
          <div className="eyebrow">ALERT EVENT MANAGEMENT · DRY-RUN</div>
          <h1>ศูนย์จัดการเหตุการณ์แจ้งเตือน</h1>
          <p>รวม Candidate events สำหรับการทบทวน ติดตามสถานะ และตรวจสอบประวัติการเปลี่ยนแปลง</p>
        </div>
        <div className="heading-icon-card"><BellRing size={26} /><span>ALERT CENTER</span></div>
      </section>

      <div className="inline-callout warning">
        <Info size={17} />
        <span>
          <strong>โหมดจำลองเท่านั้น · ยังไม่ใช่ระบบแจ้งเตือนการระบาดจริง</strong>
          <br />
          ระบบจะแสดงเฉพาะ Candidate ที่ผ่านกฎประเมินที่ได้รับอนุมัติเท่านั้น ขณะนี้ Rule Profile ยังเป็น
          {` ${ALERT_RULE_PROFILE.status === "draft" ? "Draft" : "Approved"} `}
          และยังไม่มีการเปิดส่ง LINE, Email, SMS หรือช่องทางภายนอก
        </span>
      </div>

      <section className="metric-grid metric-grid-three">
        <article className="metric-card">
          <div className="metric-card-top"><span>Rule Profile</span><span className="metric-icon blue">R</span></div>
          <strong>{ALERT_RULE_PROFILE.version}</strong>
          <small>{ALERT_RULE_PROFILE.status === "draft" ? "ยังไม่ผ่านการรับรอง" : "สถานะอนุมัติ"}</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>ข้อมูลโมเดล</span><span className="metric-icon aqua">77</span></div>
          <strong>{loading ? "กำลังโหลด" : model ? `${model.province_count}/77 จังหวัด` : "ไม่มีข้อมูล"}</strong>
          <small>{model ? "สัปดาห์เป้าหมาย " + model.coverage.forecast_week : error ?? "ยังไม่มีโมเดลระดับประเทศ"}</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>การส่งข้อความภายนอก</span><span className="metric-icon green"><ShieldCheck size={15} /></span></div>
          <strong>ปิดใช้งาน</strong>
          <small>ปิดไว้ทั้งใน Rule Profile และ Dry-run Engine</small>
        </article>
      </section>

      <section className="panel alert-performance-panel">
        <div className="panel-heading">
          <div><h2>การจัดการและติดตามเหตุการณ์</h2><p>ค้นหาและกรองตามจังหวัด ระดับสัญญาณ และสถานะของเหตุการณ์</p></div>
          <BellRing size={20} />
        </div>
        <AlertEventLifecyclePanel candidates={EMPTY_CANDIDATES} modelRevision={null} />
      </section>

      <p className="disclaimer-line"><Info size={15} /> ประวัติเหตุการณ์เก็บเฉพาะในเบราว์เซอร์นี้ ไม่ใช่ฐานข้อมูลกลางหรือหลักฐานยืนยันสถานการณ์ระบาด การปิดเหตุการณ์ต้องผ่านการรับทราบและมีเหตุผลประกอบ และระบบจะไม่ปิดเหตุการณ์อัตโนมัติ</p>
    </div>
  );
}
