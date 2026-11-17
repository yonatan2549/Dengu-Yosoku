"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, UserRound } from "lucide-react";

type SessionState = {
  configured: boolean;
  authenticated: boolean;
  user?: { id: string; email?: string };
  role?: "viewer" | "reviewer" | "administrator" | string;
  displayName?: string | null;
};

const roleLabels: Record<string, string> = {
  viewer: "ผู้ใช้งาน",
  reviewer: "ผู้ทบทวน",
  administrator: "ผู้ดูแลระบบ",
};

export function AuthStatus() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: SessionState) => { if (active) setSession(value); })
      .catch(() => { if (active) setSession({ configured: false, authenticated: false }); });
    return () => { active = false; };
  }, []);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setSession({ configured: true, authenticated: false });
      window.location.assign("/login");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <span className="topbar-auth muted">กำลังตรวจสอบบัญชี...</span>;
  if (!session.configured) {
    return <Link className="topbar-auth" href="/login"><LogIn size={15} /> เข้าสู่ระบบ</Link>;
  }
  if (!session.authenticated) {
    return <Link className="topbar-auth" href="/login"><LogIn size={15} /> เข้าสู่ระบบ</Link>;
  }

  return (
    <div className="topbar-auth" title={session.user?.email ?? ""}>
      <UserRound size={15} />
      <span>{roleLabels[session.role ?? "viewer"] ?? "ผู้ใช้งาน"}</span>
      <button type="button" onClick={logout} disabled={busy} aria-label="ออกจากระบบ">
        <LogOut size={15} />
      </button>
    </div>
  );
}
