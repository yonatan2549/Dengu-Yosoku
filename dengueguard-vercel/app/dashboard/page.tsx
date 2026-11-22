"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Info, MapPinned, SlidersHorizontal } from "lucide-react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useDengueData } from "@/components/DataProvider";
import ModelDashboard from "@/components/ModelDashboard";
import { ModelValidationPanel } from "@/components/ModelValidationPanel";
import { MapLoader } from "@/components/MapLoader";
import { ALL_PROVINCES, formatCases, formatNumber, getCurrentEpiWeekStart, getCurrentRows, getUniqueYears, getWeeksForYear } from "@/lib/utils";
import type { ForecastRow } from "@/lib/types";

function sumPresent(rows: ForecastRow[], key: "target" | "pred" | "cases_roll4") {
  const vals = rows.map((row) => row[key]).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  if (!vals.length) return null;
  if (key === "target" && vals.length !== rows.length) return null;
  return vals.reduce((a, b) => a + b, 0);
}

function downloadCsv(rows: ForecastRow[], fileName: string) {
  const columns: (keyof ForecastRow)[] = ["province", "year", "target_week_start", "target", "cases_now", "cases_roll4", "pred", "thr_watch", "thr_alert", "level"];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function RiskPill({ level }: { level: string }) {
  const cls = level === "เตือนระบาด" ? "risk-high" : level === "เฝ้าระวัง" ? "risk-watch" : "risk-normal";
  return <span className={`risk-pill ${cls}`}><span />{level}</span>;
}

function LegacyDashboardPage() {
  const { data } = useDengueData();
  const [selectedProvince, setSelectedProvince] = useState(ALL_PROVINCES);
  const years = useMemo(() => data ? getUniqueYears(data.predictions) : [], [data]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const activeYear = selectedYear ?? years.at(-1) ?? 2022;
  const weeks = useMemo(() => data ? getWeeksForYear(data.predictions, activeYear) : [], [data, activeYear]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const activeWeek = selectedWeek && weeks.includes(selectedWeek) ? selectedWeek : (weeks.at(-1) ?? "");

  const currentRows = useMemo(() => data ? getCurrentRows(data.predictions, activeWeek) : [], [data, activeWeek]);
  const trendRows = useMemo(() => {
    if (!data) return [];
    const base = data.predictions.filter((row) => Number(row.year) === activeYear && (selectedProvince === ALL_PROVINCES || row.province === selectedProvince));
    const groups = new Map<string, ForecastRow[]>();
    base.forEach((row) => groups.set(row.target_week_start, [...(groups.get(row.target_week_start) ?? []), row]));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({
      date: new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" }),
      target: sumPresent(rows, "target"),
      prediction: sumPresent(rows, "pred"),
      baseline: sumPresent(rows, "cases_roll4"),
    }));
  }, [data, activeYear, selectedProvince]);

  if (!data) return null;

  const totalPred = currentRows.reduce((sum, row) => sum + Number(row.pred || 0), 0);
  const actualValues = currentRows.map((row) => row.target);
  const totalActual = actualValues.length && actualValues.every((v) => v !== null && v !== undefined)
    ? actualValues.reduce((sum, value) => sum + Number(value), 0)
    : null;
  const alertCount = currentRows.filter((row) => row.level === "เตือนระบาด").length;
  const watchCount = currentRows.filter((row) => row.level === "เฝ้าระวัง").length;
  const latestWeek = data.predictions.map((row) => row.target_week_start).sort().at(-1) ?? "";
  const latestYear = Number(latestWeek.slice(0, 4));

  return (
    <div className="page-stack">
      <section className="page-heading-row">
        <div>
          <div className="eyebrow">SURVEILLANCE DASHBOARD</div>
          <h1>ภาพรวมสถานการณ์ไข้เลือดออก</h1>
          <p>ติดตามการพยากรณ์และระดับความเสี่ยงรายจังหวัดในพื้นที่ สคร.4</p>
        </div>
        <button className="button button-secondary" onClick={() => downloadCsv(data.predictions.filter((row) => Number(row.year) === activeYear), `dengue_forecast_${activeYear}.csv`)}>
          <Download size={16} /> ดาวน์โหลด CSV
        </button>
      </section>

      <div className="historical-notice"><Info size={17} /><span>ชุดข้อมูลที่แนบเป็นข้อมูลย้อนหลัง ครอบคลุมถึงสัปดาห์ {new Date(`${latestWeek}T00:00:00`).toLocaleDateString("th-TH")} ({latestYear}) ตัวเลขนี้ยังไม่ใช่การพยากรณ์สถานการณ์ปัจจุบัน</span></div>
      {activeYear < data.meta.test_year && <div className="inline-callout warning"><Info size={16} /><span>ปี {activeYear} เป็นข้อมูลที่โมเดลใช้เรียน ผลอาจดูแม่นยำเกินจริง ควรใช้ปีทดสอบ {data.meta.test_year} สำหรับการประเมินโมเดล</span></div>}

      <section className="filter-panel">
        <div className="filter-title"><SlidersHorizontal size={17} /><strong>ตัวกรองข้อมูล</strong></div>
        <label className="field-control"><span>ปีข้อมูล</span><select value={activeYear} onChange={(e) => { setSelectedYear(Number(e.target.value)); setSelectedWeek(null); }}>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select></label>
        <label className="field-control"><span>สัปดาห์เป้าหมาย</span><select value={activeWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
          {weeks.map((week) => <option key={week} value={week}>{new Date(`${week}T00:00:00`).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" })}</option>)}
        </select></label>
        <label className="field-control"><span>จังหวัดสำหรับกราฟแนวโน้ม</span><select value={selectedProvince} onChange={(e) => setSelectedProvince(e.target.value)}>
          <option value={ALL_PROVINCES}>{ALL_PROVINCES}</option>
          {[...new Set(data.predictions.map((row) => row.province))].sort((a, b) => a.localeCompare(b, "th")).map((province) => <option key={province} value={province}>{province}</option>)}
        </select></label>
      </section>

      <div className="subtle-caption">สัปดาห์เป้าหมาย {new Date(`${activeWeek}T00:00:00`).toLocaleDateString("th-TH")} · ระยะพยากรณ์ {data.meta.horizon_weeks} สัปดาห์</div>

      <section className="metric-grid metric-grid-four">
        <article className="metric-card"><div className="metric-card-top"><span>ผู้ป่วยที่คาดการณ์รวม</span><span className="metric-icon blue">Σ</span></div><strong>{formatCases(totalPred)}</strong><small>ค่าพยากรณ์ของ 8 จังหวัด</small></article>
        <article className="metric-card"><div className="metric-card-top"><span>ผู้ป่วยจริงรวม</span><span className="metric-icon aqua">●</span></div><strong>{totalActual === null ? "ยังไม่มีข้อมูล" : formatCases(totalActual)}</strong><small>แสดงเมื่อมีข้อมูลจริงครบทุกจังหวัด</small></article>
        <article className="metric-card"><div className="metric-card-top"><span>จังหวัดเตือนระบาด</span><span className="metric-icon red">!</span></div><strong>{alertCount} จังหวัด</strong><small>จากทั้งหมด 8 จังหวัด</small></article>
        <article className="metric-card"><div className="metric-card-top"><span>จังหวัดเฝ้าระวัง</span><span className="metric-icon amber">◉</span></div><strong>{watchCount} จังหวัด</strong><small>จากทั้งหมด 8 จังหวัด</small></article>
      </section>

      <section className="content-grid map-grid">
        <article className="panel map-panel">
          <div className="panel-heading"><div><h2>แผนที่ระดับความเสี่ยง</h2><p>แสดงขอบเขตประเทศไทย 77 จังหวัด · มีผลพยากรณ์เฉพาะ 8 จังหวัด สคร.4</p></div><MapPinned size={20} /></div>
          <div className="map-legend">
            <span><i className="legend-dot normal" />ปกติ</span><span><i className="legend-dot watch" />เฝ้าระวัง</span><span><i className="legend-dot high" />เตือนระบาด</span><span><i className="legend-dot none" />ไม่มีข้อมูล</span>
          </div>
          <MapLoader geo={data.thailandGeo} currentRows={currentRows} />
          <div className="panel-note">จังหวัดสีเทาไม่มีข้อมูลพยากรณ์ในชุดข้อมูลที่เลือก เลื่อนเมาส์เพื่อดูชื่อจังหวัดและค่าพยากรณ์</div>
        </article>
        <article className="panel province-table-panel">
          <div className="panel-heading"><div><h2>รายละเอียดรายจังหวัด</h2><p>เรียงตามจำนวนผู้ป่วยที่คาดการณ์</p></div></div>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>จังหวัด</th><th>ทำนาย</th><th>เฝ้าระวัง</th><th>เตือน</th><th>ระดับ</th></tr></thead><tbody>
            {[...currentRows].sort((a, b) => b.pred - a.pred).map((row) => <tr key={row.province}><td>{row.province}</td><td className="numeric-cell">{formatNumber(row.pred, 1)}</td><td className="numeric-cell">{formatNumber(row.thr_watch, 1)}</td><td className="numeric-cell">{formatNumber(row.thr_alert, 1)}</td><td><RiskPill level={row.level} /></td></tr>)}
          </tbody></table></div>
          <div className="panel-note">เกณฑ์เฝ้าระวังและเตือนระบาดอ้างอิงค่าที่อยู่ในผลลัพธ์ของโมเดล</div>
        </article>
      </section>

      <section className="panel chart-panel">
        <div className="panel-heading"><div><h2>แนวโน้มผู้ป่วยรายสัปดาห์ · {activeYear}</h2><p>{selectedProvince === ALL_PROVINCES ? "ภาพรวมรวม 8 จังหวัด" : `จังหวัด${selectedProvince}`} · เปรียบเทียบผู้ป่วยจริง, AI Prediction และ Baseline</p></div></div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendRows} margin={{ top: 12, right: 18, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" />
              <XAxis dataKey="date" tick={{ fill: "#7a8797", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={22} />
              <YAxis tick={{ fill: "#7a8797", fontSize: 11 }} tickLine={false} axisLine={false} width={46} />
              <Tooltip formatter={(value) => value === null || value === undefined ? "ไม่มีข้อมูล" : `${Number(value).toFixed(1)} ราย`} contentStyle={{ borderRadius: 12, border: "1px solid #e8edf3" }} />
              <Legend />
              <Line type="monotone" dataKey="target" name="ผู้ป่วยจริง" stroke="#26374a" strokeWidth={2.2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="baseline" name="Baseline (เฉลี่ย 4 สัปดาห์)" stroke="#9aa5b3" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="prediction" name="AI ทำนาย" stroke="#2e73d2" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="content-grid bottom-grid">
        <article className="panel model-panel">
          <div className="panel-heading"><div><h2>ผลการทดสอบโมเดล</h2><p>ปีทดสอบ {data.meta.test_year} · ข้อมูลที่โมเดลไม่เคยเห็น</p></div></div>
          <table className="data-table compact-table"><thead><tr><th>โมเดล</th><th>MAE</th><th>RMSE</th></tr></thead><tbody>
            {Object.entries(data.meta.metrics).map(([name, metrics]) => <tr key={name}><td>{name}</td><td className="numeric-cell">{metrics.MAE.toFixed(3)}</td><td className="numeric-cell">{metrics.RMSE.toFixed(3)}</td></tr>)}
          </tbody></table>
        </article>
        <article className="panel alert-performance-panel">
          <div className="panel-heading"><div><h2>ประสิทธิภาพการแจ้งเตือน</h2><p>การตรวจจับสัปดาห์-จังหวัดที่ระบาดจริง</p></div></div>
          <div className="performance-grid"><div><span>Recall</span><strong>{(data.meta.alert.recall * 100).toFixed(0)}%</strong></div><div><span>Precision</span><strong>{(data.meta.alert.precision * 100).toFixed(0)}%</strong></div><div><span>จำนวนจริง</span><strong>{data.meta.alert.n_real}</strong></div></div>
          <p className="panel-note">Recall คือสัดส่วนเหตุการณ์จริงที่ระบบตรวจจับได้ ส่วน Precision คือสัดส่วนการเตือนที่ตรงกับเหตุการณ์จริง</p>
        </article>
      </section>
      <p className="disclaimer-line"><Info size={15} /> ระดับความเสี่ยงเป็นไปตามเกณฑ์พยากรณ์ของโมเดล ไม่ใช่ความน่าจะเป็นที่บุคคลจะติดเชื้อ และไม่ใช่การยืนยันว่ามีการระบาดจริง</p>
    </div>
  );
}


export default function DashboardPage() {
  const { data } = useDengueData();
  const [view, setView] = useState<"legacy" | "model">("legacy");
  const modelWeek = data?.modelPredictions?.coverage.forecast_week ?? null;

  useEffect(() => {
    setView(modelWeek && modelWeek === getCurrentEpiWeekStart() ? "model" : "legacy");
  }, [modelWeek]);

  if (!data) return null;
  const hasModel = Boolean(data.modelPredictions);

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>เลือกระบบ Dashboard</h2>
            <p>เลือกดูระบบเดิมของ สคร.4 หรือผลโมเดลใหม่ทั่วประเทศ โดยไม่ลบหรือเขียนทับข้อมูลทั้งสองชุด</p>
          </div>
        </div>
        <div className="table-pagination-actions">
          <button type="button" className={`button ${view === "legacy" ? "button-primary" : "button-secondary"}`} onClick={() => setView("legacy")} aria-pressed={view === "legacy"}>
            ระบบเดิม · สคร.4 (8 จังหวัด)
          </button>
          <button type="button" className={`button ${view === "model" ? "button-primary" : "button-secondary"}`} onClick={() => setView("model")} disabled={!hasModel} aria-pressed={view === "model"}>
            โมเดลใหม่ · 77 จังหวัด
          </button>
        </div>
        {hasModel && modelWeek !== getCurrentEpiWeekStart() && (
          <p className="panel-note">Snapshot ของโมเดลไม่ใช่สัปดาห์ระบาดวิทยาปัจจุบัน จึงเปิดระบบเดิมเป็นค่าเริ่มต้น หากเลือกโมเดลใหม่จะเห็นคำเตือนข้อมูลย้อนหลังในหน้าโมเดล</p>
        )}
        {!hasModel && <p className="panel-note">ยังไม่มี Model Snapshot ที่ผ่านการตรวจสอบ จึงแสดงระบบเดิมเป็นหลัก</p>}
      </section>
      {view === "model" && hasModel ? <ModelDashboard /> : <LegacyDashboardPage />}
    </div>
  );
}
