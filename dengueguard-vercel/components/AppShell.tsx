"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  Moon,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { SupportingPopup } from "@/components/SupportingPopup";
import { AuthStatus } from "@/components/AuthStatus";
import { useDengueData } from "@/components/DataProvider";
import { getCurrentEpiWeekStart } from "@/lib/utils";

const navigationGroups = [
  {
    title: "WORKSPACE",
    items: [
      { href: "/dashboard", label: "ภาพรวมสถานการณ์", sub: "Forecast dashboard", icon: LayoutDashboard },
      { href: "/prevention", label: "ป้องกันเชิงรุก", sub: "Early warning & prevention", icon: ShieldCheck },
      { href: "/alerts", label: "ศูนย์จัดการเหตุการณ์", sub: "Alert event center", icon: BellRing },
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
      { href: "/about", label: "About DengueYosoku", sub: "Project & methodology", icon: Info },
      { href: "/references", label: "References & Sources", sub: "Trusted health resources", icon: FileText },
    ],
  },
];

const allNavigation = navigationGroups.flatMap((group) => group.items);
const dataRoutes = ["/", "/dashboard", "/prevention", "/symptom-checker"];
type Theme = "light" | "dark";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let initialTheme: Theme = "light";
    try {
      const savedTheme = window.localStorage.getItem("dengueyosoku-theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        initialTheme = savedTheme;
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        initialTheme = "dark";
      }
    } catch {
      // Continue with the light theme if browser storage is unavailable.
    }

    document.documentElement.dataset.theme = initialTheme;
    setTheme(initialTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);

    try {
      window.localStorage.setItem("dengueyosoku-theme", nextTheme);
    } catch {
      // The theme still changes for the current session if storage is unavailable.
    }
  };

  const { data, loading, error, modelWarning } = useDengueData();
  const currentPage = allNavigation.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  const isDataRoute = dataRoutes.some(
    (route) => pathname === route || (route !== "/" && pathname.startsWith(route + "/")),
  );
  const isModelRoute = pathname === "/" || pathname === "/dashboard" || pathname === "/prevention";
  const latestDate = data?.modelPredictions?.coverage.forecast_week ?? data?.predictions.map((row) => row.target_week_start).sort().at(-1);
  const currentEpiWeekStart = getCurrentEpiWeekStart();
  const modelForecastBehind = Boolean(
    data?.modelPredictions?.coverage.forecast_week &&
    data.modelPredictions.coverage.forecast_week < currentEpiWeekStart,
  );
  const pageLabel =
    currentPage?.label ?? (pathname === "/" ? "ภาพรวมสถานการณ์" : "DengueYosoku");

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
          <div className="brand-mark">DY</div>
          <div className="brand-text">
            <strong>DengueYosoku</strong>
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
          <span className="status-dot" /> DengueYosoku · {data?.modelPredictions ? "ทั่วประเทศ · 77 จังหวัด" : "สคร.4 · 8 จังหวัด"}
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
            <div className="brand-mark small-mark">DY</div>
            <strong>DengueYosoku</strong>
          </div>
          <div className="breadcrumb">
            <span>DengueYosoku</span>
            <ChevronRight size={14} />
            <strong>{pageLabel}</strong>
          </div>
          <div className="topbar-right">
            <AuthStatus />
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
              aria-pressed={theme === "dark"}
              title={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              <span>{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
            <span className="topbar-status"><span className="status-dot" /> {isModelRoute && modelWarning ? "ข้อมูลโมเดลต้องตรวจสอบ" : isModelRoute && modelForecastBehind ? "Forecast ไม่ใช่ข้อมูลปัจจุบัน" : "ระบบพร้อมใช้งาน"}</span>
            <span className="topbar-region">{data?.modelPredictions ? "ทั่วประเทศ · 77 จังหวัด" : "สคร.4 · 8 จังหวัด"}</span>
          </div>
        </header>

        {isDataRoute && error && (
          <div className="global-error">
            <strong>โหลดข้อมูลไม่สำเร็จ</strong><span>{error}</span>
          </div>
        )}
        {isModelRoute && !loading && modelWarning && (
          <div className="historical-notice">
            <Info size={17} />
            <span>{modelWarning}</span>
          </div>
        )}

        {isDataRoute && loading ? (
          <main className="main-content">
            <div className="loading-card">
              <div className="spinner" />
              <strong>กำลังโหลดข้อมูล DengueYosoku</strong>
              <span>กำลังเตรียมข้อมูลพยากรณ์ สภาพอากาศ และแบบประเมิน</span>
            </div>
          </main>
        ) : (
          <main className="main-content">{children}</main>
        )}

        <footer className="site-footer">
          <span><Activity size={14} /> DengueYosoku · Proactive Dengue Health Platform</span>
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
