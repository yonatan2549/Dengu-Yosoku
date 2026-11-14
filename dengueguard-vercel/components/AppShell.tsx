"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  BellRing,
  BookOpen,
  Bot,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Info,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import { SupportingPopup } from "@/components/SupportingPopup";
import { useDengueData } from "@/components/DataProvider";

const navigationGroups = [
  {
    title: "WORKSPACE",
    items: [
      { href: "/dashboard", label: "ภาพรวมสถานการณ์", sub: "Forecast dashboard", icon: LayoutDashboard },
      { href: "/prevention", label: "ป้องกันเชิงรุก", sub: "Early warning & prevention", icon: ShieldCheck },
      { href: "/symptom-checker", label: "ประเมินอาการเบื้องต้น", sub: "Symptom checker", icon: ClipboardCheck },
      { href: "/health-assistant", label: "AI Health Assistant", sub: "Dengue health companion", icon: Bot, badge: "NEW" },
    ],
  },
  {
    title: "LEARNING CENTER",
    items: [
      { href: "/knowledge", label: "Dengue Knowledge Hub", sub: "Articles, media & quiz", icon: BookOpen, badge: "NEW" },
    ],
  },
  {
    title: "INFORMATION",
    items: [
      { href: "/about", label: "About DengueGuard", sub: "Project & methodology", icon: Info },
      { href: "/references", label: "References & Sources", sub: "Trusted health resources", icon: FileText },
    ],
  },
];

const allNavigation = navigationGroups.flatMap((group) => group.items);
const dataRoutes = ["/", "/dashboard", "/prevention", "/symptom-checker"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data, loading, error } = useDengueData();
  const currentPage = allNavigation.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  const isDataRoute = dataRoutes.some(
    (route) => pathname === route || (route !== "/" && pathname.startsWith(route + "/")),
  );
  const latestDate = data?.predictions.map((row) => row.target_week_start).sort().at(-1);
  const pageLabel =
    currentPage?.label ?? (pathname === "/" ? "ภาพรวมสถานการณ์" : "DengueGuard");

  return (
    <div className="app-frame">
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop visible"
          aria-label="ปิดเมนู"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={"sidebar" + (mobileOpen ? " sidebar-open" : "")}>
        <Link href="/dashboard" className="brand-lockup" onClick={() => setMobileOpen(false)}>
          <div className="brand-mark">DG</div>
          <div className="brand-text">
            <strong>DengueGuard</strong>
            <span>INTELLIGENT HEALTH PLATFORM</span>
          </div>
        </Link>

        <nav className="side-nav" aria-label="เมนูหลัก">
          {navigationGroups.map((group) => (
            <div className="side-nav-group" key={group.title}>
              <div className="sidebar-section-label">{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/") ||
                  (item.href === "/dashboard" && pathname === "/");
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    className={"nav-item" + (active ? " active" : "")}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className="nav-icon"><Icon size={19} /></span>
                    <span className="nav-copy">
                      <strong>{item.label}</strong>
                      <small>{item.sub}</small>
                    </span>
                    {"badge" in item && item.badge && (
                      <span className="nav-badge">{item.badge}</span>
                    )}
                    {active && <ChevronRight size={16} className="nav-chevron" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <div className="note-icon"><BellRing size={16} /></div>
          <strong>ใช้ข้อมูลอย่างเข้าใจบริบท</strong>
          <p>
            ผลพยากรณ์เป็นข้อมูลเพื่อการเฝ้าระวังและวางแผนป้องกัน ไม่ใช่การยืนยันการระบาด
            หรือการวินิจฉัยรายบุคคล โปรดตรวจสอบวันที่ของข้อมูลทุกครั้ง
          </p>
        </div>
        <div className="sidebar-footer">
          <span className="status-dot" /> DengueGuard · สคร.4
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-button"
            aria-label={mobileOpen ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          <div className="mobile-brand">
            <div className="brand-mark small-mark">DG</div>
            <strong>DengueGuard</strong>
          </div>
          <div className="breadcrumb">
            <span>DengueGuard</span>
            <ChevronRight size={14} />
            <strong>{pageLabel}</strong>
          </div>
          <div className="topbar-right">
            <span className="topbar-status"><span className="status-dot" /> ระบบพร้อมใช้งาน</span>
            <span className="topbar-region">สคร.4 · 8 จังหวัด</span>
          </div>
        </header>

        {isDataRoute && error && (
          <div className="global-error">
            <strong>โหลดข้อมูลไม่สำเร็จ</strong><span>{error}</span>
          </div>
        )}

        {isDataRoute && loading ? (
          <main className="main-content">
            <div className="loading-card">
              <div className="spinner" />
              <strong>กำลังโหลดข้อมูล DengueGuard</strong>
              <span>กำลังเตรียมข้อมูลพยากรณ์ สภาพอากาศ และแบบประเมิน</span>
            </div>
          </main>
        ) : (
          <main className="main-content">{children}</main>
        )}

        <footer className="site-footer">
          <span><Activity size={14} /> DengueGuard · Proactive Dengue Health Platform</span>
          <span>
            {isDataRoute && latestDate
              ? "ข้อมูลพยากรณ์ล่าสุดในชุดข้อมูล: " +
                new Date(latestDate + "T00:00:00").toLocaleDateString("th-TH")
              : "ข้อมูลสุขภาพควรอ่านร่วมกับแหล่งอ้างอิงที่ระบุไว้"}
          </span>
        </footer>
      </div>

      {isDataRoute && !loading && !error && <SupportingPopup />}
    </div>
  );
}
