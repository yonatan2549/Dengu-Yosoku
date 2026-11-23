"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Clock3,
  Database,
  Info,
  MapPinned,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useDengueData } from "@/components/DataProvider";
import { formatEpiWeekLabel } from "@/lib/epi-week";
import { getCurrentEpiWeekStart } from "@/lib/utils";

const STORAGE_KEY = "DengueYosoku-model-forecast-popup-v4";
const EXPECTED_PROVINCES = 77;

function formatWeek(value?: string | null) {
  if (!value) return "ไม่มีข้อมูล";
  return new Date(value + "T00:00:00+07:00").toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "ไม่มีข้อมูล";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function SupportingPopup() {
  const { data, loading } = useDengueData();
  const [open, setOpen] = useState(false);
  const [checkedSession, setCheckedSession] = useState(false);

  const model = data?.modelPredictions ?? null;
  const forecastWeek = model?.coverage.forecast_week ?? "";
  const forecastWeekLabel = forecastWeek ? formatEpiWeekLabel(forecastWeek) : "ไม่มีสัปดาห์เป้าหมาย";
  const currentEpiWeek = getCurrentEpiWeekStart();

  const forecastRows = useMemo(
    () => model?.forecast.filter((row) => row.week_start === forecastWeek) ?? [],
    [model, forecastWeek],
  );
  const forecastComplete =
    forecastRows.length === EXPECTED_PROVINCES &&
    new Set(forecastRows.map((row) => row.province)).size === EXPECTED_PROVINCES;
  const forecastTotal = forecastComplete
    ? forecastRows.reduce((total, row) => total + row.prediction, 0)
    : null;
  const forecastAverage = forecastComplete && forecastTotal !== null
    ? forecastTotal / EXPECTED_PROVINCES
    : null;
  const topProvinces = useMemo(
    () => forecastComplete
      ? [...forecastRows].sort((a, b) => b.prediction - a.prediction).slice(0, 5)
      : [],
    [forecastComplete, forecastRows],
  );
  const maxTopPrediction = topProvinces[0]?.prediction ?? 0;
  const isStale = Boolean(forecastWeek && forecastWeek < currentEpiWeek);
  const hasActualForTargetWeek = Boolean(
    model?.history.some((row) => row.week_start === forecastWeek),
  );

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
        aria-label="ดูรายงานพยากรณ์ไข้เลือดออก"
      >
        <BarChart3 size={17} />
        <span>{forecastWeek ? `รายงานพยากรณ์ · ${forecastWeekLabel}` : "รายงานพยากรณ์ล่าสุด"}</span>
      </button>

      {open && (
        <div
          className="modal-backdrop support-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) dismiss();
          }}
        >
          <section className="support-modal support-modal--forecast" role="dialog" aria-modal="true" aria-labelledby="support-modal-title">
            <header className="support-modal-hero">
              <div className="support-modal-brand">
                <div className="brand-mark small-mark">DY</div>
                <div>
                  <span className="eyebrow">DENGUEYOSOKU · NATIONAL FORECAST</span>
                  <h2 id="support-modal-title">รายงานพยากรณ์ไข้เลือดออก</h2>
                  <p>ภาพรวมผลพยากรณ์จากโมเดลสำหรับ 77 จังหวัด</p>
                </div>
              </div>
              <button type="button" className="icon-button modal-close" onClick={dismiss} aria-label="ปิดหน้าต่างรายงาน">
                <X size={20} />
              </button>
            </header>

            <div className="support-modal-meta">
              <span><CalendarDays size={14} /> สัปดาห์เป้าหมาย {forecastWeekLabel}</span>
              <span><MapPinned size={14} /> ขอบเขต 77 จังหวัด</span>
              <span className={model?.release_status === "approved" ? "support-status-chip support-status-chip--ready" : "support-status-chip"}>
                <ShieldAlert size={14} /> {model?.release_status === "approved" ? "Approved" : "Review-only"}
              </span>
            </div>

            {forecastComplete ? (
              <>
                <div className="support-forecast-kpis">
                  <article className="support-forecast-kpi support-forecast-kpi--primary">
                    <span className="support-forecast-kpi-icon"><MapPinned size={19} /></span>
                    <div>
                      <small>ผลรวมค่าพยากรณ์ 77 จังหวัด</small>
                      <strong>{forecastTotal?.toLocaleString("th-TH", { maximumFractionDigits: 1 })} <em>ราย</em></strong>
                      <p>เป็นค่าที่โมเดลคาดการณ์ ไม่ใช่ยอดผู้ป่วยจริง</p>
                    </div>
                  </article>
                  <article className="support-forecast-kpi">
                    <span className="support-forecast-kpi-icon"><BarChart3 size={19} /></span>
                    <div>
                      <small>ค่าเฉลี่ยต่อจังหวัด</small>
                      <strong>{forecastAverage?.toLocaleString("th-TH", { maximumFractionDigits: 1 })} <em>ราย</em></strong>
                      <p>ค่าเฉลี่ยเลขคณิตของค่าพยากรณ์</p>
                    </div>
                  </article>
                  <article className="support-forecast-kpi">
                    <span className="support-forecast-kpi-icon"><Database size={19} /></span>
                    <div>
                      <small>ความครอบคลุมของ Snapshot</small>
                      <strong>77 / 77 <em>จังหวัด</em></strong>
                      <p>มีค่าพยากรณ์ครบตามรายชื่อจังหวัด</p>
                    </div>
                  </article>
                </div>

                <section className="support-ranking">
                  <div className="support-ranking-heading">
                    <div>
                      <span className="eyebrow">HIGHEST FORECAST VALUES</span>
                      <h3>จังหวัดที่มีค่าพยากรณ์สูงสุด 5 อันดับ</h3>
                      <p>เรียงตามค่าพยากรณ์เพื่อดูภาพรวม ไม่ใช่การจัดอันดับความเสี่ยงการระบาด</p>
                    </div>
                    <span className="support-ranking-count">TOP 5</span>
                  </div>
                  <ol>
                    {topProvinces.map((row, index) => {
                      const width = maxTopPrediction > 0 ? Math.max(4, (row.prediction / maxTopPrediction) * 100) : 0;
                      return (
                        <li key={row.province}>
                          <span className="support-ranking-number">{String(index + 1).padStart(2, "0")}</span>
                          <div className="support-ranking-data">
                            <div><strong>{row.province}</strong><b>{row.prediction.toLocaleString("th-TH", { maximumFractionDigits: 1 })} ราย</b></div>
                            <span className="support-ranking-track"><i style={{ width: `${width}%` }} /></span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>

                <div className={isStale ? "support-forecast-notice support-forecast-notice--warning" : "support-forecast-notice"}>
                  <Info size={18} />
                  <div>
                    <strong>{isStale ? "Snapshot นี้เก่ากว่าสัปดาห์ปัจจุบัน" : "โปรดแยกผลพยากรณ์ออกจากข้อมูลผู้ป่วยจริง"}</strong>
                    <p>
                      เป้าหมาย {formatWeek(forecastWeek)} · ข้อมูลผู้ป่วยจริงย้อนหลังถึง {formatWeek(model?.coverage.history_end_week)}.
                      {hasActualForTargetWeek
                        ? " พบข้อมูล actual ในประวัติของสัปดาห์เป้าหมาย โปรดตรวจสอบแหล่งที่มาก่อนนำไปใช้"
                        : " ยังไม่มีข้อมูลผู้ป่วยจริงรายจังหวัดสำหรับสัปดาห์เป้าหมายใน Snapshot นี้"}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="support-empty-state support-empty-state--polished" role="status">
                <div className="support-empty-icon"><Clock3 size={26} /></div>
                <strong>ยังไม่มีผลพยากรณ์ที่ครบถ้วนสำหรับ 77 จังหวัด</strong>
                <p>ระบบจะไม่เติมค่าที่ขาดหาย หรือใช้ข้อมูลจากสัปดาห์ก่อนมาแทนผลพยากรณ์ของสัปดาห์เป้าหมาย</p>
                <div className="support-empty-details">
                  <span>จังหวัดที่มีผลพยากรณ์ <b>{forecastRows.length}/77</b></span>
                  <span>สัปดาห์เป้าหมาย <b>{forecastWeek ? formatWeek(forecastWeek) : "ไม่มีข้อมูล"}</b></span>
                </div>
              </div>
            )}

            <section className="support-provenance">
              <div><Clock3 size={15} /><span>สร้าง Snapshot <strong>{formatDateTime(model?.generated_at_utc)}</strong></span></div>
              <div><Database size={15} /><span>ข้อมูลย้อนหลังถึง <strong>{formatWeek(model?.coverage.history_end_week)}</strong></span></div>
              <div><ShieldAlert size={15} /><span>Model revision <strong>{model?.model_revision ? model.model_revision.slice(0, 12) : "ไม่มีข้อมูล"}</strong></span></div>
            </section>

            {model?.release_status !== "approved" && (
              <div className="modal-footnote support-review-note">
                <Info size={16} />
                <span>
                  โมเดลรุ่นนี้ยังไม่ผ่านการอนุมัติสำหรับการใช้งานปฏิบัติการ ผลลัพธ์เป็นข้อมูลประกอบการพัฒนาและสาธิตเท่านั้น
                  ไม่ใช่คำเตือนการระบาดที่รับรองสำหรับการตัดสินใจด้านสาธารณสุข
                </span>
              </div>
            )}

            <footer className="modal-actions support-modal-actions">
              <Link href="/dashboard" className="text-link" onClick={dismiss}>
                ดู Dashboard และรายละเอียดเพิ่มเติม <ArrowRight size={15} />
              </Link>
              <button type="button" className="button button-primary" onClick={dismiss}>ปิดรายงาน</button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
