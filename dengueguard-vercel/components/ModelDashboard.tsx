"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Info, MapPinned, Search, SlidersHorizontal } from "lucide-react";
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
import { ModelPerformanceDiagnostics } from "@/components/ModelPerformanceDiagnostics";
import { getCurrentEpiWeekStart, getEpiWeekLagWeeks } from "@/lib/utils";
import { ModelMapLoader } from "@/components/ModelMapLoader";
import type { ModelForecastRow, ModelHistoryRow, ProvinceHistorySnapshot } from "@/lib/types";
import thresholdDraft from "../public/data/alert_threshold_candidates_77.json";
import { formatEpiWeekLabel } from "@/lib/epi-week";
import { buildModelTrendRows } from "@/lib/model/history-chart";

const THRESHOLD_BY_PROVINCE = new Map(
  thresholdDraft.thresholds.map((row) => [row.province, row] as const),
);

const ALL_PROVINCES = "รวม 77 จังหวัด";

type DisplayRow = {
  province: string;
  prediction: number | null;
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

function formatTimestamp(value?: string | null) {
  if (!value) return "ไม่มีข้อมูล";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "ไม่มีข้อมูล"
    : timestamp.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
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
  const [tableQuery, setTableQuery] = useState("");
  const [tablePageSize, setTablePageSize] = useState(10);
  const [tablePage, setTablePage] = useState(1);
  const [historicalSnapshot, setHistoricalSnapshot] = useState<ProvinceHistorySnapshot | null>(null);
  const [historicalSnapshotLoading, setHistoricalSnapshotLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/data/province_history_77.json", { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error("historical snapshot unavailable");
        return response.json() as Promise<ProvinceHistorySnapshot>;
      })
      .then((payload) => {
        if (active && payload?.schema_version === 1 && Array.isArray(payload.rows)) {
          setHistoricalSnapshot(payload);
        }
      })
      .catch(() => {
        if (active) setHistoricalSnapshot(null);
      })
      .finally(() => {
        if (active) setHistoricalSnapshotLoading(false);
      });
    return () => { active = false; };
  }, []);

  const forecastWeek = model?.coverage.forecast_week ?? "";
  const thresholdDraftMatchesSnapshot = Boolean(
    model &&
    thresholdDraft.status === "draft" &&
    thresholdDraft.source.model_snapshot_revision === model.model_revision &&
    thresholdDraft.source.forecast_week === forecastWeek &&
    thresholdDraft.thresholds.length === 77,
  );
  const years = useMemo(() => {
    if (!model) return historicalSnapshot?.years ?? [];
    return [...new Set([
      ...model.history.map((row) => row.year),
      ...model.forecast.map((row) => row.year),
      ...(historicalSnapshot?.years ?? []),
    ])].sort((a, b) => a - b);
  }, [model, historicalSnapshot]);

  const activeYear = selectedYear ?? model?.forecast[0]?.year ?? years.at(-1) ?? 2025;
  const weeks = useMemo(() => {
    if (!model) return [];
    return [...new Set([
      ...model.history.filter((row) => row.year === activeYear).map((row) => row.week_start),
      ...model.forecast.filter((row) => row.year === activeYear).map((row) => row.week_start),
      ...(historicalSnapshot?.rows.filter((row) => row.year === activeYear).map((row) => row.week_start) ?? []),
    ])].sort();
  }, [model, activeYear, historicalSnapshot]);

  const activeWeek = selectedWeek && weeks.includes(selectedWeek)
    ? selectedWeek
    : (activeYear === model?.forecast[0]?.year && weeks.includes(forecastWeek)
      ? forecastWeek
      : weeks.at(-1) ?? "");

  const currentEpiWeekStart = getCurrentEpiWeekStart();
  const forecastLagWeeks = getEpiWeekLagWeeks(forecastWeek, currentEpiWeekStart);
  const isForecastWeek = Boolean(model && activeWeek === forecastWeek);
  const isStaleForecast = Boolean(model && forecastWeek && forecastWeek < currentEpiWeekStart);
  const forecastHorizonWeeks = model && forecastWeek && model.coverage.history_end_week
    ? Math.round((Date.parse(forecastWeek + "T00:00:00Z") - Date.parse(model.coverage.history_end_week + "T00:00:00Z")) / (7 * 24 * 60 * 60 * 1000))
    : null;

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
    const holdoutRows = model.history.filter((row: ModelHistoryRow) => row.week_start === activeWeek);
    if (holdoutRows.length) {
      return holdoutRows.map((row) => ({
        province: row.province,
        prediction: row.prediction,
        actualCases: row.actual_cases,
        persistence: row.persistence,
      }));
    }
    return (historicalSnapshot?.rows ?? [])
      .filter((row) => row.week_start === activeWeek)
      .map((row) => ({
        province: row.province,
        prediction: null,
        actualCases: row.actual_cases,
        persistence: null,
      }));
  }, [model, activeWeek, forecastWeek, historicalSnapshot]);

  const hasModelHistoryForWeek = Boolean(model?.history.some((row) => row.week_start === activeWeek));
  const isHistoricalActualOnly = Boolean(
    activeWeek && !isForecastWeek && !hasModelHistoryForWeek && displayRows.length,
  );
  const selectedRows = selectedProvince === ALL_PROVINCES
    ? displayRows
    : displayRows.filter((row) => row.province === selectedProvince);

  const filteredTableRows = useMemo(() => {
    const query = tableQuery.trim().toLocaleLowerCase("th");
    return [...selectedRows]
      .filter((row) => !query || row.province.toLocaleLowerCase("th").includes(query))
      .sort((a, b) => (b.prediction ?? b.actualCases ?? -1) - (a.prediction ?? a.actualCases ?? -1));
  }, [selectedRows, tableQuery]);
  const tablePageCount = Math.max(1, Math.ceil(filteredTableRows.length / tablePageSize));
  const safeTablePage = Math.min(tablePage, tablePageCount);
  const tablePageRows = filteredTableRows.slice(
    (safeTablePage - 1) * tablePageSize,
    safeTablePage * tablePageSize,
  );

  const trendRows = useMemo(() => {
    if (!model) return [];
    return buildModelTrendRows(
      model.history,
      historicalSnapshot?.rows ?? [],
      model.forecast,
      activeYear,
      selectedProvince === ALL_PROVINCES ? null : selectedProvince,
    ).map((row) => ({
      date: new Date(row.weekStart + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }),
      actual: row.actual,
      prediction: row.prediction,
      persistence: row.persistence,
    }));
  }, [model, activeYear, selectedProvince, historicalSnapshot]);
  const hasTrendPrediction = trendRows.some((row) => row.prediction !== null);
  const hasTrendPersistence = trendRows.some((row) => row.persistence !== null);

  const metric = (key: string) => {
    const value = metrics[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  if (!model) return null;
  const mapGeo = data?.thailandGeo ?? null;

  const forecastProvinceCount = new Set(model.forecast.map((row) => row.province)).size;
  const totalPrediction = isHistoricalActualOnly ? null : sum(selectedRows.map((row) => row.prediction));
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
          <h1>ภาพรวมผลพยากรณ์ไข้เลือดออกทั่วประเทศ</h1>
          <p>ผลพยากรณ์ LightGBM ครบ <strong>{forecastProvinceCount}/77 จังหวัด</strong> และเลือกดูข้อมูลผู้ป่วยจริงย้อนหลังตามปีได้ ข้อมูลย้อนหลังที่ไม่มี Holdout จะแสดงเป็นยอดผู้ป่วยจริงเท่านั้น ไม่ใช่ผลพยากรณ์จากโมเดล</p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => downloadCsv(filteredTableRows, activeWeek || "no-week")}
          disabled={!selectedRows.length}
        >
          <Download size={16} /> ดาวน์โหลด CSV
        </button>
      </section>

      {isStaleForecast ? (
        <div className="inline-callout warning">
          <Info size={17} />
          <span>
            <strong>ผลที่เลือกเป็นพยากรณ์ {formatEpiWeekLabel(forecastWeek)}</strong> · เป้าหมาย {formatWeek(forecastWeek)}
            อยู่ {forecastHorizonWeeks ?? "ไม่ทราบ"} สัปดาห์หลัง Holdout สัปดาห์สุดท้าย ({formatWeek(model.coverage.history_end_week)}).
            ปัจจุบันสัปดาห์ระบาดวิทยาเริ่ม {formatWeek(currentEpiWeekStart)} จึงเก่ากว่าสัปดาห์ปัจจุบัน {forecastLagWeeks} สัปดาห์
            แสดงไว้เพื่อดูผลพยากรณ์ของสัปดาห์เป้าหมายตามชุดข้อมูลล่าสุด ไม่ใช่การยืนยันจำนวนผู้ป่วยจริง
            และไม่ควรตีความเป็นสถานการณ์ปัจจุบันหลังเริ่มสัปดาห์ใหม่
          </span>
        </div>
      ) : (
        <div className="historical-notice">
          <Info size={17} />
          <span>
            แสดงพยากรณ์ {formatEpiWeekLabel(forecastWeek)} · เป้าหมาย {formatWeek(forecastWeek)}
            · ข้อมูลผู้ป่วยจริงที่ใช้เป็น input ถึง {formatWeek(model.coverage.history_end_week)}
            · สัปดาห์ระบาดวิทยาปัจจุบันเริ่ม {formatWeek(currentEpiWeekStart)}
          </span>
        </div>
      )}

      {model.release_status === "review_only" && (
        <div className="inline-callout warning" role="status">
          <Info size={17} />
          <span>
            <strong>โมเดลทดลองสำหรับตรวจสอบ (Review-only)</strong>
            <br />
            ผลพยากรณ์นี้แสดงบน Dashboard เพื่อทดสอบการเชื่อมต่อและตรวจทานข้อมูลเท่านั้น
            ยังไม่ใช่ผลที่รับรองสำหรับใช้ตัดสินใจสาธารณสุข และถูกบล็อกจากการสร้าง WATCH/ALERT Candidate
            จนกว่าจะมีการอนุมัติรุ่นโมเดลและเกณฑ์แจ้งเตือนแยกต่างหาก
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
        {activeWeek ? formatEpiWeekLabel(activeWeek) + " · " + formatWeek(activeWeek) : "ไม่มีข้อมูลสัปดาห์"}
        {" · "}
        {isForecastWeek ? "ผลพยากรณ์" : isHistoricalActualOnly ? "ผู้ป่วยจริงย้อนหลัง · ไม่มีผลพยากรณ์โมเดลในช่วงนี้" : "ผลประเมินย้อนหลัง (Holdout)"}
        {" · "}
        {selectedRows.length} จังหวัด
        {historicalSnapshotLoading ? " · กำลังโหลดข้อมูลปีย้อนหลัง" : ""}
      </div>

      <section className="metric-grid metric-grid-four">
        <article className="metric-card">
          <div className="metric-card-top"><span>{isForecastWeek ? "ค่าพยากรณ์รวม" : isHistoricalActualOnly ? "ผลพยากรณ์รวม" : "ผลทำนายรวมใน Holdout"}</span><span className="metric-icon blue">Σ</span></div>
          <strong>{totalPrediction === null ? "ไม่มีผลพยากรณ์" : formatCases(totalPrediction)}</strong>
          <small>{isForecastWeek ? "ผลพยากรณ์ของสัปดาห์เป้าหมาย" : isHistoricalActualOnly ? "ปีนี้มีเฉพาะข้อมูลผู้ป่วยจริงย้อนหลัง" : "ผลทำนายย้อนหลังของสัปดาห์ที่เลือก"}</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>ผู้ป่วยจริงรวม</span><span className="metric-icon aqua">●</span></div>
          <strong>{totalActual === null ? "ไม่มีข้อมูล" : formatCases(totalActual)}</strong>
          <small>{isForecastWeek
            ? "ยังไม่มี actuals ระดับจังหวัดของสัปดาห์เป้าหมาย · ไม่ใช้ยอด WHO แทนข้อมูลรายจังหวัด"
            : "ค่าจริงในชุด Holdout หรือข้อมูลประวัติศาสตร์ที่เลือก"}</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>จำนวนจังหวัด</span><span className="metric-icon blue">77</span></div>
          <strong>{selectedRows.length} จังหวัด</strong>
          <small>จาก 77 จังหวัดทั่วประเทศไทย</small>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span>MAE ของโมเดล</span><span className="metric-icon amber">±</span></div>
          <strong>{isHistoricalActualOnly || mae === null ? "—" : formatNumber(mae, 3)}</strong>
          <small>{isHistoricalActualOnly ? "ไม่มีผลประเมินโมเดลสำหรับข้อมูลปีนี้" : "ราย · ประเมินบนชุด Holdout ของ Snapshot"}</small>
        </article>
      </section>

      {!isHistoricalActualOnly && (
      <section className="panel map-panel">
        <div className="panel-heading">
          <div>
            <h2>แผนที่ผล AI รายจังหวัด</h2>
            <p>แสดงข้อมูล {displayRows.length} จาก 77 จังหวัด · {activeWeek ? formatWeek(activeWeek) : ""}</p>
          </div>
          <MapPinned size={20} />
        </div>
        <div className="map-legend" aria-label="คำอธิบายระดับตามเกณฑ์ทดลอง">
          <span><i className="legend-dot normal" />ปกติ · Draft (&lt; P75)</span>
          <span><i className="legend-dot watch" />เฝ้าระวัง · Draft (≥ P75)</span>
          <span><i className="legend-dot high" />เตือนระบาด · Draft (≥ P90)</span>
          <span><i className="legend-dot none" />ไม่มีเกณฑ์</span>
        </div>
        {mapGeo ? (
          <ModelMapLoader
            geo={mapGeo}
            rows={displayRows.map((row) => {
              const threshold = thresholdDraftMatchesSnapshot ? THRESHOLD_BY_PROVINCE.get(row.province) : undefined;
              return {
                province: row.province,
                prediction: row.prediction ?? 0,
                actual_cases: row.actualCases,
                persistence: row.persistence,
                watch_threshold: threshold?.watch ?? null,
                alert_threshold: threshold?.alert ?? null,
              };
            })}
          />
        ) : (
          <div className="map-placeholder">ไม่พบข้อมูลขอบเขตจังหวัดสำหรับแสดงแผนที่</div>
        )}
        <p className="panel-note">
          {thresholdDraftMatchesSnapshot
            ? "สีแสดงค่าพยากรณ์รายจังหวัดเทียบกับเกณฑ์ทดลอง P75/P90 ของจังหวัดนั้น (ปกติ / เฝ้าระวัง / เตือนระบาด) คำนวณจากข้อมูลย้อนหลัง 26 สัปดาห์และยังเป็น Draft ไม่ใช่เกณฑ์ประกาศการระบาดหรือเปิดแจ้งเตือนจริง"
            : "ไม่พบ Threshold Draft ที่ตรงกับ Model Snapshot นี้ จึงไม่จัดระดับสีตามเกณฑ์และแสดงจังหวัดเป็นไม่มีเกณฑ์"}
          {" "}เลื่อนเมาส์เหนือจังหวัดเพื่อดูค่าพยากรณ์และเกณฑ์ของแต่ละจังหวัด
        </p>
      </section>
      )}
      {isHistoricalActualOnly && (
        <section className="panel historical-data-panel">
          <div className="panel-heading">
            <div>
              <h2>ข้อมูลผู้ป่วยจริงย้อนหลัง · {activeYear}</h2>
              <p>ข้อมูลระดับจังหวัดจาก dengue_full.csv · สัปดาห์ที่เลือกมีข้อมูล {displayRows.length}/77 จังหวัด</p>
            </div>
          </div>
          <p className="panel-note">
            ช่วงปีนี้ไม่มีผล Holdout/Forecast จาก Model Snapshot จึงแสดงเฉพาะจำนวนผู้ป่วยจริงย้อนหลัง
            ไม่สร้างค่าพยากรณ์ย้อนหลังหรือจัดระดับความเสี่ยงจากข้อมูลจริงแทนโมเดล
          </p>
        </section>
      )}

      

      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>{hasTrendPrediction ? "ผลย้อนหลังเทียบค่าพยากรณ์ · " + activeYear : "แนวโน้มผู้ป่วยจริงย้อนหลัง · " + activeYear}</h2>
            <p>{selectedProvince === ALL_PROVINCES ? "ผลรวมประเทศจากข้อมูลจังหวัดที่มี" : "จังหวัด" + selectedProvince} · {hasTrendPrediction ? "แสดงค่าพยากรณ์เฉพาะสัปดาห์ที่มีผล Holdout/Forecast" : "ปีที่เลือกไม่มีผลพยากรณ์จากโมเดล จึงแสดงเฉพาะผู้ป่วยจริง"}</p>
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
                {hasTrendPrediction && (
                  <Line type="monotone" dataKey="prediction" name="ค่าพยากรณ์โมเดล (Holdout/Forecast)" stroke="#2e73d2" strokeWidth={2.5} dot={false} connectNulls={false} />
                )}
                {hasTrendPersistence && (
                  <Line type="monotone" dataKey="persistence" name="Persistence (สัปดาห์ก่อน)" stroke="#9aa5b3" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="panel-note">ไม่พบข้อมูลรายสัปดาห์สำหรับปีที่เลือก</div>
        )}
      </section>

      <section className="panel province-table-panel">
        <div className="panel-heading">
          <div>
            <h2>{isForecastWeek ? "ผลพยากรณ์รายจังหวัด" : isHistoricalActualOnly ? "ข้อมูลผู้ป่วยจริงย้อนหลังรายจังหวัด" : "ผล Holdout รายจังหวัด"}</h2>
            <p>{isForecastWeek ? `ผลพยากรณ์ ${displayRows.length}/77 จังหวัด` : isHistoricalActualOnly ? `ข้อมูลผู้ป่วยจริง ${displayRows.length}/77 จังหวัด` : `ข้อมูล Holdout ${displayRows.length}/77 จังหวัด`} · {isHistoricalActualOnly ? "เรียงตามผู้ป่วยจริง" : "เรียงตามค่าที่โมเดลทำนาย"} · {activeWeek ? formatWeek(activeWeek) : ""}</p>
          </div>
        </div>
        <div className="table-toolbar">
          <label className="table-search">
            <span><Search size={14} /> ค้นหาจังหวัด</span>
            <input
              type="search"
              value={tableQuery}
              placeholder="พิมพ์ชื่อจังหวัด..."
              onChange={(event) => { setTableQuery(event.target.value); setTablePage(1); }}
            />
          </label>
          <label className="table-page-size">
            <span>แสดงต่อหน้า</span>
            <select value={tablePageSize} onChange={(event) => { setTablePageSize(Number(event.target.value)); setTablePage(1); }}>
              <option value={10}>10 จังหวัด</option>
              <option value={20}>20 จังหวัด</option>
              <option value={50}>50 จังหวัด</option>
              <option value={77}>ทั้งหมด 77 จังหวัด</option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className={"data-table model-province-table" + (isHistoricalActualOnly ? " model-province-table-actual-only" : "")}>
            <colgroup>
              <col style={{ width: isHistoricalActualOnly ? "65%" : "38%" }} />
              {!isHistoricalActualOnly && <col style={{ width: "21%" }} />}
              <col style={{ width: isHistoricalActualOnly ? "35%" : "21%" }} />
              {!isHistoricalActualOnly && <col style={{ width: "20%" }} />}
            </colgroup>
            <thead>
              <tr>
                <th>จังหวัด</th>
                {!isHistoricalActualOnly && <th className="numeric-heading">AI Prediction</th>}
                <th className="numeric-heading">ผู้ป่วยจริง</th>
                {!isHistoricalActualOnly && <th className="numeric-heading">Persistence</th>}
              </tr>
            </thead>
            <tbody>
              {tablePageRows.length ? tablePageRows.map((row) => (
                <tr key={row.province}>
                  <td className="province-cell">{row.province}</td>
                  {!isHistoricalActualOnly && <td className="numeric-cell">{row.prediction === null ? "—" : formatNumber(row.prediction, 2)}</td>}
                  <td className="numeric-cell">{row.actualCases === null ? "—" : formatNumber(row.actualCases, 0)}</td>
                  {!isHistoricalActualOnly && <td className="numeric-cell">{row.persistence === null ? "—" : formatNumber(row.persistence, 2)}</td>}
                </tr>
              )) : (
                <tr><td colSpan={isHistoricalActualOnly ? 2 : 4} className="table-empty">ไม่พบจังหวัดที่ตรงกับคำค้นหา</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>
            {filteredTableRows.length
              ? `แสดง ${(safeTablePage - 1) * tablePageSize + 1}–${Math.min(safeTablePage * tablePageSize, filteredTableRows.length)} จาก ${filteredTableRows.length} จังหวัด`
              : "ไม่มีข้อมูล"}
          </span>
          <div className="table-pagination-actions">
            <button type="button" className="button button-secondary" onClick={() => setTablePage(Math.max(1, safeTablePage - 1))} disabled={safeTablePage <= 1}>
              <ChevronLeft size={14} /> ก่อนหน้า
            </button>
            <span>หน้า {safeTablePage} / {tablePageCount}</span>
            <button type="button" className="button button-secondary" onClick={() => setTablePage(Math.min(tablePageCount, safeTablePage + 1))} disabled={safeTablePage >= tablePageCount}>
              ถัดไป <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="panel-note">
          {isHistoricalActualOnly
            ? "ข้อมูลชุดนี้เป็นผู้ป่วยจริงย้อนหลังจากไฟล์ต้นทาง ไม่มีค่าพยากรณ์ AI หรือ Persistence สำหรับปีที่เลือก · ดาวน์โหลด CSV จะรวมทุกจังหวัดที่ตรงกับตัวกรอง"
            : "Persistence คือค่าผู้ป่วยจากสัปดาห์ก่อน ไม่ใช่ค่าเฉลี่ยย้อนหลัง 4 สัปดาห์ · ดาวน์โหลด CSV จะรวมทุกแถวที่ตรงกับตัวกรอง ไม่จำกัดเฉพาะหน้าที่เปิดอยู่"}
        </div>
      </section>

      <section className="content-grid bottom-grid">
        <article className="panel model-panel">
          <div className="panel-heading"><div><h2>ประสิทธิภาพโมเดล</h2><p>ค่าประเมินจาก Holdout ใน Model Repository</p></div></div>
          <table className="data-table compact-table">
            <thead><tr><th>Metric</th><th className="numeric-heading">ค่า</th></tr></thead>
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
            <br />
            สัปดาห์ปัจจุบัน (Asia/Bangkok): {formatWeek(currentEpiWeekStart)}
            <br />
            อายุ Snapshot เทียบสัปดาห์ปัจจุบัน: {isStaleForecast ? `${forecastLagWeeks} สัปดาห์` : "ไม่เก่ากว่าสัปดาห์ปัจจุบัน"}
            <br />
            ระยะ Forecast หลัง Holdout: {forecastHorizonWeeks === null ? "ไม่มีข้อมูล" : `${forecastHorizonWeeks} สัปดาห์`}
            <br />
            ดึงไฟล์จาก Model Repository: {formatTimestamp(model.freshness?.source_retrieved_at_utc)}
            <br />
            สร้างไฟล์ JSON สำหรับเว็บ: {formatTimestamp(model.freshness?.converted_at_utc ?? model.generated_at_utc)}
            <br />
            Metrics eval cutoff: {typeof metrics.eval_cutoff === "string" ? metrics.eval_cutoff : "ไม่มีข้อมูล"}
            <br />
            ลำดับ Holdout → Forecast: {model.coverage.forecast_is_after_history ? "ผ่าน" : "ต้องตรวจสอบ"}
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
          <p className="panel-note">
            Weather feature: lagged weekly apparent temperature จาก Open-Meteo Historical Weather API
            <br />
            Weather data by{" "}
            <a href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noreferrer">
              Open-Meteo.com
            </a>{" "}
            · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
            <br />
            ใช้เป็น historical model input และผ่านการเปรียบเทียบกับ weather source เดิม 52 สัปดาห์ (4,004 province-week pairs)
            ไม่ใช่ข้อมูลพยากรณ์อากาศสด
          </p>
        </article>
      </section>

      <ModelPerformanceDiagnostics model={model} metrics={data?.modelMetrics ?? null} />

      <p className="disclaimer-line">
        <Info size={15} />
        ค่าพยากรณ์เป็นจำนวนผู้ป่วยที่โมเดลคาดการณ์ ไม่ใช่ความน่าจะเป็นรายบุคคลหรือการยืนยันการระบาด
        ผล Holdout เป็นการประเมินย้อนหลัง ส่วน Forecast ต้องตรวจสอบวันเป้าหมายและวันที่อัปเดตข้อมูลก่อนใช้งาน
      </p>
    </div>
  );
}
