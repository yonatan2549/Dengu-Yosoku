"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, TrendingDown, TrendingUp } from "lucide-react";
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
import { buildModelPerformanceReport } from "@/lib/model/performance";
import type { ModelMetricsPayload, ModelPredictionsPayload } from "@/lib/types";

type SortMode = "mae_desc" | "skill_asc" | "bias_abs_desc";

function format(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatWeek(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export function ModelPerformanceDiagnostics({
  model,
  metrics,
}: {
  model: ModelPredictionsPayload;
  metrics: ModelMetricsPayload | null;
}) {
  const [sortMode, setSortMode] = useState<SortMode>("mae_desc");
  const report = useMemo(() => buildModelPerformanceReport(
    model.history,
    model.provinces,
    model.coverage.history_rows,
    model.coverage.history_week_count,
    metrics?.metrics ?? null,
  ), [model, metrics]);

  const displayedProvinces = useMemo(() => {
    const rows = [...report.provinces];
    if (sortMode === "skill_asc") {
      rows.sort((a, b) => (a.skillVsPersistencePct ?? -Infinity) - (b.skillVsPersistencePct ?? -Infinity));
    } else if (sortMode === "bias_abs_desc") {
      rows.sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));
    } else {
      rows.sort((a, b) => b.mae - a.mae);
    }
    return rows.slice(0, 12);
  }, [report.provinces, sortMode]);

  if (report.status !== "valid" || !report.aggregate) {
    return (
      <section className="panel model-performance-diagnostics" aria-live="polite">
        <div className="panel-heading"><div><div className="eyebrow">HOLDOUT ERROR ANALYSIS</div><h2>Model Performance · Error Diagnostics</h2><p>ตรวจความสอดคล้องของค่าประเมินจาก Holdout ก่อนแสดงการเปรียบเทียบรายจังหวัด</p></div><AlertTriangle size={20} /></div>
        <div className="inline-callout warning"><AlertTriangle size={17} /><span><strong>ยังไม่สามารถสรุป Performance ได้</strong><br />{report.errors.join(" · ") || "ข้อมูล Holdout ไม่สมบูรณ์"}</span></div>
      </section>
    );
  }

  const aggregate = report.aggregate;
  const worstProvince = report.provinces[0];
  const bestProvince = [...report.provinces].sort((a, b) => b.mae - a.mae).at(-1);

  return (
    <section className="panel model-performance-diagnostics" aria-live="polite">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">HOLDOUT ERROR ANALYSIS · {report.historyWeeks} WEEKS</div>
          <h2>Model Performance · Error Diagnostics</h2>
          <p>คำนวณใหม่จาก Holdout {report.historyRows.toLocaleString("th-TH")} แถว และตรวจเทียบกับ metrics.json</p>
        </div>
        {report.metricsMatch ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
      </div>

      <div className={report.metricsMatch ? "historical-notice" : "inline-callout warning"}>
        {report.metricsMatch ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
        <span>
          <strong>{report.metricsMatch ? "คำนวณซ้ำตรงกับ Metrics ต้นทาง" : "ยังยืนยัน Metrics ต้นทางไม่ได้"}</strong><br />
          {report.metricsMatch
            ? "MAE, RMSE และ Persistence MAE ที่คำนวณจาก Holdout ตรงกับ metrics.json ภายในค่าคลาดเคลื่อนที่กำหนด"
            : "ตรวจสอบ Model Snapshot และไฟล์ Metrics ก่อนนำตัวเลขไปใช้อ้างอิง"}
        </span>
      </div>

      <div className="metric-grid metric-grid-four model-performance-summary">
        <article className="metric-card"><div className="metric-card-top"><span>MAE · Model</span><span className="metric-icon blue">±</span></div><strong>{format(aggregate.mae, 3)}</strong><small>ราย · เฉลี่ยความคลาดเคลื่อนสัมบูรณ์</small></article>
        <article className="metric-card"><div className="metric-card-top"><span>RMSE · Model</span><span className="metric-icon amber">√</span></div><strong>{format(aggregate.rmse, 3)}</strong><small>ราย · ให้น้ำหนัก Error ขนาดใหญ่</small></article>
        <article className="metric-card"><div className="metric-card-top"><span>Persistence MAE</span><span className="metric-icon aqua">B</span></div><strong>{format(aggregate.persistenceMae, 3)}</strong><small>Baseline จากผู้ป่วยสัปดาห์ก่อน</small></article>
        <article className="metric-card"><div className="metric-card-top"><span>Skill vs Persistence</span><span className="metric-icon green">%</span></div><strong>{aggregate.skillVsPersistencePct === null ? "—" : `${format(aggregate.skillVsPersistencePct, 1)}%`}</strong><small>{aggregate.skillVsPersistencePct !== null && aggregate.skillVsPersistencePct >= 0 ? "MAE ต่ำกว่า Baseline" : "MAE ไม่ดีกว่า Baseline"}</small></article>
      </div>

      <div className="model-performance-bias-row">
        <span>Mean Bias (Prediction − Actual)</span>
        <strong>{aggregate.bias > 0 ? "Over-predicting" : aggregate.bias < 0 ? "Under-predicting" : "ใกล้เคียงไม่เอนเอียง"} · {aggregate.bias > 0 ? "+" : ""}{format(aggregate.bias, 3)} ราย</strong>
      </div>

      <div className="panel-heading model-performance-subheading">
        <div><h3>Error ตามสัปดาห์ Holdout</h3><p>เปรียบเทียบ MAE ของโมเดลกับ Persistence รายสัปดาห์</p></div>
      </div>
      <div className="model-performance-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={report.weekly.map((item) => ({ ...item, label: formatWeek(item.weekStart) }))} margin={{ top: 10, right: 18, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#edf0f4" />
            <XAxis dataKey="label" tick={{ fill: "#7a8797", fontSize: 10 }} minTickGap={26} />
            <YAxis tick={{ fill: "#7a8797", fontSize: 10 }} width={42} />
            <Tooltip formatter={(value) => `${format(Number(value), 2)} ราย`} labelFormatter={(label) => `สัปดาห์ ${label}`} />
            <Legend />
            <Line type="monotone" dataKey="mae" name="Model MAE" stroke="#2e73d2" strokeWidth={2.2} dot={false} />
            <Line type="monotone" dataKey="persistenceMae" name="Persistence MAE" stroke="#9aa5b3" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel-heading model-performance-subheading">
        <div><h3>ผลประเมินแยก 77 จังหวัด</h3><p>แสดง 12 จังหวัดตามรูปแบบการเรียงที่เลือก · แต่ละจังหวัดใช้ Holdout {report.historyWeeks} สัปดาห์</p></div>
      </div>
      <div className="model-performance-toolbar">
        <label className="field-control"><span>เรียงตาม</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
          <option value="mae_desc">MAE สูง → ต่ำ</option>
          <option value="skill_asc">Skill ต่ำ → สูง</option>
          <option value="bias_abs_desc">ขนาด Bias มาก → น้อย</option>
        </select></label>
      </div>
      <div className="table-scroll">
        <table className="data-table model-performance-table">
          <thead><tr><th>จังหวัด</th><th>ตัวอย่าง</th><th>MAE</th><th>RMSE</th><th>Bias</th><th>Persistence MAE</th><th>Skill</th></tr></thead>
          <tbody>
            {displayedProvinces.map((item) => (
              <tr key={item.province}>
                <td>{item.province}</td>
                <td className="numeric-cell">{item.rows}</td>
                <td className="numeric-cell">{format(item.mae, 2)}</td>
                <td className="numeric-cell">{format(item.rmse, 2)}</td>
                <td className="numeric-cell">{item.bias > 0 ? "+" : ""}{format(item.bias, 2)}</td>
                <td className="numeric-cell">{format(item.persistenceMae, 2)}</td>
                <td className="numeric-cell">{item.skillVsPersistencePct === null ? "—" : `${format(item.skillVsPersistencePct, 1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="model-performance-highlights">
        <div><TrendingUp size={16} /><span>MAE สูงสุดใน Holdout: <strong>{worstProvince?.province ?? "—"}</strong> ({format(worstProvince?.mae, 2)} ราย)</span></div>
        <div><TrendingDown size={16} /><span>MAE ต่ำสุดใน Holdout: <strong>{bestProvince?.province ?? "—"}</strong> ({format(bestProvince?.mae, 2)} ราย)</span></div>
      </div>

      <details className="model-performance-method">
        <summary><Info size={14} /> ข้อจำกัดและการตีความโมเดล</summary>
        <ul>
          <li>โมเดลนี้เป็น Weekly Nowcasting: ใช้ข้อมูลย้อนหลังถึงสัปดาห์ก่อนหน้าเพื่อประเมินสัปดาห์ถัดไป ไม่ใช่การพยากรณ์หลายสัปดาห์ล่วงหน้า</li>
          <li>เอกสาร Model Repository ระบุว่า Feature กลุ่ม Autoregressive มี Gain ประมาณ 93.7% และผลอาจตามจุดเปลี่ยนของสถานการณ์ประมาณหนึ่งสัปดาห์</li>
          <li>เลือก Quantile 0.5 เพื่อให้เหมาะกับ MAE ซึ่งเป็นการประมาณ Conditional Median; RMSE ให้น้ำหนักกับความผิดพลาดขนาดใหญ่ต่างจาก MAE</li>
          <li>Repository ระบุว่า RUN_OPTUNA ปิดอยู่ในค่าที่ใช้ส่งมอบ และ Holdout เคยถูกใช้ตรวจสอบมากกว่าหนึ่งการตั้งค่า จึงควรตีความผลอย่างระมัดระวัง</li>
          <li>ค่ารายจังหวัดเป็นผลย้อนหลังจาก Holdout ไม่ใช่ระดับความเสี่ยงปัจจุบัน และไม่ใช่หลักฐานว่าจังหวัดใดกำลังเกิดการระบาด</li>
        </ul>
      </details>
      <p className="alert-audit-footnote">การวิเคราะห์นี้ใช้เฉพาะ Holdout 94 สัปดาห์ที่แนบมา · MAE/RMSE วัดความผิดพลาดของจำนวนผู้ป่วย · Skill เทียบกับ Persistence · ผลนี้ไม่รับรองความแม่นยำของข้อมูลในอนาคต</p>
    </section>
  );
}
