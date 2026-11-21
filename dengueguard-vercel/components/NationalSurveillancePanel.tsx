import { ArrowDownRight, CalendarDays, FileText, Info } from "lucide-react";
import { NATIONAL_DENGUE_SNAPSHOT, percentageChange } from "@/lib/national-surveillance";
const snapshot = NATIONAL_DENGUE_SNAPSHOT;
const weekChange = percentageChange(snapshot.cases, snapshot.previousWeek.cases);
const yearChange = percentageChange(snapshot.cases, snapshot.sameWeekPreviousYear.cases);
const comparisons = [
  { label: `สัปดาห์ ${snapshot.previousWeek.week}/${snapshot.previousWeek.year}`, value: snapshot.previousWeek.cases, note: "สัปดาห์ก่อนหน้า" },
  { label: `สัปดาห์ ${snapshot.week}/${snapshot.year}`, value: snapshot.cases, note: "รายงานล่าสุด", current: true },
  { label: `สัปดาห์ ${snapshot.sameWeekPreviousYear.week}/${snapshot.sameWeekPreviousYear.year}`, value: snapshot.sameWeekPreviousYear.cases, note: "ช่วงเดียวกันปีก่อน" },
];
export function NationalSurveillancePanel({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`dy-national-report${compact ? " dy-national-report--compact" : ""}`} aria-labelledby="dy-national-report-title">
      <div className="dy-national-report-heading"><div><span className="dy-product-eyebrow">NATIONAL SURVEILLANCE · WHO SEARO</span><h2 id="dy-national-report-title">สถานการณ์ไข้เลือดออกระดับประเทศ</h2><p>ข้อมูลรายงานล่าสุด · สถานการณ์ ณ 16 พฤศจิกายน 2569</p></div><span className="dy-national-source-badge"><FileText size={13} /> WHO · 18 พ.ย. 2569</span></div>
      <div className="dy-national-metrics">
        <article className="dy-national-metric dy-national-metric--primary"><span>ผู้ป่วยสงสัยรายใหม่ · สัปดาห์ 46/2569</span><strong>{snapshot.cases.toLocaleString("th-TH")} <small>ราย</small></strong><small>ช่วงรายงาน 2–15 พฤศจิกายน 2569</small></article>
        <article className="dy-national-metric"><span>เปลี่ยนแปลงจากสัปดาห์ก่อน</span><strong className="dy-national-down"><ArrowDownRight size={19} /> {weekChange === null ? "ไม่มีข้อมูล" : `${Math.abs(weekChange).toFixed(1)}%`}</strong><small>{snapshot.previousWeek.cases.toLocaleString("th-TH")} → {snapshot.cases.toLocaleString("th-TH")} ราย</small></article>
        <article className="dy-national-metric"><span>เทียบสัปดาห์เดียวกันปี 2568</span><strong className="dy-national-down"><ArrowDownRight size={19} /> {yearChange === null ? "ไม่มีข้อมูล" : `${Math.abs(yearChange).toFixed(1)}%`}</strong><small>{snapshot.sameWeekPreviousYear.cases.toLocaleString("th-TH")} → {snapshot.cases.toLocaleString("th-TH")} ราย</small></article>
        <article className="dy-national-metric"><span>ผู้เสียชีวิตรายใหม่ · สัปดาห์ 46</span><strong>{snapshot.newDeaths} <small>ราย</small></strong><small>WHO ไม่รายงานผู้เสียชีวิตรายใหม่ในสัปดาห์นี้</small></article>
      </div>
      {!compact && <div className="dy-national-comparison"><div className="dy-national-comparison-head"><div><strong>เปรียบเทียบจำนวนผู้ป่วยสงสัยรายใหม่</strong><small>3 ช่วงเวลาตามเอกสาร ไม่ใช่อนุกรมเวลาต่อเนื่อง</small></div><CalendarDays size={18} /></div><div className="dy-national-bars">{comparisons.map((item)=><div className={`dy-national-bar-row${item.current?" is-current":""}`} key={item.label}><div className="dy-national-bar-label"><strong>{item.label}</strong><small>{item.note}</small></div><div className="dy-national-bar-track" aria-label={`${item.label}: ${item.value} ราย`}><span style={{width:`${item.value/1436*100}%`}} /></div><strong className="dy-national-bar-value">{item.value.toLocaleString("th-TH")}</strong></div>)}</div></div>}
      <div className="dy-national-report-footnote"><Info size={15} /><span>ยอดผู้ป่วยสงสัยรายใหม่ระดับประเทศ ไม่ใช่ข้อมูลยืนยัน รายจังหวัด หรือผลพยากรณ์ของโมเดล ข้อมูล 8 จังหวัดเดิมและแผนที่ 77 จังหวัดแสดงแยกต่างหาก</span></div>
      <a className="dy-national-source-link" href={snapshot.source.url} target="_blank" rel="noreferrer">เปิด WHO South-East Asia Epidemiological Bulletin <FileText size={13} /></a>
    </section>
  );
}
