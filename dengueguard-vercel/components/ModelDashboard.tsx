"use client";

import { useMemo, useState } from "react";
import { Download, Info, SlidersHorizontal } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDengueData } from "@/components/DataProvider";
import type { ModelForecastRow, ModelHistoryRow } from "@/lib/types";

const ALL_PROVINCES = "รวม 77 จังหวัด";

type DisplayRow = {
  province: string;
  prediction: number;
  actualCases: number | null;
  persistence: number | null;
};

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCases(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "ไม่มีข้อมูล"
    : formatNumber(value) + " ราย";
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => (
    value !== null && value !== undefined && Number.isFinite(value) ? total + value : total
  ), 0);
}

function formatWeek(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function downloadCsv(rows: DisplayRow[], week: string) {
  const columns: Array<keyof DisplayRow> = ["province", "prediction", "actualCases", "persistence"];
  const escape = (value: unknown) => "\"" + String(value ?? "").replaceAll('"', '""') + "\"";
  const csv = [
    ["province", "prediction", "actual_cases", "persistence"],
    ...rows.map((row) => columns.map((column) => row[column])),
  ].map((line) => line.map(escape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "denguyosoku_77_provinces_" + week + ".csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ModelDashboard() {
  const { data } = useDengueData();
  const model = data?.modelPredictions ?? null;
  const metrics = data?.modelMetrics?.metrics ?? {};
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedProvince, setSelectedProvince] = useState(ALL_PROVINCES);

  const forecastWeek = model?.coverage.forecast_week ?? "";
  const years = useMemo(() => {
    if (!model) return [];
    return [...new Set([
      ...model.history.map((row) => row.year),
      ...model.forecast.map((row) => row.year),
    ])].sort((a, b) => a - b);
  }, [model]);

  const activeYear = selectedYear ?? model?.forecast[0]?.year ?? years.at(-1) ?? 2025;
  const weeks = useMemo(() => {
    if (!model) return [];
    return [...new Set([
      ...model.history.filter((row) => row.year === activeYear).map((row) => row.week_start),
      ...model.forecast.filter((row) => row.year === activeYear).map((row) => row.week_start),
    ])].sort();
  }, [model, activeYear]);

  const activeWeek = selectedWeek && weeks.includes(selectedWeek)
    ? selectedWeek
    : (activeYear === model?.forecast[0]?.year && weeks.includes(forecastWeek)
      ? forecastWeek
      : weeks.at(-1) ?? "");

  const isForecastWeek = Boolean(model && activeWeek === forecastWeek);
  const isStaleForecast = Boolean(
    model && forecastWeek &&
    forecastWeek <= model.generated_at_utc.slice(0, 10),
  );

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (!model || !activeWeek) return [];
    if (activeWeek === forecastWeek) {
      return model.forecast.map((row: ModelForecastRow) => ({
        province: row.province,
        prediction: row.prediction,
        actualCases: null,
        persistence: null,
      }));
    }
    return model.history
      .filter((row: ModelHistoryRow) => row.week_start === activeWeek)
      .map((row) => ({
        province: row.province,
        prediction: row.prediction,
        actualCases: row.actual_cases,
        persistence: row.persistence,
      }));
  }, [model, activeWeek, forecastWeek]);

  const selectedRows = selectedProvince === ALL_PROVINCES
    ? displayRows
    : displayRows.filter((row) => row.province === selectedProvince);

  const trendRows = useMemo(() => {
    if (!model) return [];
    const rows = model.history.filter((row) => (
      row.year === activeYear &&
      (selectedProvince === ALL_PROVINCES || row.province === selectedProvince)
    ));
    const groups = new Map<string, ModelHistoryRow[]>();
    rows.forEach((row) => groups.set(row.week_start, [...(groups.get(row.week_start) ?? []), row]));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, group]) => ({
      date: new Date(week + "T00:00:00").toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
      }),
      actual: sum(group.map((row) => row.actual_cases)),
      prediction: sum(group.map((row) => row.prediction)),
      persistence: sum(group.map((row) => row.persistence)),
    }));
  }, [model, activeYear, selectedProvince]);

  const metric = (key: string) => {
    const value = metrics[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  if (!model) return null;

  const totalPrediction = sum(selectedRows.map((row) => row.prediction));
  const totalActual = selectedRows.length && selectedRows.every((row) => row.actualCases !== null)
    ? sum(selectedRows.map((row) => row.actualCases))
    : null;
  const mae = metric("mae");
  const rmse = metric("rmse");
  const skill = metric("skill_pct");

  return (
    <div className="page-stack">
      <section className="page-heading-row">
        <div>
          <div className="eyebrow">NATIONAL DENGUE FORECAST · 77 PROVINCES</div>
          <h1>ภาพรวมสถานการณ์ไข้เลือดออกทั่วประเทศ</h1>
          <p>ผลพยากรณ์จาก DenguYosoku LightGBM ครอบคลุม 77 จังหวัด</p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => downloadCsv(selectedRows, activeWeek || "no-week")}
          disabled={!selectedRows.length}
        >
          <Download size={16} /> ดาวน์โหลด CSV
        </button>
      </section>

      {isStaleForecast ? (
        <div className="inline-callout warning">
          <Info size={17} />
          <span>
            ผลพยากรณ์ที่มีอยู่กำหนดสัปดาห์เป้าหมาย {formatWeek(forecastWeek)} และถูกแปลงข้อมูลเมื่อ
            {" " + formatWeek(model.generated_at_utc.slice(0, 10))} จึงเป็นผลจากสัปดาห์ที่ผ่านมา
            ต้องสร้างผลพยากรณ์ใหม่จากข้อมูลล่าสุดก่อนนำไปสื่อสารเป็นสถานการณ์ปัจจุบัน
          </span>
        </div>
      ) : (
        <div className="historical-notice">
          <Info size={17} />
          <span>
            สัปดาห์พยากรณ์ที่เผยแพร่: {formatWeek(forecastWeek)} · ตรวจสอบวันที่ข้อมูลก่อนใช้งานทุกครั้ง
          </span>
        </div>
      )}

      <section className="filter-panel">
        <div className="filter-title"><SlidersHorizontal size={17} /><strong>ตัวกรองข้อมูล</strong></div>
        <label className="field-control">
          <span>ปีข้อมูล</span>
          <select value={activeYear} onChange={(event) => {
            setSelectedYear(Number(event.target.value));
            setSelectedWeek(null);
          }}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label className="field-control">
          <span>สัปดาห์เป้าหมาย</span>
          <select value={activeWeek} onChange={(event) => setSelectedWeek(event.target.value)}>
            {weeks.map((week) => <option key={week} value={week}>{formatWeek(week)}</option>)}
          </select>
        </label>
        <label className="field-control">
          <span>จังหวัดสำหรับกราฟและตาราง</span>
          <select value={selectedProvince} onChange={(event) => setSelectedProvince(event.target.value)}>
            <option value={ALL_PROVINCES}>{ALL_PROVINCES}</option>
            {model.provinces.map((province) => <option key={province} value={province}>{province}</option>)}
          </select>
        </label>
      </section>

      <div className="subtle-caption">
        สัปดาห์ที่เลือก {activeWeek ? formatWeek(activeWeek) : "ไม่มีข้อมูล"}
        {" · "}
        {isForecastWeek ? "ผลพยากรณ์" : "ผลประเมินย้อนหลัง (Holdout)"}
        {" · "}
        {selectedRows.length} จังหวัด
      </div>

      <section className="metric-grid metric-grid-four">
        <article className="metric-card">
          <div className="metric-card-top"><span>ค่าพยากรณ์รวม</span><span className="metric-icon blue">Σ</span></div>
          <strong>{formatCases(totalPrediction)}</strong>
          <small>{isForecastWeek ? "ผลพยากรณ์ของสัปดาห์เป้าหมาย" : "ผลทำนายย้อนหลังของสัปดาห์ที่เลือก"}</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>ผู้ป่วยจริงรวม</span><span className="metric-icon aqua">●</span></div>
          <strong>{totalActual === null ? "ไม่มีข้อมูล" : formatCases(totalActual)}</strong>
          <small>{isForecastWeek ? "ยังไม่มีผลจริงสำหรับสัปดาห์พยากรณ์" : "ค่าจริงในชุด Holdout"}</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>จำนวนจังหวัด</span><span className="metric-icon blue">77</span></div>
          <strong>{selectedRows.length} จังหวัด</strong>
          <small>จาก 77 จังหวัดทั่วประเทศไทย</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>MAE ของโมเดล</span><span className="metric-icon amber">±</span></div>
          <strong>{mae === null ? "ไม่มีข้อมูล" : formatNumber(mae, 3)}</strong>
          <small>ราย · ประเมินบนชุด Holdout</small>
        </article>
      </section>

      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>ผลย้อนหลังเทียบค่าพยากรณ์ · {activeYear}</h2>
            <p>{selectedProvince === ALL_PROVINCES ? "ผลรวม 77 จังหวัด" : "จังหวัด" + selectedProvince} · ใช้ข้อมูล Holdout เท่านั้น</p>
          </div>
        </div>
        {trendRows.length ? (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendRows} margin={{ top: 12, right: 18, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" />
                <XAxis dataKey="date" tick={{ fill: "#7a8797", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={22} />
                <YAxis tick={{ fill: "#7a8797", fontSize: 11 }} tickLine={false} axisLine={false} width={46} />
                <Tooltip
                  formatter={(value) => value === null || value === undefined ? "ไม่มีข้อมูล" : Number(value).toFixed(1) + " ราย"}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e8edf3" }}
                />
                <Legend />
                <Line type="monotone" dataKey="actual" name="ผู้ป่วยจริง" stroke="#26374a" strokeWidth={2.2} dot={false} />
                <Line type="monotone" dataKey="prediction" name="AI ทำนาย" stroke="#2e73d2" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="persistence" name="Persistence (สัปดาห์ก่อน)" stroke="#9aa5b3" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="panel-note">ไม่มีข้อมูล Holdout สำหรับปีที่เลือก</div>
        )}
      </section>

      <section className="panel province-table-panel">
        <div className="panel-heading">
          <div>
            <h2>ผลพยากรณ์รายจังหวัด</h2>
            <p>เรียงตามจำนวนผู้ป่วยที่โมเดลคาดการณ์ · {activeWeek ? formatWeek(activeWeek) : ""}</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>จังหวัด</th>
                <th>AI Prediction</th>
                <th>ผู้ป่วยจริง</th>
                <th>Persistence</th>
              </tr>
            </thead>
            <tbody>
              {[...selectedRows].sort((a, b) => b.prediction - a.prediction).map((row) => (
                <tr key={row.province}>
                  <td>{row.province}</td>
                  <td className="numeric-cell">{formatNumber(row.prediction, 2)}</td>
                  <td className="numeric-cell">{row.actualCases === null ? "—" : formatNumber(row.actualCases, 0)}</td>
                  <td className="numeric-cell">{row.persistence === null ? "—" : formatNumber(row.persistence, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-note">
          Persistence คือค่าผู้ป่วยจากสัปดาห์ก่อน ไม่ใช่ค่าเฉลี่ยย้อนหลัง 4 สัปดาห์
        </div>
      </section>

      <section className="content-grid bottom-grid">
        <article className="panel model-panel">
          <div className="panel-heading"><div><h2>ประสิทธิภาพโมเดล</h2><p>ค่าประเมินจาก Holdout ใน Model Repository</p></div></div>
          <table className="data-table compact-table">
            <thead><tr><th>Metric</th><th>ค่า</th></tr></thead>
            <tbody>
              <tr><td>MAE</td><td className="numeric-cell">{mae === null ? "—" : formatNumber(mae, 3)}</td></tr>
              <tr><td>RMSE</td><td className="numeric-cell">{rmse === null ? "—" : formatNumber(rmse, 3)}</td></tr>
              <tr><td>R²</td><td className="numeric-cell">{metric("r2") === null ? "—" : formatNumber(metric("r2"), 3)}</td></tr>
              <tr><td>Skill vs Persistence</td><td className="numeric-cell">{skill === null ? "—" : formatNumber(skill, 2) + "%"}</td></tr>
            </tbody>
          </table>
        </article>
        <article className="panel alert-performance-panel">
          <div className="panel-heading"><div><h2>ข้อมูลโมเดล</h2><p>แหล่งที่มาและขอบเขตข้อมูล</p></div></div>
          <div className="performance-grid">
            <div><span>จังหวัด</span><strong>{model.province_count}</strong></div>
            <div><span>Holdout rows</span><strong>{model.coverage.history_rows.toLocaleString("th-TH")}</strong></div>
            <div><span>สัปดาห์ Holdout</span><strong>{model.coverage.history_week_count}</strong></div>
          </div>
          <p className="panel-note">
            Holdout: {formatWeek(model.coverage.history_start_week)} – {formatWeek(model.coverage.history_end_week)}
            <br />
            Forecast: {formatWeek(model.coverage.forecast_week)}
          </p>
          {model.model_revision && (
            <p className="panel-note">
              Model commit:{" "}
              <a
                href={model.source_repository + "/commit/" + model.model_revision}
                target="_blank"
                rel="noreferrer"
              >
                {model.model_revision.slice(0, 12)}
              </a>
            </p>
          )}
          <a className="dg-source-link" href={model.source_repository} target="_blank" rel="noreferrer">
            เปิด Model Repository
          </a>
        </article>
      </section>

      <section className="panel map-panel">
        <div className="panel-heading">
          <div><h2>แผนที่ระดับความเสี่ยง</h2><p>รอการกำหนดเกณฑ์ระดับความเสี่ยงสำหรับโมเดลรุ่นใหม่</p></div>
        </div>
        <p className="panel-note">
          โมเดลใหม่ส่งออกจำนวนผู้ป่วยที่คาดการณ์รายจังหวัด แต่ยังไม่มีค่าเกณฑ์เฝ้าระวังและเตือนระบาด
          จึงยังไม่แสดงสีระดับความเสี่ยง เพื่อไม่ให้สื่อความหมายเกินกว่าข้อมูลที่โมเดลให้มา
          การแสดงแผนที่จะเชื่อมต่อหลังตรวจสอบเกณฑ์ดังกล่าวแล้ว
        </p>
      </section>

      <p className="disclaimer-line">
        <Info size={15} />
        ค่าพยากรณ์เป็นจำนวนผู้ป่วยที่โมเดลคาดการณ์ ไม่ใช่ความน่าจะเป็นรายบุคคลหรือการยืนยันการระบาด
        ผล Holdout เป็นการประเมินย้อนหลัง ส่วน Forecast ต้องตรวจสอบวันเป้าหมายและวันที่อัปเดตข้อมูลก่อนใช้งาน
      </p>
    </div>
  );
}
