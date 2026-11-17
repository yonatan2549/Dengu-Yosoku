"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Check, CircleCheck, Download, RotateCcw, ShieldAlert } from "lucide-react";
import {
  ALERT_LIFECYCLE_STORAGE_KEY,
  readAlertLifecycleEvents,
  reconcileAlertLifecycle,
  transitionAlertLifecycleEvent,
  writeAlertLifecycleEvents,
  type AlertLifecycleAction,
  type AlertLifecycleEvent,
  type AlertLifecycleStatus,
} from "@/lib/alerting/lifecycle";
import type { AlertCandidateEvent } from "@/lib/alerting/types";

type StorageStatus = "loading" | "saved" | "unavailable";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function statusLabel(status: AlertLifecycleStatus): string {
  switch (status) {
    case "new": return "ใหม่";
    case "acknowledged": return "รับทราบแล้ว";
    case "resolved": return "ปิดแล้วโดยผู้ทบทวน";
    case "reopened": return "กลับมาพบอีก";
  }
}

function transitionLabel(kind: AlertLifecycleEvent["transitions"][number]["kind"]): string {
  switch (kind) {
    case "created": return "สร้างเหตุการณ์";
    case "acknowledged": return "รับทราบ";
    case "resolved": return "ปิดเหตุการณ์";
    case "reopened": return "เปิดเหตุการณ์อีกครั้ง";
    case "level_changed": return "ระดับสัญญาณเปลี่ยน";
  }
}

export function AlertEventLifecyclePanel({
  candidates,
  modelRevision,
}: {
  candidates: AlertCandidateEvent[];
  modelRevision: string | null;
}) {
  const [events, setEvents] = useState<AlertLifecycleEvent[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("loading");
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [provinceQuery, setProvinceQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AlertLifecycleStatus>("all");
  const [levelFilter, setLevelFilter] = useState<"all" | "WATCH" | "ALERT">("all");

  useEffect(() => {
    try {
      const storage = window.localStorage;
      const previous = readAlertLifecycleEvents(storage);
      const next = reconcileAlertLifecycle(previous, candidates, modelRevision);
      const saved = writeAlertLifecycleEvents(storage, next);
      setEvents(next);
      setStorageStatus(saved ? "saved" : "unavailable");
    } catch {
      const next = reconcileAlertLifecycle([], candidates, modelRevision);
      setEvents(next);
      setStorageStatus("unavailable");
    }
  }, [candidates, modelRevision]);

  function applyAction(eventId: string, action: AlertLifecycleAction) {
    const note = action === "resolve"
      ? resolutionNotes[eventId] ?? ""
      : action === "acknowledge"
        ? "ผู้ทบทวนรับทราบเหตุการณ์ในโหมดจำลอง"
        : "ผู้ทบทวนเปิดเหตุการณ์อีกครั้ง";
    const next = transitionAlertLifecycleEvent(events, eventId, action, note);
    if (next === events) return;

    setEvents(next);
    try {
      const saved = writeAlertLifecycleEvents(window.localStorage, next);
      setStorageStatus(saved ? "saved" : "unavailable");
    } catch {
      setStorageStatus("unavailable");
    }
  }

  function exportEvents() {
    if (!events.length) return;
    const payload = {
      product: "DengueYosoku",
      exportType: "browser_local_alert_event_lifecycle",
      storageKey: ALERT_LIFECYCLE_STORAGE_KEY,
      storageScope: "this_browser_only",
      exportedAtUtc: new Date().toISOString(),
      externalNotificationsEnabled: false,
      events,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dengueyosoku-alert-event-lifecycle.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const activeCount = events.filter((event) => event.status !== "resolved").length;
  const resolvedCount = events.length - activeCount;
  const filteredEvents = useMemo(() => {
    const query = provinceQuery.trim().toLocaleLowerCase("th");
    return events.filter((event) => {
      const matchesQuery = !query || event.province.toLocaleLowerCase("th").includes(query) || event.eventId.toLocaleLowerCase("en").includes(query);
      const matchesStatus = statusFilter === "all" || event.status === statusFilter;
      const matchesLevel = levelFilter === "all" || event.level === levelFilter;
      return matchesQuery && matchesStatus && matchesLevel;
    });
  }, [events, provinceQuery, statusFilter, levelFilter]);

  return (
    <section className="alert-lifecycle-section" aria-label="การจัดการวงจรเหตุการณ์แจ้งเตือนจำลอง">
      <div className="alert-audit-toolbar">
        <div>
          <h3><Activity size={16} aria-hidden="true" /> วงจรเหตุการณ์ (Event Lifecycle)</h3>
          <p>ติดตาม Candidate จำลอง รับทราบ และปิดเหตุการณ์โดยผู้ทบทวน พร้อมบันทึกการเปลี่ยนสถานะ</p>
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={exportEvents}
          disabled={!events.length}
        >
          <Download size={15} /> ส่งออก Events
        </button>
      </div>

      <div className="alert-lifecycle-summary">
        <span>ทั้งหมด <strong>{events.length}</strong></span>
        <span>กำลังติดตาม <strong>{activeCount}</strong></span>
        <span>ปิดแล้ว <strong>{resolvedCount}</strong></span>
      </div>

      {storageStatus === "unavailable" && (
        <p className="panel-note">ไม่สามารถบันทึก Event Lifecycle ในเบราว์เซอร์นี้ได้ การเปลี่ยนสถานะอาจไม่คงอยู่เมื่อปิดหน้าเว็บ</p>
      )}

      <div className="alert-lifecycle-filters">
        <label><span>ค้นหาจังหวัดหรือ Event ID</span><input type="search" value={provinceQuery} onChange={(change) => setProvinceQuery(change.target.value)} placeholder="พิมพ์ชื่อจังหวัดหรือรหัสเหตุการณ์" /></label>
        <label><span>สถานะ</span><select value={statusFilter} onChange={(change) => setStatusFilter(change.target.value as "all" | AlertLifecycleStatus)}><option value="all">ทุกสถานะ</option><option value="new">ใหม่</option><option value="acknowledged">รับทราบแล้ว</option><option value="resolved">ปิดแล้ว</option><option value="reopened">เปิดอีกครั้ง</option></select></label>
        <label><span>ระดับสัญญาณ</span><select value={levelFilter} onChange={(change) => setLevelFilter(change.target.value as "all" | "WATCH" | "ALERT")}><option value="all">ทุกระดับ</option><option value="WATCH">WATCH</option><option value="ALERT">ALERT</option></select></label>
      </div>

      {events.length ? (
        filteredEvents.length ? <div className="alert-lifecycle-list">
          {filteredEvents.slice(0, 50).map((event) => (
            <article className="alert-lifecycle-card" key={event.eventId}>
              <div className="alert-lifecycle-card-heading">
                <div>
                  <strong>{event.province}</strong>
                  <span className={event.level === "ALERT" ? "risk-pill risk-high" : "risk-pill risk-watch"}>
                    {event.level}
                  </span>
                  <span className="alert-lifecycle-status">{statusLabel(event.status)}</span>
                </div>
                <time dateTime={event.updatedAtUtc}>{formatTimestamp(event.updatedAtUtc)}</time>
              </div>

              <p>
                สัปดาห์เป้าหมาย {event.weekStart}
                {" · "}ค่าพยากรณ์ {event.predictedCases.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                {" · "}เกณฑ์ {event.threshold.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                {event.snapshotIsStale ? " · Snapshot ย้อนหลัง" : ""}
              </p>
              <small>Event ID: {event.eventId}</small>
              <small>
                Profile {event.ruleProfileVersion}
                {" · "}Model SHA {event.lastSeenModelRevision ? event.lastSeenModelRevision.slice(0, 12) : "ไม่มี"}
                {" · "}พบล่าสุด {formatTimestamp(event.lastSeenAtUtc)}
              </small>

              <div className="alert-lifecycle-controls">
                {(event.status === "new" || event.status === "reopened") && (
                  <button type="button" className="button button-secondary" onClick={() => applyAction(event.eventId, "acknowledge")}>
                    <Check size={14} /> รับทราบ
                  </button>
                )}
                {event.status === "acknowledged" && (
                  <div className="alert-lifecycle-resolve">
                    <input
                      type="text"
                      value={resolutionNotes[event.eventId] ?? ""}
                      onChange={(change) => setResolutionNotes((previous) => ({
                        ...previous,
                        [event.eventId]: change.target.value,
                      }))}
                      placeholder="เหตุผลที่ปิดเหตุการณ์ (อย่างน้อย 3 ตัวอักษร)"
                      aria-label={"เหตุผลปิดเหตุการณ์ " + event.province}
                    />
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => applyAction(event.eventId, "resolve")}
                      disabled={(resolutionNotes[event.eventId] ?? "").trim().length < 3}
                    >
                      <CircleCheck size={14} /> ปิดเหตุการณ์
                    </button>
                  </div>
                )}
                {event.status === "resolved" && (
                  <button type="button" className="button button-secondary" onClick={() => applyAction(event.eventId, "reopen")}>
                    <RotateCcw size={14} /> เปิดอีกครั้ง
                  </button>
                )}
              </div>

              <details className="alert-lifecycle-history">
                <summary><ShieldAlert size={13} /> ประวัติการเปลี่ยนสถานะ ({event.transitions.length})</summary>
                <ol>
                  {event.transitions.slice(-6).reverse().map((item) => (
                    <li key={item.id}>
                      <strong>{transitionLabel(item.kind)}</strong>
                      <time dateTime={item.atUtc}>{formatTimestamp(item.atUtc)}</time>
                      <span>{item.note}</span>
                      {item.fromLevel && item.toLevel && item.fromLevel !== item.toLevel && (
                        <span>ระดับ {item.fromLevel} → {item.toLevel}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            </article>
          ))}
        </div> : <p className="panel-note">ไม่พบเหตุการณ์ที่ตรงกับตัวกรองที่เลือก</p>
      ) : (
        <p className="panel-note">ยังไม่มี Candidate event ให้ติดตาม ขณะนี้ Rule Profile ยังเป็น Draft จึงยังไม่สร้างเหตุการณ์จำลอง</p>
      )}

      <p className="alert-audit-footnote">
        สถานะนี้เป็นการจัดการ Candidate ในโหมดจำลอง ไม่ใช่การยืนยันการระบาด ระบบจะไม่ปิดเหตุการณ์อัตโนมัติเมื่อไม่พบ Candidate ในรอบถัดไป
        ผู้ทบทวนต้องระบุเหตุผลก่อนปิด และการเปลี่ยนสถานะทั้งหมดเก็บไว้เฉพาะเบราว์เซอร์นี้
      </p>
    </section>
  );
}
