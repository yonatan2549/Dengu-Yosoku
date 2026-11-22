"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Check, CircleCheck, Download, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import type { AlertLifecycleAction, AlertLifecycleEvent, AlertLifecycleStatus } from "@/lib/alerting/lifecycle";

type DatabaseStatus = "loading" | "connected" | "unauthenticated" | "forbidden" | "unavailable";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
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

export function AlertEventLifecyclePanel() {
  const [events, setEvents] = useState<AlertLifecycleEvent[]>([]);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>("loading");
  const [message, setMessage] = useState("");
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [provinceQuery, setProvinceQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AlertLifecycleStatus>("all");
  const [levelFilter, setLevelFilter] = useState<"all" | "WATCH" | "ALERT">("all");

  const loadEvents = useCallback(async () => {
    setDatabaseStatus("loading");
    try {
      // Let the session endpoint refresh an expired access token from the
      // HttpOnly refresh cookie before the reviewer-only API is called.
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json().catch(() => null) as { authenticated?: boolean; role?: string } | null;
      if (!sessionResponse.ok || !session?.authenticated) {
        setEvents([]);
        setMessage("กรุณาเข้าสู่ระบบเพื่ออ่าน Event Lifecycle");
        setDatabaseStatus("unauthenticated");
        return;
      }
      if (session.role !== "reviewer" && session.role !== "administrator") {
        setEvents([]);
        setMessage("บัญชีนี้ไม่มีสิทธิ์ Reviewer/Admin สำหรับอ่าน Event Lifecycle");
        setDatabaseStatus("forbidden");
        return;
      }
      const response = await fetch("/api/alerts/events", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { events?: AlertLifecycleEvent[]; error?: string } | null;
      if (!response.ok) {
        setEvents([]);
        setMessage(payload?.error ?? "โหลดเหตุการณ์จากฐานข้อมูลไม่สำเร็จ");
        setDatabaseStatus(response.status === 401 ? "unauthenticated" : response.status === 403 ? "forbidden" : "unavailable");
        return;
      }
      setEvents(Array.isArray(payload?.events) ? payload.events : []);
      setMessage("");
      setDatabaseStatus("connected");
    } catch {
      setEvents([]);
      setMessage("ไม่สามารถติดต่อ API ของ Alert Center ได้");
      setDatabaseStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    void loadEvents();
    const refresh = () => { void loadEvents(); };
    window.addEventListener("dy:alerts-updated", refresh);
    return () => window.removeEventListener("dy:alerts-updated", refresh);
  }, [loadEvents]);

  async function applyAction(event: AlertLifecycleEvent, action: AlertLifecycleAction) {
    if (!event.databaseId) {
      setMessage("เหตุการณ์นี้ไม่มี Database ID จึงไม่สามารถเปลี่ยนสถานะในฐานข้อมูลได้");
      return;
    }
    const note = action === "resolve"
      ? resolutionNotes[event.eventId] ?? ""
      : action === "acknowledge"
        ? "ผู้ทบทวนรับทราบเหตุการณ์ผ่าน DengueYosoku"
        : "ผู้ทบทวนเปิดเหตุการณ์อีกครั้งเพื่อทบทวนข้อมูล";
    if (action === "resolve" && note.trim().length < 3) return;

    setBusyEventId(event.eventId);
    setMessage("");
    try {
      // Refresh the HttpOnly-backed session before a potentially long-lived
      // page sends a state-changing request.
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json().catch(() => null) as { authenticated?: boolean; role?: string } | null;
      if (!sessionResponse.ok || !session?.authenticated) {
        setMessage("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
        setDatabaseStatus("unauthenticated");
        return;
      }
      if (session.role !== "reviewer" && session.role !== "administrator") {
        setMessage("บัญชีนี้ไม่มีสิทธิ์ Reviewer/Admin สำหรับเปลี่ยนสถานะ");
        setDatabaseStatus("forbidden");
        return;
      }
      const response = await fetch(`/api/alerts/events/${encodeURIComponent(event.databaseId)}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "เปลี่ยนสถานะเหตุการณ์ไม่สำเร็จ");
        return;
      }
      await loadEvents();
      setResolutionNotes((previous) => ({ ...previous, [event.eventId]: "" }));
    } catch {
      setMessage("ไม่สามารถส่งคำสั่งเปลี่ยนสถานะไปยังเซิร์ฟเวอร์ได้");
    } finally {
      setBusyEventId(null);
    }
  }

  function exportEvents() {
    if (!events.length) return;
    const payload = {
      product: "DengueYosoku",
      exportType: "supabase_alert_event_lifecycle",
      storageScope: "central_database",
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

  const databaseLabel = databaseStatus === "connected"
    ? "เชื่อมต่อฐานข้อมูลกลางแล้ว"
    : databaseStatus === "loading"
      ? "กำลังอ่านฐานข้อมูลกลาง"
      : databaseStatus === "unauthenticated"
        ? "ยังไม่ได้เข้าสู่ระบบ"
        : databaseStatus === "forbidden"
          ? "บัญชีนี้ไม่มีสิทธิ์ Reviewer/Admin"
          : "ฐานข้อมูลยังไม่พร้อมใช้งาน";

  return (
    <section className="alert-lifecycle-section" aria-label="การจัดการวงจรเหตุการณ์แจ้งเตือน">
      <div className="alert-audit-toolbar">
        <div>
          <h3><Activity size={16} aria-hidden="true" /> วงจรเหตุการณ์ (Event Lifecycle)</h3>
          <p>รายการและประวัติสถานะอ่านจาก Supabase กลาง ไม่ผูกกับเบราว์เซอร์เครื่องใดเครื่องหนึ่ง</p>
        </div>
        <div className="alert-lifecycle-controls">
          <button type="button" className="button button-secondary" onClick={() => void loadEvents()} disabled={databaseStatus === "loading"}>
            <RefreshCw size={15} /> รีเฟรช
          </button>
          <button type="button" className="button button-secondary" onClick={exportEvents} disabled={!events.length}>
            <Download size={15} /> ส่งออก Events
          </button>
        </div>
      </div>

      <div className={databaseStatus === "connected" ? "historical-notice" : "inline-callout warning"}>
        <ShieldAlert size={16} />
        <span><strong>{databaseLabel}</strong>{message ? ` · ${message}` : " · การเปลี่ยนสถานะจะบันทึกพร้อมผู้กระทำและเวลาใน Audit trail"}</span>
      </div>

      <div className="alert-lifecycle-summary">
        <span>ทั้งหมด <strong>{events.length}</strong></span>
        <span>กำลังติดตาม <strong>{activeCount}</strong></span>
        <span>ปิดแล้ว <strong>{resolvedCount}</strong></span>
      </div>

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
                  <span className={event.level === "ALERT" ? "risk-pill risk-high" : "risk-pill risk-watch"}>{event.level}</span>
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
                  <button type="button" className="button button-secondary" onClick={() => void applyAction(event, "acknowledge")} disabled={busyEventId === event.eventId}>
                    <Check size={14} /> รับทราบ
                  </button>
                )}
                {event.status === "acknowledged" && (
                  <div className="alert-lifecycle-resolve">
                    <input
                      type="text"
                      value={resolutionNotes[event.eventId] ?? ""}
                      onChange={(change) => setResolutionNotes((previous) => ({ ...previous, [event.eventId]: change.target.value }))}
                      placeholder="เหตุผลที่ปิดเหตุการณ์ (อย่างน้อย 3 ตัวอักษร)"
                      aria-label={"เหตุผลปิดเหตุการณ์ " + event.province}
                    />
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void applyAction(event, "resolve")}
                      disabled={busyEventId === event.eventId || (resolutionNotes[event.eventId] ?? "").trim().length < 3}
                    >
                      <CircleCheck size={14} /> ปิดเหตุการณ์
                    </button>
                  </div>
                )}
                {event.status === "resolved" && (
                  <button type="button" className="button button-secondary" onClick={() => void applyAction(event, "reopen")} disabled={busyEventId === event.eventId}>
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
        <p className="panel-note">
          {databaseStatus === "connected"
            ? "ยังไม่มี Candidate event ในฐานข้อมูลกลาง เมื่อมี Rule Profile ที่ได้รับอนุมัติและผ่านเกณฑ์ ระบบจึงจะสร้างเหตุการณ์ให้ทบทวน"
            : "ยังไม่สามารถแสดงรายการเหตุการณ์ได้ โปรดตรวจสอบการเข้าสู่ระบบ สิทธิ์ Reviewer/Admin และ Migration ของฐานข้อมูล"}
        </p>
      )}

      <p className="alert-audit-footnote">
        รายการนี้เป็น Candidate จากการประเมินโมเดล ไม่ใช่การยืนยันการระบาด และไม่มีการส่ง LINE, Email, SMS หรือข้อความภายนอก
        ระบบไม่ปิดเหตุการณ์อัตโนมัติเมื่อไม่พบ Candidate ในรอบถัดไป การปิดต้องผ่านการรับทราบและบันทึกเหตุผลในฐานข้อมูล
      </p>
    </section>
  );
}
