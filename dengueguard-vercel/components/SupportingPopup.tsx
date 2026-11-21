"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, Info, MapPinned, X } from "lucide-react";
import Link from "next/link";
import { useDengueData } from "@/components/DataProvider";
import { getCurrentEpiWeekStart } from "@/lib/utils";

const STORAGE_KEY = "DengueYosoku-next-week-forecast-popup-v2";
const EXPECTED_PROVINCES = 77;

function addSevenDays(value: string) {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

function formatWeek(value?: string | null) {
  if (!value) return "ไม่มีข้อมูล";
  return new Date(value + "T00:00:00+07:00").toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function SupportingPopup() {
  const { data, loading } = useDengueData();
  const [open, setOpen] = useState(false);
  const [checkedSession, setCheckedSession] = useState(false);

  const currentWeek = getCurrentEpiWeekStart();
  const nextWeek = addSevenDays(currentWeek);
  const model = data?.modelPredictions ?? null;

  const forecastRows = useMemo(
    () => model?.forecast.filter((row) => row.week_start === nextWeek) ?? [],
    [model, nextWeek],
  );
  const forecastComplete =
    forecastRows.length === EXPECTED_PROVINCES &&
    new Set(forecastRows.map((row) => row.province)).size === EXPECTED_PROVINCES;
  const forecastTotal = forecastComplete
    ? forecastRows.reduce((total, row) => total + row.prediction, 0)
    : null;
  const topProvinces = forecastComplete
    ? [...forecastRows].sort((a, b) => b.prediction - a.prediction).slice(0, 5)
    : [];

  useEffect(() => {
    if (loading || checkedSession) return;
    try {
      setOpen(window.sessionStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setOpen(true);
    }
    setCheckedSession(true);
  }, [loading, checkedSession]);

  function dismiss() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // The dialog can still be closed when browser storage is unavailable.
    }
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

  if (loading) return null;

  return (
    <>
      <button
        type="button"
        className="floating-info-button"
        onClick={() => setOpen(true)}
        aria-label="ดูพยากรณ์ไข้เลือดออกสัปดาห์หน้า"
      >
        <Info size={17} />
        <span>พยากรณ์สัปดาห์หน้า</span>
      </button>

      {open && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) dismiss();
          }}
        >
          <section className="support-modal" role="dialog" aria-modal="true" aria-labelledby="support-modal-title">
            <div className="modal-topline">
              <div className="brand-mark small-mark">DY</div>
              <div className="modal-heading">
                <span className="eyebrow">DENGUEYOSOKU · 77 PROVINCES</span>
                <h2 id="support-modal-title">รายงานพยากรณ์ไข้เลือดออกสัปดาห์หน้า</h2>
                <p>สัปดาห์เป้าหมาย {formatWeek(nextWeek)} · ทั่วประเทศ 77 จังหวัด</p>
              </div>
              <button type="button" className="icon-button modal-close" onClick={dismiss} aria-label="ปิดหน้าต่าง">
                <X size={20} />
              </button>
            </div>

            {forecastComplete ? (
              <>
                <div className="support-metric-grid">
                  <article className="support-metric support-metric-primary">
                    <div className="metric-icon blue"><MapPinned size={18} /></div>
                    <span>ผู้ป่วยที่โมเดลคาดการณ์รวม</span>
                    <strong>{forecastTotal?.toLocaleString("th-TH", { maximumFractionDigits: 1 })} ราย</strong>
                    <small>ผลรวมค่าพยากรณ์ 77 จังหวัด · ไม่ใช่ยอดผู้ป่วยจริง</small>
                  </article>
                  <article className="support-metric">
                    <div className="metric-icon aqua"><Clock3 size={18} /></div>
                    <span>ความครอบคลุมของผลพยากรณ์</span>
                    <strong>77 / 77 จังหวัด</strong>
                    <small>ตรงกับสัปดาห์เป้าหมายครบทุกจังหวัด</small>
                  </article>
                </div>

                <div className="support-trend-panel support-top-provinces">
                  <div>
                    <span className="eyebrow">TOP FORECAST VALUES</span>
                    <h3>จังหวัดที่มีค่าพยากรณ์สูงสุด</h3>
                    <p>เรียงตามค่าพยากรณ์ ไม่ใช่การจัดระดับการระบาด</p>
                  </div>
                  <ol>
                    {topProvinces.map((row) => (
                      <li key={row.province}>
                        <span>{row.province}</span>
                        <strong>{row.prediction.toLocaleString("th-TH", { maximumFractionDigits: 1 })} ราย</strong>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            ) : (
              <div className="support-empty-state" role="status">
                <div className="support-empty-icon"><Clock3 size={22} /></div>
                <strong>ยังไม่มีผลพยากรณ์ที่ตรงกับสัปดาห์หน้า</strong>
                <p>
                  ระบบต้องมี Model Snapshot ที่ระบุสัปดาห์เป้าหมาย {formatWeek(nextWeek)}
                  และมีผลครบ 77 จังหวัดก่อน จึงจะแสดงตัวเลขในรายงานนี้
                </p>
                <p className="support-latest-snapshot">
                  Snapshot ล่าสุด: {formatWeek(model?.coverage.forecast_week)} ·
                  ข้อมูลผู้ป่วยที่ใช้ฝึก/ประเมินถึง {formatWeek(model?.coverage.history_end_week)}
                </p>
                <p>จะไม่ใช้ผลพยากรณ์สัปดาห์ก่อนหรือยอดผู้ป่วยระดับประเทศมาแทนผลพยากรณ์รายจังหวัด</p>
              </div>
            )}

            {model?.release_status === "review_only" && (
              <div className="modal-footnote support-review-note">
                <Info size={15} />
                <span>
                  โมเดลรุ่นนี้ยังอยู่ในสถานะ Review-only ผลพยากรณ์ใช้ตรวจสอบและสาธิตเท่านั้น
                  ยังไม่ใช่คำเตือนการระบาดที่รับรองสำหรับการตัดสินใจสาธารณสุข
                </span>
              </div>
            )}

            <div className="modal-actions">
              <Link href="/dashboard" className="text-link" onClick={dismiss}>
                ดู Dashboard 77 จังหวัด <ArrowRight size={15} />
              </Link>
              <button type="button" className="button button-primary" onClick={dismiss}>ปิดรายงาน</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
