"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileSearch, ShieldAlert } from "lucide-react";
import candidate from "@/public/data/alert_threshold_candidates_77.json";

export function AlertThresholdAuditPanel() {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("th");
    return candidate.thresholds.filter((row) =>
      !normalized || row.province.toLocaleLowerCase("th").includes(normalized)
    );
  }, [query]);
  const review = candidate.computational_review;
  const sensitivity = review.leave_one_week_out_sensitivity;
  const temporal = review.temporal_split_validation;
  const predictionAudit = temporal.prediction_vs_observed_threshold_exceedance;
  const evaluationRows = [
    { level: "Watch", source: "Model forecast", micro: predictionAudit.micro.watch.model_forecast, macro: predictionAudit.macro_mean_across_77_provinces.watch.model_forecast },
    { level: "Watch", source: "Persistence", micro: predictionAudit.micro.watch.persistence_baseline, macro: predictionAudit.macro_mean_across_77_provinces.watch.persistence_baseline },
    { level: "Alert", source: "Model forecast", micro: predictionAudit.micro.alert.model_forecast, macro: predictionAudit.macro_mean_across_77_provinces.alert.model_forecast },
    { level: "Alert", source: "Persistence", micro: predictionAudit.micro.alert.persistence_baseline, macro: predictionAudit.macro_mean_across_77_provinces.alert.persistence_baseline },
  ];
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <section className="panel alert-performance-panel" aria-labelledby="alert-threshold-audit-title">
      <div className="panel-heading">
        <div>
          <h2 id="alert-threshold-audit-title"><FileSearch size={18} aria-hidden="true" /> 77-province Threshold Candidate Audit</h2>
          <p>แสดงค่าแนะนำรายจังหวัดและหลักฐานการคำนวณจาก Snapshot ที่มีอยู่</p>
        </div>
        <span className="risk-pill risk-watch">Draft · Not approved</span>
      </div>

      <div className="inline-callout warning" role="status">
        <ShieldAlert size={17} />
        <span>
          <strong>เกณฑ์ครบ 77 จังหวัดในระดับการคำนวณเท่านั้น</strong>
          <br />
          ค่าด้านล่างเป็น Candidate จากข้อมูลผู้ป่วยจริง 26 สัปดาห์ ไม่ใช่ threshold ที่ผ่านการอนุมัติหรือใช้ยืนยันการระบาด ระบบยังไม่สร้าง Alert Candidate และไม่จำแนกระดับความเสี่ยงทั่วประเทศ
        </span>
      </div>

      <div className="performance-grid">
        <div><span>จังหวัดที่คำนวณได้</span><strong>{candidate.thresholds.length}/77</strong></div>
        <div><span>Watch / Alert method</span><strong>P75 / P90</strong></div>
        <div><span>ข้อมูลผู้ป่วยย้อนหลัง</span><strong>{candidate.source.history_weeks} สัปดาห์</strong></div>
      </div>
      <div className="performance-grid">
        <div><span>Snapshot target week</span><strong>{candidate.source.forecast_week}</strong></div>
        <div><span>ข้อมูลจริงถึงสัปดาห์</span><strong>{candidate.source.history_end_week}</strong></div>
        <div><span>Fallback for tied quantiles</span><strong>{review.fallback_count} จังหวัด</strong></div>
      </div>

      <div className="inline-callout warning">
        <AlertTriangle size={16} />
        <span>
          <strong>Automated audit passed with limitations</strong>
          <br />
          Independent implementation ตรวจสูตรตรงกัน; leave-one-week-out median span ของ Alert {sensitivity.median_alert_threshold_span} ราย สูงสุด {sensitivity.max_alert_threshold_span} ราย และ temporal split 18/8 สัปดาห์พบค่าจริงเกิน Watch {temporal.observed_cases_at_or_above_watch}/{temporal.province_week_observations} ({temporal.observed_cases_at_or_above_watch_percent}%) · เกิน Alert {temporal.observed_cases_at_or_above_alert}/{temporal.province_week_observations} ({temporal.observed_cases_at_or_above_alert_percent}%). ช่วงฝึกมี fallback Watch + 1 รายสำหรับ {temporal.one_case_increment_fallback_count} จังหวัด ({temporal.one_case_increment_fallback_provinces.join(", ")}) เพราะ P75 เท่ากับค่าสูงสุดที่สังเกตได้ในชุดฝึก
        </span>
      </div>

      <div className="panel-heading">
        <div>
          <h3>Temporal holdout: Model forecast vs persistence</h3>
          <p>ตรวจการทำนาย threshold exceedance ใน {predictionAudit.sample_n} province-week observations · fit 18 สัปดาห์ / validate 8 สัปดาห์</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>เกณฑ์</th><th>ตัวทำนาย</th><th>Micro Precision</th><th>Micro Recall</th><th>Micro F1</th><th>Macro Recall (77 จังหวัด)</th></tr></thead>
          <tbody>
            {evaluationRows.map((row) => (
              <tr key={row.level + "-" + row.source}>
                <td>{row.level}</td>
                <td>{row.source}</td>
                <td className="numeric-cell">{percent(row.micro.precision)}</td>
                <td className="numeric-cell">{percent(row.micro.recall)}</td>
                <td className="numeric-cell">{percent(row.micro.f1)}</td>
                <td className="numeric-cell">{percent(row.macro.recall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inline-callout warning" role="status">
        <AlertTriangle size={16} />
        <span>
          Model forecast มี recall/F1 ต่ำกว่า persistence ใน temporal split นี้ โดยเฉพาะ macro Alert recall {percent(predictionAudit.macro_mean_across_77_provinces.alert.model_forecast.recall)} เทียบกับ persistence {percent(predictionAudit.macro_mean_across_77_provinces.alert.persistence_baseline.recall)} จึงยังไม่ผ่านเกณฑ์พร้อมใช้งาน Alert
        </span>
      </div>

      <label className="table-search">
        <span>ค้นหาจังหวัดในชุด Threshold Candidate</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="พิมพ์ชื่อจังหวัด..."
        />
      </label>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>จังหวัด</th><th>Watch (ราย/สัปดาห์)</th><th>Alert (ราย/สัปดาห์)</th><th>n</th><th>หมายเหตุ</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.province}>
                <td>{row.province}</td>
                <td className="numeric-cell">{row.watch.toLocaleString("th-TH", { maximumFractionDigits: 3 })}</td>
                <td className="numeric-cell">{row.alert.toLocaleString("th-TH", { maximumFractionDigits: 3 })}</td>
                <td>{row.observations}</td>
                <td>{row.fallback ? "ปรับ P90 เป็นค่าที่สังเกตได้ถัดไป" : "P75 / P90"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="alert-audit-footnote">
        Source model revision: {candidate.source.model_snapshot_revision} · source status: {candidate.source.model_snapshot_release_status} · computed from {candidate.source.history_rows.toLocaleString("en-US")} province-week observations. Human independent review: {candidate.governance.human_independent_review_status}; clinical review: {candidate.governance.clinical_review_status}.
      </p>
    </section>
  );
}
