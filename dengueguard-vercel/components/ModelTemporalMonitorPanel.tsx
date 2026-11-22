"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from "lucide-react";

type MetricSet = { sampleCount: number; mae: number; rmse: number; bias: number };
type MetricName = "prediction" | "persistence" | "seasonal_naive" | "climatology";
type Comparison = {
  previousStartWeek: string; previousEndWeek: string; recentStartWeek: string; recentEndWeek: string;
  previous: Record<MetricName, MetricSet>; recent: Record<MetricName, MetricSet>;
  modelMaeDelta: number; modelMaeChangePercent: number | null;
  modelMaeDirection: "higher-error" | "lower-error" | "unchanged";
};
type Report = {
  status: "ready" | "warning" | "blocked"; modelRevision: string | null; repository: string | null;
  historyRowCount: number; completeWeekCount: number; incompleteWeekCount: number;
  firstCompleteWeek: string | null; lastCompleteWeek: string | null; comparison: Comparison | null;
  weekly: Array<{ weekStart: string } & MetricSet>;
  provincePerformance: Array<{ province: string } & MetricSet>;
  issues: string[]; note: string; observedAt?: string;
};

const metricLabels: Record<MetricName, string> = {
  prediction: "DengueYosoku Model", persistence: "Persistence",
  seasonal_naive: "Seasonal Naive", climatology: "Climatology",
};

function dateLabel(value: string | null) {
  if (!value) return "ไม่มีข้อมูล";
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("th-TH");
}
function numberLabel(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

export function ModelTemporalMonitorPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/model/temporal-monitor", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "โหลดรายงานแนวโน้ม Model ไม่สำเร็จ");
      setReport(payload as Report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const statusText = report?.status === "ready" ? "ข้อมูล Holdout พร้อมเปรียบเทียบ" : report?.status === "warning" ? "มีข้อจำกัดของข้อมูลที่ควรตรวจสอบ" : "ข้อมูล Holdout ยังไม่ผ่านการตรวจสอบ";
  const StatusIcon = report?.status === "ready" ? CheckCircle2 : report?.status === "warning" ? AlertTriangle : ShieldAlert;

  return (
    <section className="dg-card" style={{ marginTop: 20 }} aria-labelledby="model-temporal-monitor-title">
      <div className="dg-section-head">
        <div>
          <span className="dg-eyebrow"><Activity size={14} /> TEMPORAL PERFORMANCE MONITOR</span>
          <h2 id="model-temporal-monitor-title">แนวโน้มความคลาดเคลื่อนของ Model</h2>
          <p>เปรียบเทียบ Holdout 4 สัปดาห์ล่าสุดกับ 4 สัปดาห์ก่อนหน้า พร้อม Baseline และความคลาดเคลื่อนรายจังหวัด</p>
        </div>
        <button type="button" className="dg-chip" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "กำลังตรวจสอบ" : "ตรวจสอบอีกครั้ง"}
        </button>
      </div>
      {loading && <p role="status">กำลังวิเคราะห์ Holdout…</p>}
      {error && <div role="alert" className="dg-note"><AlertTriangle size={17} /> {error}</div>}
      {report && !loading && (
        <>
          <div className="dg-note" style={{ marginTop: 14 }}>
            <StatusIcon size={19} />
            <div><strong>{statusText}</strong><div>{report.completeWeekCount} สัปดาห์ครบ 77 จังหวัด · {report.historyRowCount.toLocaleString("th-TH")} แถวที่ตรวจได้</div></div>
          </div>
          <div className="dg-grid" style={{ marginTop: 14 }}>
            <article className="dg-card"><span className="dg-source-meta">Holdout ชุดแรก</span><h3>{dateLabel(report.firstCompleteWeek)}</h3></article>
            <article className="dg-card"><span className="dg-source-meta">Holdout ล่าสุด</span><h3>{dateLabel(report.lastCompleteWeek)}</h3></article>
            <article className="dg-card"><span className="dg-source-meta">สัปดาห์ไม่ครบ</span><h3>{report.incompleteWeekCount}</h3></article>
          </div>
          {report.comparison ? (
            <div style={{ marginTop: 18 }}>
              <div className="dg-section-head"><div><h3>เปรียบเทียบช่วงเวลา</h3><p>ก่อนหน้า {dateLabel(report.comparison.previousStartWeek)} – {dateLabel(report.comparison.previousEndWeek)} · ล่าสุด {dateLabel(report.comparison.recentStartWeek)} – {dateLabel(report.comparison.recentEndWeek)}</p></div></div>
              <div className="dg-grid-2">
                {(Object.keys(metricLabels) as MetricName[]).map((key) => {
                  const previous = report.comparison!.previous[key];
                  const recent = report.comparison!.recent[key];
                  return <article className="dg-card" key={key}>
                    <strong>{metricLabels[key]}</strong>
                    <div className="dg-source-meta" style={{ marginTop: 8 }}>MAE · ก่อนหน้า / ล่าสุด</div>
                    <h3>{numberLabel(previous.mae)} / {numberLabel(recent.mae)}</h3>
                    <div className="dg-source-meta">RMSE: {numberLabel(previous.rmse)} / {numberLabel(recent.rmse)}</div>
                    <div className="dg-source-meta">Bias: {numberLabel(previous.bias)} / {numberLabel(recent.bias)}</div>
                  </article>;
                })}
              </div>
              <div className="dg-note" style={{ marginTop: 12 }}>
                <Activity size={18} />
                <div><strong>การเปลี่ยนแปลง MAE ของ Model</strong><div>{report.comparison.modelMaeDirection === "higher-error" ? "MAE สูงขึ้นในช่วงล่าสุด" : report.comparison.modelMaeDirection === "lower-error" ? "MAE ลดลงในช่วงล่าสุด" : "MAE ใกล้เคียงเดิม"} · เปลี่ยนแปลง {report.comparison.modelMaeChangePercent === null ? "คำนวณเป็นร้อยละไม่ได้" : `${numberLabel(report.comparison.modelMaeChangePercent)}%`}</div></div>
              </div>
            </div>
          ) : <p className="dg-note" style={{ marginTop: 14 }}>ข้อมูลที่ครบ 77 จังหวัดยังไม่ถึง 8 สัปดาห์ จึงยังเปรียบเทียบช่วงเวลาไม่ได้</p>}
          <div style={{ marginTop: 20 }}>
            <h3>แนวโน้ม MAE รายสัปดาห์ (12 สัปดาห์ล่าสุด)</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
                <thead><tr>{["สัปดาห์เริ่มต้น", "ตัวอย่าง", "MAE", "RMSE", "Bias"].map((label) => <th key={label} style={{ textAlign: "left", padding: 9, borderBottom: "1px solid var(--border, #dce7e4)" }}>{label}</th>)}</tr></thead>
                <tbody>{report.weekly.map((item) => <tr key={item.weekStart}>
                  <td style={{ padding: 9, borderBottom: "1px solid var(--border, #edf2f0)" }}>{dateLabel(item.weekStart)}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid var(--border, #edf2f0)" }}>{item.sampleCount}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid var(--border, #edf2f0)" }}>{numberLabel(item.mae)}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid var(--border, #edf2f0)" }}>{numberLabel(item.rmse)}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid var(--border, #edf2f0)" }}>{numberLabel(item.bias)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <h3>จังหวัดที่มี MAE สูงสุด 10 อันดับใน Holdout</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead><tr>{["จังหวัด", "จำนวนตัวอย่าง", "MAE", "RMSE", "Bias"].map((label) => <th key={label} style={{ textAlign: "left", padding: 9, borderBottom: "1px solid var(--border, #dce7e4)" }}>{label}</th>)}</tr></thead>
                <tbody>{report.provincePerformance.map((item) => <tr key={item.province}>
                  <td style={{ padding: 9, borderBottom: "1px solid var(--border, #edf2f0)" }}>{item.province}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid var(--border, #edf2f0)" }}>{item.sampleCount}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid var(--border, #edf2f0)" }}>{numberLabel(item.mae)}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid var(--border, #edf2f0)" }}>{numberLabel(item.rmse)}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid var(--border, #edf2f0)" }}>{numberLabel(item.bias)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
          {report.issues.length > 0 && <div className="dg-note" style={{ marginTop: 14 }}><AlertTriangle size={17} /><div><strong>ข้อสังเกต</strong><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{report.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div></div>}
          <div className="dg-source-meta" style={{ marginTop: 14 }}><Clock3 size={13} /> {report.note}</div>
        </>
      )}
    </section>
  );
}
