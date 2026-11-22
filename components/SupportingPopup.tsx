"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Users, CloudRain, Thermometer, TrendingUp, TrendingDown, Minus, Info, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useDengueData } from "@/components/DataProvider";
import { formatCases, formatNumber, getCurrentEpiWeekStart, getRegionalSummary } from "@/lib/utils";

const STORAGE_KEY = "DengueYosoku-supporting-popup-dismissed-v1";

export function SupportingPopup() {
  const { data, loading } = useDengueData();
  const [open, setOpen] = useState(false);
  const [checkedSession, setCheckedSession] = useState(false);

  const latestWeek = useMemo(() => {
    if (!data?.predictions.length) return null;
    return [...new Set(data.predictions.map((row) => row.target_week_start))].sort().at(-1) ?? null;
  }, [data]);

  const summary = useMemo(() => {
    if (!data || !latestWeek) return null;
    return getRegionalSummary(data.predictions, data.weather, latestWeek);
  }, [data, latestWeek]);

  useEffect(() => {
    if (loading || checkedSession) return;
    const dismissed = window.sessionStorage.getItem(STORAGE_KEY) === "1";
    setOpen(!dismissed);
    setCheckedSession(true);
  }, [loading, checkedSession]);

  function dismiss() {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // dismiss is intentionally local to this modal lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isCurrentModelSnapshot = data?.modelPredictions?.coverage.forecast_week === getCurrentEpiWeekStart();
  if (!summary || !data || isCurrentModelSnapshot) return null;

  const weekLabel = new Date(`${summary.week}T00:00:00`).toLocaleDateString("th-TH", {
    day: "numeric", month: "long", year: "numeric",
  });
  const trendIcon = summary.trend === "เพิ่มขึ้น"
    ? <TrendingUp size={18} />
    : summary.trend === "ลดลง"
      ? <TrendingDown size={18} />
      : <Minus size={18} />;
  const trendClass = summary.trend === "เพิ่มขึ้น" ? "trend-up" : summary.trend === "ลดลง" ? "trend-down" : "trend-flat";
  const hasWeather = summary.rainfallAverage !== null || summary.temperatureAverage !== null;

  return (
    <>
      <button className="floating-info-button" onClick={() => setOpen(true)} aria-label="ดูข้อมูลประกอบการประเมินความเสี่ยง">
        <Info size={17} /> <span>ข้อมูลภาพรวม 8 จังหวัด</span>
      </button>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) dismiss();
        }}>
          <section className="support-modal" role="dialog" aria-modal="true" aria-labelledby="support-modal-title">
            <div className="modal-topline">
              <div className="brand-mark small-mark">DY</div>
              <div className="modal-heading">
                <span className="eyebrow">DengueYosoku · REGIONAL OVERVIEW</span>
                <h2 id="support-modal-title">สถานการณ์ความเสี่ยงโรคไข้เลือดออก</h2>
                <p>ภาพรวมพื้นที่ 8 จังหวัด · สัปดาห์เป้าหมาย {weekLabel}</p>
              </div>
              <button className="icon-button modal-close" onClick={dismiss} aria-label="ปิดหน้าต่าง">
                <X size={20} />
              </button>
            </div>

            <div className="support-metric-grid">
              <article className="support-metric">
                <div className="metric-icon blue"><Users size={18} /></div>
                <span>ผู้ป่วยที่คาดการณ์รวม</span>
                <strong>{formatCases(summary.totalPredicted)}</strong>
                <small>ราย / 8 จังหวัด</small>
              </article>
              <article className="support-metric">
                <div className="metric-icon red"><Info size={18} /></div>
                <span>จังหวัดที่เตือนระบาด</span>
                <strong>{summary.alertCount} จังหวัด</strong>
                <small>จากทั้งหมด 8 จังหวัด</small>
              </article>
              <article className="support-metric">
                <div className="metric-icon aqua"><CloudRain size={18} /></div>
                <span>ปริมาณน้ำฝนเฉลี่ย</span>
                <strong>{summary.rainfallAverage === null ? "ไม่มีข้อมูล" : `${formatNumber(summary.rainfallAverage, 1)} มม.`}</strong>
                <small>สะสม 7 วัน / จังหวัดที่มีข้อมูล</small>
              </article>
              <article className="support-metric">
                <div className="metric-icon amber"><Thermometer size={18} /></div>
                <span>อุณหภูมิเฉลี่ย</span>
                <strong>{summary.temperatureAverage === null ? "ไม่มีข้อมูล" : `${formatNumber(summary.temperatureAverage, 1)} °C`}</strong>
                <small>เฉลี่ย 7 วัน / จังหวัดที่มีข้อมูล</small>
              </article>
            </div>

            <div className="support-trend-panel">
              <div>
                <span className="eyebrow">FORECAST TREND</span>
                <h3>แนวโน้มผู้ป่วยทั้งเขตสุขภาพ</h3>
                <p>เปรียบเทียบยอดพยากรณ์รวมกับสัปดาห์เป้าหมายก่อนหน้า</p>
              </div>
              <div className={`trend-pill ${trendClass}`}>
                {trendIcon}
                <span>{summary.trend}</span>
                {summary.trendPercent !== null && <b>{summary.trendPercent > 0 ? "+" : ""}{summary.trendPercent.toFixed(1)}%</b>}
              </div>
            </div>

            <div className="modal-footnote">
              <Info size={15} />
              <span>
                {hasWeather
                  ? `สภาพอากาศเป็นข้อมูลตรวจวัดย้อนหลัง ครอบคลุม ${summary.weatherProvinceCount}/8 จังหวัด (ข้อมูลสูงสุด ${summary.weatherDays} วัน)`
                  : "ไม่พบข้อมูลสภาพอากาศในช่วงสัปดาห์เป้าหมาย จึงไม่แสดงค่าตัวอย่างแทนข้อมูลจริง"}
                {" "}ชุดข้อมูลที่แนบมีข้อมูลพยากรณ์ถึง 25 ธันวาคม 2022 จึงเป็นข้อมูลย้อนหลัง ไม่ใช่สถานการณ์ปัจจุบัน
              </span>
            </div>

            <div className="modal-actions">
              <Link href="/prevention" className="text-link" onClick={dismiss}>ดูคำแนะนำการป้องกัน <ArrowRight size={15} /></Link>
              <button className="button button-primary" onClick={dismiss}>ปิดและเข้าสู่เว็บไซต์</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
