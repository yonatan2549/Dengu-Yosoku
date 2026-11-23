"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Info,
  RotateCcw,
  Send,
  ShieldAlert,
} from "lucide-react";
import modelSnapshot from "@/public/data/model_predictions.json";
import {
  createAlertPresentationRun,
  summarizeAlertPresentationRun,
  transitionAlertPresentationEvent,
  type AlertPresentationEvent,
  type AlertPresentationEventStatus,
  type AlertPresentationRun,
  type AlertPresentationScenario,
} from "@/lib/alerting/presentation-demo";

const STORAGE_KEY = "dengueyosoku-alert-presentation-demo-v1";
const PROVINCES = modelSnapshot.provinces as string[];

type ReviewStatus =
  | "not_submitted"
  | "pending"
  | "approved_demo"
  | "changes_requested_demo"
  | "rejected_demo";

type StoredDemo = {
  run?: AlertPresentationRun;
  reviewStatus?: ReviewStatus;
  history?: string[];
};

const scenarioOptions: Array<{ value: AlertPresentationScenario; label: string }> = [
  { value: "mixed", label: "เหตุการณ์ผสม · มี WATCH และ ALERT" },
  { value: "alert-heavy", label: "เหตุการณ์ ALERT จำนวนมาก" },
  { value: "watch-only", label: "เฝ้าระวัง WATCH เท่านั้น" },
  { value: "normal", label: "ทุกจังหวัดอยู่ในตัวอย่างระดับปกติ" },
  { value: "partial", label: "ข้อมูลไม่ครบ · แสดงตัวอย่าง 54/77 จังหวัด" },
];

function isStoredRun(value: unknown): value is AlertPresentationRun {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AlertPresentationRun>;
  return typeof candidate.id === "string" &&
    Array.isArray(candidate.rows) &&
    Array.isArray(candidate.events) &&
    typeof candidate.generatedAt === "string" &&
    candidate.rows.every((row) => row && typeof row.province === "string") &&
    candidate.events.every((event) => event && typeof event.id === "string");
}

function formatTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function statusLabel(status: AlertPresentationEventStatus) {
  if (status === "acknowledged") return "รับทราบแล้ว";
  if (status === "resolved") return "ปิดเหตุการณ์";
  return "รอดำเนินการ";
}

function reviewLabel(status: ReviewStatus) {
  if (status === "pending") return "ส่งเข้าคิวทบทวน (จำลอง)";
  if (status === "approved_demo") return "ตัวอย่างผลทบทวน: ผ่าน";
  if (status === "changes_requested_demo") return "ตัวอย่างผลทบทวน: ขอแก้ไข";
  if (status === "rejected_demo") return "ตัวอย่างผลทบทวน: ไม่รับรอง";
  return "ยังไม่ส่งทบทวน";
}

export function AlertPresentationDemoPanel() {
  const [scenario, setScenario] = useState<AlertPresentationScenario>("mixed");
  const [watchThreshold, setWatchThreshold] = useState("25");
  const [alertThreshold, setAlertThreshold] = useState("55");
  const [run, setRun] = useState<AlertPresentationRun | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("not_submitted");
  const [history, setHistory] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "ALERT" | "WATCH">("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const stored = raw ? JSON.parse(raw) as StoredDemo : null;
      if (stored?.run && isStoredRun(stored.run)) {
        setRun(stored.run);
        setScenario(stored.run.scenario);
        if (stored.run.rows[0]) {
          setWatchThreshold(String(stored.run.rows[0].watchThreshold));
          setAlertThreshold(String(stored.run.rows[0].alertThreshold));
        }
        setReviewStatus(stored.reviewStatus ?? "not_submitted");
        setHistory(Array.isArray(stored.history) ? stored.history.slice(0, 12) : []);
        return;
      }
    } catch {
      // Start a fresh demo when browser storage is unavailable or invalid.
    }

    const initial = createAlertPresentationRun({
      provinces: PROVINCES,
      scenario: "mixed",
      watchThreshold: 25,
      alertThreshold: 55,
      generatedAt: new Date().toISOString(),
      id: `demo-${Date.now()}`,
    });
    setRun(initial);
    setHistory(["สร้างชุดข้อมูลตัวอย่างสำหรับสาธิต"]);
  }, []);

  useEffect(() => {
    if (!run) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ run, reviewStatus, history }));
    } catch {
      setMessage("เบราว์เซอร์ไม่อนุญาตให้บันทึกข้อมูลจำลอง การทำงานรอบนี้ยังใช้ได้");
    }
  }, [run, reviewStatus, history]);

  const summary = useMemo(() => run ? summarizeAlertPresentationRun(run) : null, [run]);
  const visibleEvents = useMemo(() => {
    if (!run) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    return run.events.filter((event) => (
      (filter === "all" || event.level === filter) &&
      (!normalizedQuery || event.province.toLocaleLowerCase("th").includes(normalizedQuery))
    ));
  }, [run, filter, query]);

  function runSimulation() {
    try {
      const next = createAlertPresentationRun({
        provinces: PROVINCES,
        scenario,
        watchThreshold: Number(watchThreshold),
        alertThreshold: Number(alertThreshold),
        generatedAt: new Date().toISOString(),
        id: `demo-${Date.now()}`,
      });
      setRun(next);
      setReviewStatus("not_submitted");
      setHistory((current) => [
        `สร้างผลจำลองใหม่: ${scenarioOptions.find((item) => item.value === scenario)?.label ?? scenario}`,
        ...current,
      ].slice(0, 12));
      setMessage("สร้างผลจำลองสำเร็จ · ข้อมูลนี้ใช้ประกอบการนำเสนอเท่านั้น");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถสร้างข้อมูลจำลองได้");
    }
  }

  function updateEvent(event: AlertPresentationEvent, action: "acknowledge" | "resolve" | "reopen") {
    if (!run) return;
    const nextEvents = transitionAlertPresentationEvent(run.events, event.id, action);
    setRun({ ...run, events: nextEvents });
    const label = action === "acknowledge" ? "รับทราบเหตุการณ์" : action === "resolve" ? "ปิดเหตุการณ์" : "เปิดเหตุการณ์อีกครั้ง";
    setHistory((current) => [`${label}: ${event.province} (สาธิต)`, ...current].slice(0, 12));
  }

  function exportDemoReport() {
    if (!run) return;
    const header = ["province", "predicted_cases_demo", "watch_threshold_demo", "alert_threshold_demo", "level_demo"];
    const rows = run.rows.map((row) => [
      row.province, row.prediction, row.watchThreshold, row.alertThreshold, row.level,
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
    const csv = ["DEMO_ONLY_NOT_REAL_SURVEILLANCE_DATA", header.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dengueyosoku-alert-presentation-demo.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function clearDemo() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // State is still cleared in memory.
    }
    setRun(null);
    setReviewStatus("not_submitted");
    setHistory([]);
    setMessage("ล้างข้อมูลจำลองแล้ว");
    window.setTimeout(() => {
      const next = createAlertPresentationRun({
        provinces: PROVINCES,
        scenario: "mixed",
        watchThreshold: 25,
        alertThreshold: 55,
        generatedAt: new Date().toISOString(),
        id: `demo-${Date.now()}`,
      });
      setRun(next);
      setScenario("mixed");
      setWatchThreshold("25");
      setAlertThreshold("55");
    }, 0);
  }

  return (
    <section className="panel alert-presentation-demo" aria-labelledby="alert-demo-title">
      <div className="alert-demo-heading">
        <div>
          <span className="alert-demo-eyebrow"><Activity size={14} /> PRESENTATION SANDBOX</span>
          <h2 id="alert-demo-title">สนามจำลองระบบแจ้งเตือนระดับประเทศ</h2>
          <p>ทดลองสร้างผลประเมิน ดูรายการเหตุการณ์ และสาธิตการจัดการสถานะ โดยไม่กระทบระบบแจ้งเตือนจริง</p>
        </div>
        <span className="alert-demo-stamp"><ShieldAlert size={15} /> DEMO ONLY</span>
      </div>

      <div className="alert-demo-safety-banner" role="note">
        <Info size={18} />
        <div>
          <strong>ข้อมูลจำลองเพื่อการนำเสนอเท่านั้น</strong>
          <p>ค่าพยากรณ์ เกณฑ์ และสถานะ WATCH/ALERT สร้างขึ้นเพื่อทดสอบหน้าจอ ไม่ใช่ข้อมูลผู้ป่วยจริง ไม่ใช่ผลวิเคราะห์การระบาด และไม่สามารถใช้ตัดสินใจด้านสาธารณสุขได้</p>
        </div>
      </div>

      <div className="alert-demo-controls">
        <label>
          <span>สถานการณ์จำลอง</span>
          <select value={scenario} onChange={(event) => setScenario(event.target.value as AlertPresentationScenario)}>
            {scenarioOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>เกณฑ์ WATCH (ตัวอย่าง)</span>
          <input type="number" min="0" step="1" value={watchThreshold} onChange={(event) => setWatchThreshold(event.target.value)} />
        </label>
        <label>
          <span>เกณฑ์ ALERT (ตัวอย่าง)</span>
          <input type="number" min="1" step="1" value={alertThreshold} onChange={(event) => setAlertThreshold(event.target.value)} />
        </label>
        <button type="button" className="button button-primary" onClick={runSimulation}>
          <Activity size={16} /> จำลองการประเมิน
        </button>
      </div>

      {message && <div className="alert-demo-message" role="status">{message}</div>}

      {run && summary && (
        <>
          <div className="alert-demo-run-meta">
            <span>รอบจำลอง <strong>{run.id}</strong></span>
            <span>สร้างเมื่อ {formatTime(run.generatedAt)}</span>
            <span>ข้อมูลจังหวัด <strong>{summary.evaluatedProvinceCount}/{summary.provinceCount}</strong></span>
          </div>

          <div className="alert-demo-kpis">
            <article><span>ข้อมูลที่ประเมิน</span><strong>{summary.evaluatedProvinceCount}/77</strong><small>จังหวัด</small></article>
            <article className="is-alert"><span>ALERT</span><strong>{summary.alertCount}</strong><small>รายการตัวอย่าง</small></article>
            <article className="is-watch"><span>WATCH</span><strong>{summary.watchCount}</strong><small>รายการตัวอย่าง</small></article>
            <article><span>เหตุการณ์ค้างดำเนินการ</span><strong>{summary.openCount}</strong><small>จาก {run.events.length} เหตุการณ์</small></article>
          </div>

          {summary.missingProvinceCount > 0 && (
            <div className="alert-demo-partial" role="status">
              <Info size={16} />
              ข้อมูลจำลองชุดนี้มีเพียง {summary.evaluatedProvinceCount}/77 จังหวัด · ขาด {summary.missingProvinceCount} จังหวัด จึงแสดงความครอบคลุมไม่ครบตามที่กำหนด
            </div>
          )}

          <div className="alert-demo-workflow">
            <div>
              <span className="alert-demo-section-label">REVIEW WORKFLOW · SIMULATED</span>
              <h3><ClipboardCheck size={17} /> ขั้นตอนการทบทวนเกณฑ์</h3>
              <p>{reviewLabel(reviewStatus)}</p>
            </div>
            {reviewStatus === "not_submitted" && (
              <button type="button" className="button button-secondary" onClick={() => {
                setReviewStatus("pending");
                setHistory((current) => ["ส่งตัวอย่างเข้าสู่ขั้นตอนทบทวน (สาธิต)", ...current].slice(0, 12));
              }}>
                <Send size={15} /> ส่งตัวอย่างทบทวน
              </button>
            )}
            {reviewStatus === "pending" && (
              <div className="alert-demo-review-actions">
                <button type="button" className="button button-secondary" onClick={() => {
                  setReviewStatus("approved_demo");
                  setHistory((current) => ["ผลทบทวนตัวอย่าง: ผ่าน", ...current].slice(0, 12));
                }}>ผ่าน (ตัวอย่าง)</button>
                <button type="button" className="button button-secondary" onClick={() => {
                  setReviewStatus("changes_requested_demo");
                  setHistory((current) => ["ผลทบทวนตัวอย่าง: ขอแก้ไข", ...current].slice(0, 12));
                }}>ขอแก้ไข</button>
                <button type="button" className="button button-danger" onClick={() => {
                  setReviewStatus("rejected_demo");
                  setHistory((current) => ["ผลทบทวนตัวอย่าง: ไม่รับรอง", ...current].slice(0, 12));
                }}>ไม่รับรอง</button>
              </div>
            )}
            {reviewStatus !== "not_submitted" && reviewStatus !== "pending" && (
              <button type="button" className="button button-secondary" onClick={() => setReviewStatus("not_submitted")}>
                <RotateCcw size={15} /> เริ่มขั้นตอนใหม่
              </button>
            )}
            <small>ปุ่มและผลทบทวนในส่วนนี้เป็นการจำลองบนเบราว์เซอร์ ไม่มีการสร้างคำขอหรือบันทึกการอนุมัติในฐานข้อมูลกลาง</small>
          </div>

          <div className="alert-demo-events-heading">
            <div>
              <span className="alert-demo-section-label">EVENT LIFECYCLE · LOCAL DEMO</span>
              <h3><BellRing size={17} /> เหตุการณ์จำลองรายจังหวัด</h3>
            </div>
            <div className="alert-demo-event-filters">
              <input aria-label="ค้นหาจังหวัดในเหตุการณ์จำลอง" placeholder="ค้นหาจังหวัด" value={query} onChange={(event) => setQuery(event.target.value)} />
              <select aria-label="กรองระดับเหตุการณ์" value={filter} onChange={(event) => setFilter(event.target.value as "all" | "ALERT" | "WATCH")}>
                <option value="all">ทุกระดับ</option>
                <option value="ALERT">ALERT</option>
                <option value="WATCH">WATCH</option>
              </select>
            </div>
          </div>

          <div className="alert-demo-event-list">
            {visibleEvents.length ? visibleEvents.slice(0, 18).map((event) => (
              <article className="alert-demo-event" key={event.id}>
                <div className="alert-demo-event-main">
                  <span className={event.level === "ALERT" ? "alert-demo-level alert-demo-level--alert" : "alert-demo-level alert-demo-level--watch"}>{event.level}</span>
                  <div>
                    <strong>{event.province}</strong>
                    <span>ค่าจำลอง {event.prediction.toLocaleString("th-TH")} · เกณฑ์ตัวอย่าง {event.threshold.toLocaleString("th-TH")}</span>
                  </div>
                </div>
                <div className="alert-demo-event-actions">
                  <span className={`alert-demo-event-status alert-demo-event-status--${event.status}`}>{statusLabel(event.status)}</span>
                  {event.status === "open" && <button type="button" className="button button-small button-secondary" onClick={() => updateEvent(event, "acknowledge")}>รับทราบ</button>}
                  {event.status !== "resolved" && <button type="button" className="button button-small button-secondary" onClick={() => updateEvent(event, "resolve")}>ปิดเหตุการณ์</button>}
                  {event.status === "resolved" && <button type="button" className="button button-small button-secondary" onClick={() => updateEvent(event, "reopen")}>เปิดใหม่</button>}
                </div>
              </article>
            )) : <div className="alert-demo-empty">ไม่พบเหตุการณ์ตามตัวกรองนี้ · ลองเปลี่ยนสถานการณ์จำลองหรือเงื่อนไขค้นหา</div>}
          </div>
          {visibleEvents.length > 18 && <p className="alert-demo-footnote">แสดง 18 จาก {visibleEvents.length} เหตุการณ์ที่ตรงกับตัวกรอง</p>}

          <div className="alert-demo-footer">
            <div><CheckCircle2 size={16} /><span>การแจ้งเตือนภายนอกถูกปิด · ไม่มี LINE, Email หรือ SMS</span></div>
            <div className="alert-demo-footer-actions">
              <button type="button" className="button button-secondary" onClick={exportDemoReport}><Download size={15} /> ส่งออกข้อมูลตัวอย่าง</button>
              <button type="button" className="button button-secondary" onClick={clearDemo}><RotateCcw size={15} /> รีเซ็ตตัวอย่าง</button>
            </div>
          </div>
          <details className="alert-demo-history">
            <summary>ประวัติการทดลองในเบราว์เซอร์นี้ ({history.length})</summary>
            <ol>{history.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol>
          </details>
        </>
      )}
    </section>
  );
}
