"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BellRing, ChevronLeft, ChevronRight, Info, Search, ShieldCheck, Wind } from "lucide-react";
import { useDengueData } from "@/components/DataProvider";
import { ProductHero } from "@/components/ProductHero";
import { NationalSurveillancePanel } from "@/components/NationalSurveillancePanel";
import { AlertDryRunPanel } from "@/components/AlertDryRunPanel";
import { ModelValidationPanel } from "@/components/ModelValidationPanel";
import { compareProvinceWeek, formatCases, formatNumber, getCurrentEpiWeekStart, getEpiWeekLagWeeks, getCurrentRows, getRegionalSummary, getUniqueYears, getWeeksForYear, normalizeProvince } from "@/lib/utils";
import { resolvePreventionDatasetView, type DashboardDatasetPreference } from "@/lib/dashboard-view";

function RiskPill({ level }: { level: string }) {
  const cls = level === "เตือนระบาด" ? "risk-high" : level === "เฝ้าระวัง" ? "risk-watch" : "risk-normal";
  return <span className={`risk-pill ${cls}`}><span />{level}</span>;
}

const preventionChecklistTasks = [
  { id: "home", title: "เก็บบ้าน", detail: "จัดบ้านให้สะอาด โปร่ง และลดจุดที่ยุงลายเกาะพัก" },
  { id: "waste", title: "เก็บขยะ", detail: "เก็บภาชนะเหลือใช้ กระป๋อง ยางรถ และสิ่งที่อาจขังน้ำ" },
  { id: "water", title: "เก็บน้ำ", detail: "ปิดฝาภาชนะเก็บน้ำ เทน้ำขัง และขัดล้างภาชนะก่อนเติมน้ำใหม่" },
  { id: "bite", title: "ป้องกันยุงกัด", detail: "ใช้มุ้งลวด มุ้ง เสื้อผ้าปกปิด และผลิตภัณฑ์ไล่ยุงตามฉลาก" },
  { id: "patient", title: "ป้องกันยุงกัดผู้ป่วย", detail: "เมื่อมีผู้ป่วยสงสัยไข้เลือดออก ให้ป้องกันไม่ให้ยุงกัดผู้ป่วยและทำตามคำแนะนำสถานพยาบาล" },
];

function WeeklyPreventionChecklist() {
  const [completed, setCompleted] = useState<string[]>([]);
  const progress = Math.round((completed.length / preventionChecklistTasks.length) * 100);
  return (
    <section className="panel dy-prevention-checklist" aria-labelledby="dy-prevention-checklist-title">
      <div className="dy-checklist-heading">
        <div>
          <span className="dy-product-eyebrow">WEEKLY HOUSEHOLD ACTION PLAN</span>
          <h2 id="dy-prevention-checklist-title">เช็กลิสต์ป้องกันยุงลายประจำสัปดาห์</h2>
          <p>ทำซ้ำทุกสัปดาห์ โดยเน้นมาตรการ 3 เก็บ และการป้องกันยุงกัด</p>
        </div>
        <div className="dy-checklist-progress"><strong>{completed.length}/{preventionChecklistTasks.length}</strong><small>ทำแล้ว</small></div>
      </div>
      <div className="dy-checklist-progress-track" role="progressbar" aria-label="ความคืบหน้าการป้องกันประจำสัปดาห์" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="dy-checklist-grid">
        {preventionChecklistTasks.map((task) => (
          <label className={`dy-check-task${completed.includes(task.id) ? " is-done" : ""}`} key={task.id}>
            <input type="checkbox" checked={completed.includes(task.id)}
              onChange={(event) => setCompleted((current) => event.target.checked
                ? [...current, task.id]
                : current.filter((item) => item !== task.id))}
            />
            <span className="dy-check-task-copy"><strong>{task.title}</strong><small>{task.detail}</small></span>
          </label>
        ))}
      </div>
      <div className="dy-checklist-footer">
        <span>{progress === 100 ? "ทำครบทุกข้อแล้ว · ตรวจซ้ำอีกครั้งในสัปดาห์หน้า" : "ติ๊กเมื่อทำกิจกรรมในพื้นที่จริงแล้วเท่านั้น"}</span>
        <button type="button" className="button button-secondary" onClick={() => setCompleted([])} disabled={completed.length === 0}>เริ่มเช็กลิสต์ใหม่</button>
      </div>
    </section>
  );
}

function LegacyPreventionPage() {
  const { data } = useDengueData();
  const [selectedProvince, setSelectedProvince] = useState("");
  const years = useMemo(() => data ? getUniqueYears(data.predictions) : [], [data]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? years.at(-1) ?? 2022;
  const weeks = useMemo(() => data ? getWeeksForYear(data.predictions, year) : [], [data, year]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const week = selectedWeek && weeks.includes(selectedWeek) ? selectedWeek : weeks.at(-1) ?? "";

  if (!data) return null;

  const currentRows = getCurrentRows(data.predictions, week);
  const provinceOptions = [...new Set(currentRows.map((row) => row.province))].sort((a, b) => a.localeCompare(b, "th"));
  const province = provinceOptions.includes(selectedProvince) ? selectedProvince : provinceOptions[0] ?? "";
  const regional = getRegionalSummary(data.predictions, data.weather, week);
  const selected = currentRows.find((row) => row.province === province);
  const comparison = province ? compareProvinceWeek(data.predictions, province, week) : { current: undefined, previous: undefined, delta: null, percent: null };
  const actions = selected ? data.preventionActions.filter((item) => item.level === selected.level).sort((a, b) => a.priority - b.priority) : [];
  const alerts = [...currentRows].sort((a, b) => b.pred - a.pred);

  const weekStartTime = week ? Date.parse(`${week}T00:00:00Z`) : Number.NaN;
  const weekEnd = Number.isFinite(weekStartTime)
    ? new Date(weekStartTime + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : "";
  const selectedWeather = data.weather.filter((row) => (
    normalizeProvince(row.province) === normalizeProvince(province) &&
    row.date >= week && row.date <= weekEnd
  ));
  const rainfallValues = selectedWeather
    .map((row) => row.precipitation_sum)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const temperatureValues = selectedWeather
    .map((row) => row.temperature_2m_mean)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const humidityValues = selectedWeather
    .map((row) => row.humidity_mean)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const selectedRainfall = rainfallValues.length ? rainfallValues.reduce((sum, value) => sum + value, 0) : null;
  const selectedTemperature = temperatureValues.length
    ? temperatureValues.reduce((sum, value) => sum + value, 0) / temperatureValues.length
    : null;
  const selectedHumidity = humidityValues.length
    ? humidityValues.reduce((sum, value) => sum + value, 0) / humidityValues.length
    : null;
  const selectedWeatherDays = new Set(selectedWeather.map((row) => row.date)).size;

  return (
    <div className="page-stack dy-prevention-page">

      <div className="historical-notice">
        <Info size={17} /><span>ข้อมูลพยากรณ์ในชุดที่แนบเป็นข้อมูลย้อนหลังถึง 25 ธันวาคม 2022 ส่วนข้อมูลอากาศเป็นข้อมูลตรวจวัดย้อนหลัง ไม่ใช่พยากรณ์อากาศปัจจุบัน</span></div>

      <section className="filter-panel compact-filters">
        <div className="filter-title"><Wind size={17} /><strong>ช่วงเวลาที่ต้องการติดตาม</strong></div>
        <label className="field-control"><span>ปี</span><select value={year} onChange={(event) => { setSelectedYear(Number(event.target.value)); setSelectedWeek(null); }}>
          {years.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label className="field-control"><span>สัปดาห์เป้าหมาย</span><select value={week} onChange={(event) => setSelectedWeek(event.target.value)}>
          {weeks.map((item) => <option key={item} value={item}>{new Date(`${item}T00:00:00`).toLocaleDateString("th-TH")}</option>)}
        </select></label>
      </section>

      <section className="panel region-overview-panel">
        <div className="panel-heading"><div><h2>ภาพรวมการเฝ้าระวังในพื้นที่ สคร.4</h2><p>สถานะจังหวัดทั้ง 8 แห่งตามสัปดาห์เป้าหมายที่เลือก</p></div></div>
        <div className="metric-grid metric-grid-three">
          <article className="metric-card"><div className="metric-card-top"><span>จังหวัดระดับเตือนระบาด</span><span className="metric-icon red">!</span></div><strong>{regional.alertCount} จังหวัด</strong><small>ต้องติดตามใกล้ชิดตามเกณฑ์โมเดล</small></article>
          <article className="metric-card"><div className="metric-card-top"><span>จังหวัดระดับเฝ้าระวัง</span><span className="metric-icon amber">◉</span></div><strong>{regional.watchCount} จังหวัด</strong><small>ควรเพิ่มการป้องกันและติดตาม</small></article>
          <article className="metric-card"><div className="metric-card-top"><span>จังหวัดระดับปกติ</span><span className="metric-icon green">✓</span></div><strong>{regional.normalCount} จังหวัด</strong><small>คงมาตรการป้องกันต่อเนื่อง</small></article>
        </div>
        <div className="alert-list-row">
          {alerts.filter((row) => row.level !== "ปกติ").length ? alerts.filter((row) => row.level !== "ปกติ").map((row) => <div className="alert-list-item" key={row.province}><div><strong>{row.province}</strong><span>{formatCases(row.pred)} · เกณฑ์เฝ้าระวัง {formatNumber(row.thr_watch)} ราย · เกณฑ์เตือน {formatNumber(row.thr_alert)} ราย</span></div><RiskPill level={row.level} /></div>) : <div className="empty-alert"><ShieldCheck size={19} /> ยังไม่มีจังหวัดที่อยู่ในระดับเฝ้าระวังหรือเตือนระบาดตามเกณฑ์พยากรณ์ในสัปดาห์นี้</div>}
        </div>
      </section>

      <section className="content-grid prevention-detail-grid">
        <article className="panel province-alert-panel">
          <div className="panel-heading"><div><h2>การแจ้งเตือนรายจังหวัด</h2><p>เลือกจังหวัดเพื่อดูเหตุผลและเกณฑ์พยากรณ์</p></div></div>
          <label className="field-control full-field"><span>จังหวัด</span><select value={province} onChange={(event) => setSelectedProvince(event.target.value)}>
            {provinceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select></label>
          {selected && <>
            <div className={`province-status-banner ${selected.level === "เตือนระบาด" ? "banner-danger" : selected.level === "เฝ้าระวัง" ? "banner-warning" : "banner-normal"}`}>
              <div><span>จังหวัด{province}</span><strong>{selected.level}</strong></div>
              <p>{selected.level === "เตือนระบาด" ? "ค่าพยากรณ์อยู่ในระดับเตือนระบาดตามเกณฑ์ของโมเดล ควรประสานการเฝ้าระวังในพื้นที่" : selected.level === "เฝ้าระวัง" ? "ค่าพยากรณ์อยู่ในระดับเฝ้าระวัง ควรเพิ่มความเข้มข้นของการป้องกัน" : "ค่าพยากรณ์ยังไม่ถึงเกณฑ์เฝ้าระวัง แต่ควรดำเนินมาตรการป้องกันยุงลายต่อเนื่อง"}</p>
            </div>
            <div className="metric-grid metric-grid-three threshold-grid">
              <article className="mini-metric"><span>เกณฑ์เฝ้าระวัง</span><strong>{formatCases(selected.thr_watch)}</strong></article>
              <article className="mini-metric"><span>เกณฑ์เตือนระบาด</span><strong>{formatCases(selected.thr_alert)}</strong></article>
              <article className="mini-metric"><span>เปรียบเทียบกับสัปดาห์เป้าหมายก่อนหน้า</span><strong>{comparison.previous ? formatCases(comparison.previous.pred) : "ไม่มีข้อมูล"}</strong><small>{comparison.delta === null ? "" : `${comparison.delta > 0 ? "+" : ""}${formatNumber(comparison.delta)} ราย (${comparison.percent === null ? "ไม่มีฐานคำนวณ %" : `${comparison.percent > 0 ? "+" : ""}${comparison.percent.toFixed(1)}%`})`}</small></article>
            </div>
            <div className="forecast-current-value"><span>ค่าพยากรณ์สัปดาห์ที่เลือก</span><strong>{formatCases(selected.pred)}</strong></div>
          </>}
        </article>

        <article className="panel regional-weather-panel">
          <div className="panel-heading"><div><h2>ข้อมูลสภาพอากาศประกอบ</h2><p>ภาพรวม 8 จังหวัด · 7 วันของสัปดาห์เป้าหมาย</p></div><Wind size={19} /></div>
          <div className="weather-large-metrics">
            <div><span>ปริมาณฝนเฉลี่ยสะสม</span><strong>{regional.rainfallAverage === null ? "ไม่มีข้อมูล" : `${formatNumber(regional.rainfallAverage)} มม.`}</strong></div>
            <div><span>อุณหภูมิเฉลี่ย</span><strong>{regional.temperatureAverage === null ? "ไม่มีข้อมูล" : `${formatNumber(regional.temperatureAverage)} °C`}</strong></div>
          </div>
          <div className="panel-note">มีข้อมูลสภาพอากาศ {regional.weatherProvinceCount} จาก 8 จังหวัด · ข้อมูลตรวจวัดย้อนหลัง ไม่ใช่ค่าพยากรณ์อากาศในอนาคต</div>
          <div className="trend-summary"><span>แนวโน้มผู้ป่วยรวมทั้งเขต</span><strong>{regional.trend}</strong><small>{regional.trendDelta === null ? "ไม่มีสัปดาห์ก่อนหน้าให้เปรียบเทียบ" : `${regional.trendDelta > 0 ? "+" : ""}${formatNumber(regional.trendDelta)} ราย (${regional.trendPercent === null ? "คำนวณเปอร์เซ็นต์ไม่ได้" : `${regional.trendPercent > 0 ? "+" : ""}${regional.trendPercent.toFixed(1)}%`})`}</small></div>
        </article>
      </section>

      <section className="panel regional-weather-panel">
        <div className="panel-heading">
          <div>
            <h2>สภาพอากาศจังหวัดที่เลือก</h2>
            <p>{province ? `จังหวัด${province} · 7 วันของสัปดาห์เป้าหมาย ${week ? new Date(`${week}T00:00:00`).toLocaleDateString("th-TH") : ""}` : "ไม่มีจังหวัดสำหรับแสดงข้อมูล"}</p>
          </div>
          <Wind size={19} />
        </div>
        <div className="weather-large-metrics">
          <div><span>ฝนสะสม 7 วัน</span><strong>{selectedRainfall === null ? "ไม่มีข้อมูล" : `${formatNumber(selectedRainfall)} มม.`}</strong></div>
          <div><span>อุณหภูมิเฉลี่ย</span><strong>{selectedTemperature === null ? "ไม่มีข้อมูล" : `${formatNumber(selectedTemperature)} °C`}</strong></div>
          <div><span>ความชื้นเฉลี่ย</span><strong>{selectedHumidity === null ? "ไม่มีข้อมูล" : `${formatNumber(selectedHumidity)}%`}</strong></div>
        </div>
        <p className="panel-note">มีข้อมูลตรวจวัด {selectedWeatherDays}/7 วัน · เป็นข้อมูลอากาศย้อนหลัง ไม่ใช่การพยากรณ์อากาศ และไม่ใช้แทนผลประเมินทางระบาดวิทยา</p>
      </section>

      <section className="panel actions-panel">
        <div className="panel-heading"><div><h2>คำแนะนำในการป้องกัน</h2><p>{province ? `แนวทางสำหรับจังหวัด${province} ตามระดับ ${selected?.level ?? "ไม่มีข้อมูล"}` : "แนวทางป้องกันตามระดับความเสี่ยง"}</p></div><ShieldCheck size={20} /></div>
        {actions.length ? <div className="action-list">{actions.map((item, index) => <article className="action-item" key={`${item.level}-${item.priority}-${index}`}><div className="action-number">{index + 1}</div><div className="action-copy"><strong>{item.action}</strong><p>{item.frequency}</p><small>กลุ่มเป้าหมาย: {item.target_group} · แหล่งข้อมูล: {item.source}</small></div></article>)}</div> : <p className="muted">ไม่พบคำแนะนำสำหรับระดับนี้</p>}
        <div className="clinical-reminder"><AlertTriangle size={17} /><span>หากประชาชนมีไข้หรืออาการผิดปกติ ควรรับการประเมินจากบุคลากรทางการแพทย์ ไม่ควรรอการแจ้งเตือนจากระบบ</span></div>
      </section>
      <p className="disclaimer-line"><Info size={15} /> ระบบนี้เป็นการแจ้งเตือนภายในเว็บไซต์ ไม่ได้ส่ง LINE, Email หรือ SMS และระดับพยากรณ์ไม่ใช่การยืนยันว่ามีการระบาดจริง</p>
    </div>
  );
}

function ModelPreventionPage() {
  const { data } = useDengueData();
  const model = data?.modelPredictions ?? null;
  const rows = useMemo(
    () => model ? [...model.forecast].sort((a, b) => b.prediction - a.prediction) : [],
    [model],
  );
  const universalActions = useMemo(
    () => data?.preventionActions
      .filter((item) => item.level === "ปกติ")
      .sort((a, b) => a.priority - b.priority) ?? [],
    [data],
  );
  const [provinceQuery, setProvinceQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const filteredRows = useMemo(() => {
    const query = provinceQuery.trim().toLocaleLowerCase("th");
    return rows.filter((row) => !query || row.province.toLocaleLowerCase("th").includes(query));
  }, [rows, provinceQuery]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (!model) return null;

  const forecastWeek = model.coverage.forecast_week;
  const currentEpiWeekStart = getCurrentEpiWeekStart();
  const forecastLagWeeks = getEpiWeekLagWeeks(forecastWeek, currentEpiWeekStart);
  const stale = forecastWeek < currentEpiWeekStart;
  const forecastHorizonWeeks = Math.round(
    (Date.parse(forecastWeek + "T00:00:00Z") - Date.parse(model.coverage.history_end_week + "T00:00:00Z")) /
    (7 * 24 * 60 * 60 * 1000),
  );
  const total = rows.reduce((sum, row) => sum + row.prediction, 0);

  return (
    <div className="page-stack dy-prevention-page">
      <ModelValidationPanel compact />

      <div className="inline-callout warning">
        <Info size={17} />
        <span>
          โมเดลใหม่ให้ค่าพยากรณ์จำนวนผู้ป่วยรายจังหวัดเท่านั้น ยังไม่มีเกณฑ์เฝ้าระวัง
          และเกณฑ์เตือนระบาดที่ผ่านการกำหนดแยกต่างหาก หน้านี้จึงแสดงจำนวนที่คาดการณ์
          ไม่จัดระดับความเสี่ยงหรือสร้างคำเตือนจากค่าดังกล่าว
        </span>
      </div>

      <section className="panel alert-performance-panel">
        <div className="panel-heading">
          <div>
            <h2>ศูนย์จัดการเหตุการณ์แจ้งเตือนระดับประเทศ</h2>
            <p>เปิดสนามจำลองและ Workflow ของศูนย์แจ้งเตือนได้จากหน้านี้</p>
          </div>
          <BellRing size={20} />
        </div>
        <div className="inline-callout warning">
          <Info size={17} />
          <span>
            <strong>ระบบสาธิตพร้อมใช้งาน · การแจ้งเตือนจริงยังปิดอยู่</strong>
            <br />
            ศูนย์แจ้งเตือนมีสนามจำลอง การจัดการเหตุการณ์ และขั้นตอนทบทวนให้ทดลองได้
            ส่วนการจัดระดับความเสี่ยงจริงและการส่งข้อความภายนอกยังต้องรอข้อมูลและการรับรองตามกระบวนการ
          </span>
        </div>
        <div className="performance-grid">
          <div>
            <span>สนามจำลองการประเมิน</span>
            <strong>พร้อมสาธิต</strong>
          </div>
          <div>
            <span>Nationwide Rule Profile</span>
            <strong>Draft / รอรับรอง</strong>
          </div>
          <div>
            <span>LINE · Email · SMS</span>
            <strong>ปิดใช้งาน</strong>
          </div>
        </div>
        <div className="alert-demo-navigation">
          <Link href="/alerts" className="button button-primary">
            เปิดศูนย์จัดการแจ้งเตือน <ChevronRight size={16} />
          </Link>
          <span>ผลการจำลองไม่ถูกบันทึกเป็นการอนุมัติจริง และไม่ถูกส่งออกนอกระบบ</span>
        </div>
      </section>

      <AlertDryRunPanel model={model} />

      {stale && (
        <div className="historical-notice">
          <Info size={17} />
          <span>
            Forecast ในชุดข้อมูลนี้เป็น Snapshot เป้าหมายสัปดาห์ {new Date(forecastWeek + "T00:00:00").toLocaleDateString("th-TH")}
            ซึ่งอยู่ {forecastHorizonWeeks} สัปดาห์หลัง Holdout สัปดาห์สุดท้าย ({new Date(model.coverage.history_end_week + "T00:00:00").toLocaleDateString("th-TH")}).
            สัปดาห์ระบาดวิทยาปัจจุบันเริ่ม {new Date(currentEpiWeekStart + "T00:00:00").toLocaleDateString("th-TH")} ทำให้ Snapshot นี้เก่ากว่า {forecastLagWeeks} สัปดาห์
            จึงใช้ตรวจดูผลลัพธ์ของโมเดลได้ แต่ไม่ควรนำไปใช้สื่อสารเป็นสถานการณ์ปัจจุบัน
            การไม่มีค่าผู้ป่วยจริงของสัปดาห์ Forecast เป็นเรื่องปกติของผลพยากรณ์ล่วงหน้า
          </span>
        </div>
      )}

      <section className="metric-grid metric-grid-three">
        <article className="metric-card">
          <div className="metric-card-top"><span>ผู้ป่วยที่โมเดลคาดการณ์รวม</span><span className="metric-icon blue">Σ</span></div>
          <strong>{total.toLocaleString("th-TH", { maximumFractionDigits: 1 })} ราย</strong>
          <small>ผลรวมจาก 77 จังหวัด</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>จังหวัดในชุดพยากรณ์</span><span className="metric-icon aqua">77</span></div>
          <strong>{rows.length} จังหวัด</strong>
          <small>ตรวจสอบความครบถ้วนจาก Model Adapter</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>สัปดาห์เป้าหมาย</span><span className="metric-icon amber">◷</span></div>
          <strong>{new Date(forecastWeek + "T00:00:00").toLocaleDateString("th-TH")}</strong>
          <small>วันที่เริ่มต้นสัปดาห์ตามชุดข้อมูลโมเดล</small>
        </article>
      </section>

      <section className="panel alert-performance-panel">
        <div className="panel-heading">
          <div><h2>ที่มาและการตรวจสอบข้อมูล</h2><p>ตรวจสอบแหล่งที่มาของผลพยากรณ์ก่อนนำไปใช้</p></div>
        </div>
        <div className="panel-note">
          <strong>Model Repository:</strong>{" "}
          <a href={model.source_repository} target="_blank" rel="noreferrer">DenguYosoku</a>
          <br />
          <strong>Model commit:</strong>{" "}
          {model.model_revision ? (
            <a href={model.source_repository + "/commit/" + model.model_revision} target="_blank" rel="noreferrer">
              {model.model_revision.slice(0, 12)}
            </a>
          ) : "ไม่มี SHA สำหรับยืนยันรุ่นโมเดล"}
          <br />
          <strong>ข้อมูล Holdout ถึง:</strong>{" "}
          {new Date(model.coverage.history_end_week + "T00:00:00").toLocaleDateString("th-TH")}
          <br />
          <strong>ดึงไฟล์ต้นทางเมื่อ:</strong>{" "}
          {model.freshness?.source_retrieved_at_utc
            ? new Date(model.freshness.source_retrieved_at_utc).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
            : "ไม่มีข้อมูล"}
          <br />
          <strong>สร้างไฟล์ JSON เมื่อ:</strong>{" "}
          {new Date(model.freshness?.converted_at_utc ?? model.generated_at_utc).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
          <br />
          <strong>สถานะความใหม่:</strong>{" "}
          {stale ? `ล้าหลัง ${forecastLagWeeks} สัปดาห์` : "สัปดาห์ปัจจุบันหรืออนาคต"}
        </div>
      </section>

      <section className="panel province-table-panel">
        <div className="panel-heading">
          <div>
            <h2>จำนวนผู้ป่วยที่คาดการณ์รายจังหวัด</h2>
            <p>เรียงจากค่าพยากรณ์มากไปน้อย · ไม่มีการตีความเป็นระดับความเสี่ยง</p>
          </div>
        </div>
        <div className="table-toolbar">
          <label className="table-search">
            <span><Search size={14} /> ค้นหาจังหวัด</span>
            <input
              type="search"
              value={provinceQuery}
              placeholder="พิมพ์ชื่อจังหวัด..."
              onChange={(event) => { setProvinceQuery(event.target.value); setPage(1); }}
            />
          </label>
          <label className="table-page-size">
            <span>แสดงต่อหน้า</span>
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
              <option value={10}>10 จังหวัด</option>
              <option value={20}>20 จังหวัด</option>
              <option value={50}>50 จังหวัด</option>
              <option value={77}>ทั้งหมด 77 จังหวัด</option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>ลำดับ</th><th>จังหวัด</th><th>จำนวนที่คาดการณ์</th></tr></thead>
            <tbody>
              {visibleRows.length ? visibleRows.map((row, index) => (
                <tr key={row.province}>
                  <td>{(safePage - 1) * pageSize + index + 1}</td>
                  <td>{row.province}</td>
                  <td className="numeric-cell">{row.prediction.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="table-empty">ไม่พบจังหวัดที่ตรงกับคำค้นหา</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>
            {filteredRows.length
              ? `แสดง ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filteredRows.length)} จาก ${filteredRows.length} จังหวัด`
              : "ไม่มีข้อมูล"}
          </span>
          <div className="table-pagination-actions dy-mode-switcher-actions">
            <button type="button" className="button button-secondary" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}>
              <ChevronLeft size={14} /> ก่อนหน้า
            </button>
            <span>หน้า {safePage} / {pageCount}</span>
            <button type="button" className="button button-secondary" onClick={() => setPage(Math.min(pageCount, safePage + 1))} disabled={safePage >= pageCount}>
              ถัดไป <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      <section className="panel actions-panel">
        <div className="panel-heading">
          <div><h2>มาตรการป้องกันพื้นฐาน</h2><p>แนวทางทั่วไปที่ทำได้ทุกพื้นที่ โดยไม่ขึ้นกับระดับพยากรณ์</p></div>
          <ShieldCheck size={20} />
        </div>
        {universalActions.length ? (
          <div className="action-list">
            {universalActions.map((item, index) => (
              <article className="action-item" key={item.priority + "-" + item.action}>
                <div className="action-number">{index + 1}</div>
                <div className="action-copy">
                  <strong>{item.action}</strong>
                  <p>{item.frequency}</p>
                  <small>กลุ่มเป้าหมาย: {item.target_group} · แหล่งข้อมูล: {item.source}</small>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="muted">ยังไม่มีรายการคำแนะนำพื้นฐาน</p>}
      </section>

      <p className="disclaimer-line">
        <Info size={15} />
        จำนวนผู้ป่วยที่คาดการณ์เป็นผลลัพธ์ของแบบจำลอง ไม่ใช่การยืนยันการระบาดหรือความเสี่ยงรายบุคคล
        การกำหนดมาตรการควบคุมโรคต้องพิจารณาข้อมูลเฝ้าระวังจริงและแนวทางของหน่วยงานสาธารณสุขร่วมด้วย
      </p>
    </div>
  );
}


export default function PreventionPage() {
  const { data } = useDengueData();
  const [viewPreference, setViewPreference] = useState<DashboardDatasetPreference>("auto");
  const modelWeek = data?.modelPredictions?.coverage.forecast_week ?? null;

  if (!data) return null;
  const hasModel = Boolean(data.modelPredictions);
  const isApprovedModel = data.modelPredictions?.release_status === "approved";
  const isCurrentModelWeek = Boolean(modelWeek && modelWeek === getCurrentEpiWeekStart());
  // A review-only snapshot is never selected automatically for prevention.
  // Users may explicitly open it to inspect the experimental forecast.
  const view = resolvePreventionDatasetView(viewPreference, hasModel, isCurrentModelWeek, isApprovedModel);

  const latestLegacyYear = getUniqueYears(data.predictions).at(-1) ?? 2022;
  const latestLegacyWeek = getWeeksForYear(data.predictions, latestLegacyYear).at(-1) ?? "";
  const latestLegacyRows = getCurrentRows(data.predictions, latestLegacyWeek);
  const legacyProvinceCount = new Set(latestLegacyRows.map((row) => row.province)).size;
  const legacyAlertCount = latestLegacyRows.filter((row) => row.level === "เตือนระบาด").length;
  const legacyWatchCount = latestLegacyRows.filter((row) => row.level === "เฝ้าระวัง").length;

  const model = data.modelPredictions;
  const modelForecastRows = model?.forecast ?? [];
  const modelForecastTotal = modelForecastRows.reduce((sum, row) => sum + row.prediction, 0);
  const currentEpiWeek = getCurrentEpiWeekStart();
  const modelIsStale = Boolean(modelWeek && modelWeek < currentEpiWeek);
  const modelLagWeeks = modelWeek ? getEpiWeekLagWeeks(modelWeek, currentEpiWeek) : null;

  return (
    <div className="page-stack dy-prevention-selector">
      {view === "model" && model ? (
        <ProductHero
          eyebrow="PROACTIVE PREVENTION · 77 PROVINCES"
          title="ป้องกันโรคเชิงรุกทั่วประเทศไทย"
          description="สำรวจจำนวนผู้ป่วยที่โมเดลคาดการณ์รายจังหวัด เพื่อประกอบการวางแผนป้องกัน โดยไม่แปลงค่าพยากรณ์เป็นระดับเตือนภัยที่ยังไม่ได้รับอนุมัติ"
          status={modelIsStale ? `Snapshot ล้าหลัง ${modelLagWeeks ?? 0} สัปดาห์` : "พบ Snapshot · โปรดตรวจสอบช่วงเวลาข้อมูล"}
          statusTone={modelIsStale ? "warning" : "ready"}
          icon={ShieldCheck}
          stats={[
            { label: "จังหวัดใน Snapshot", value: `${modelForecastRows.length}/77`, detail: "ต้องมีครบทุกจังหวัดก่อนใช้งานระดับประเทศ" },
            { label: "ยอดพยากรณ์รวม", value: modelForecastTotal.toLocaleString("th-TH", { maximumFractionDigits: 1 }), detail: "จำนวนผู้ป่วยคาดการณ์ ไม่ใช่ระดับความเสี่ยง" },
            { label: "สัปดาห์เป้าหมาย", value: modelWeek ? new Date(`${modelWeek}T00:00:00`).toLocaleDateString("th-TH") : "ไม่มีข้อมูล", detail: "เทียบกับสัปดาห์ระบาดวิทยาปัจจุบัน" },
          ]}
        />
      ) : (
        <ProductHero
          eyebrow="PROACTIVE PREVENTION · ODPC 4"
          title="ป้องกันโรคเชิงรุก"
          description="ใช้ข้อมูลเฝ้าระวังรายจังหวัดเพื่อจัดลำดับการป้องกัน พร้อมคำแนะนำที่นำไปใช้ได้จริงในบ้าน โรงเรียน และชุมชน"
          status={`ข้อมูลย้อนหลัง · สัปดาห์เป้าหมาย ${latestLegacyWeek ? new Date(`${latestLegacyWeek}T00:00:00`).toLocaleDateString("th-TH") : "ไม่มีข้อมูล"}`}
          statusTone="warning"
          icon={ShieldCheck}
          stats={[
            { label: "พื้นที่ติดตาม", value: `${legacyProvinceCount} จังหวัด`, detail: "สคร.4 · ไม่ใช่ข้อมูลทั่วประเทศ" },
            { label: "เตือนระบาด", value: `${legacyAlertCount} จังหวัด`, detail: "ตามเกณฑ์ในชุดข้อมูลที่เลือก" },
            { label: "เฝ้าระวัง", value: `${legacyWatchCount} จังหวัด`, detail: "ควรติดตามและเพิ่มมาตรการป้องกัน" },
          ]}
        />
      )}
      <section className="panel dy-mode-switcher">
        <div className="panel-heading">
          <div>
            <h2>เลือกระบบป้องกันโรค</h2>
            <p>เลือกใช้คำแนะนำและเกณฑ์เดิมของ สคร.4 หรือดูผลโมเดลใหม่ 77 จังหวัดแยกจากกัน</p>
          </div>
        </div>
        <div className="table-pagination-actions dy-mode-switcher-actions">
          <button type="button" className={`button ${view === "legacy" ? "button-primary" : "button-secondary"}`} onClick={() => setViewPreference("legacy")} aria-pressed={view === "legacy"}>
            ระบบเดิม · สคร.4 (8 จังหวัด)
          </button>
          <button type="button" className={`button ${view === "model" ? "button-primary" : "button-secondary"}`} onClick={() => setViewPreference("model")} disabled={!hasModel} aria-pressed={view === "model"}>
            โมเดลใหม่ · 77 จังหวัด{!isApprovedModel ? " (Review-only)" : ""}
          </button>
        </div>
        {hasModel && !isApprovedModel && (
          <p className="inline-callout warning" role="status">
            Snapshot 77 จังหวัดนี้ยังเป็น Review-only ระบบจึงใช้ข้อมูลเดิมเป็นค่าเริ่มต้นเพื่อไม่ให้นำผลทดลองไปใช้เป็นคำแนะนำป้องกันโดยอัตโนมัติ คุณยังสามารถเลือกเปิดโมเดลเพื่อดูผลทดลองพร้อมคำเตือนได้
          </p>
        )}
        {hasModel && isApprovedModel && !isCurrentModelWeek && (
          <p className="panel-note">โมเดลที่อนุมัติแล้วไม่ใช่ Snapshot ของสัปดาห์ปัจจุบัน ระบบจึงใช้ข้อมูลเดิมเป็นค่าเริ่มต้น และหน้าโมเดลจะแสดงคำเตือนความเก่าเมื่อเลือกดู</p>
        )}
        {!hasModel && <p className="panel-note">ยังไม่มี Model Snapshot ที่ผ่านการตรวจสอบ จึงแสดงระบบเดิมเป็นหลัก</p>}
      </section>
      <NationalSurveillancePanel compact />
      <WeeklyPreventionChecklist />
      {view === "model" && hasModel ? <ModelPreventionPage /> : <LegacyPreventionPage />}
    </div>
  );
}
