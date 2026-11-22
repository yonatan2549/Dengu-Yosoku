"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, UserRound } from "lucide-react";

type SessionState = {
  configured: boolean;
  authenticated: boolean;
  user?: {
    id: string;
    email?: string;
  };
  role?: "viewer" | "reviewer" | "administrator" | string | null;
  displayName?: string | null;
};

const roleLabels: Record<string, string> = {
  viewer: "ผู้เยี่ยมชม",
  reviewer: "ผู้ทบทวน",
  administrator: "ผู้ดูแลระบบ",
};

export function AuthStatus() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error(`Session request failed (${response.status})`);
      }

      const value = (await response.json()) as SessionState;
      if (typeof value.authenticated !== "boolean") {
        throw new Error("Invalid session response");
      }

      setSession(value);
    } catch {
      // Keep a previously verified session on a transient refresh failure.
      setSession((previous) => previous ?? {
        configured: false,
        authenticated: false,
      });
    }
  }, []);

  useEffect(() => {
    void loadSession();

    // Login may use Next.js client-side navigation, which keeps AppShell mounted.
    // The login page dispatches this event after /api/auth/session verifies the new cookie.
    const handleAuthChange = () => void loadSession();
    const handleFocus = () => void loadSession();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadSession();
      }
    };

    window.addEventListener("dy:auth-change", handleAuthChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("dy:auth-change", handleAuthChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadSession]);

  async function logout() {
    setBusy(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      setSession({ configured: true, authenticated: false });
      window.dispatchEvent(new Event("dy:auth-change"));
      window.location.assign("/login");
    } catch {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <span className="topbar-auth muted">
        กำลังตรวจสอบบัญชี...
      </span>
    );
  }

  if (!session.configured || !session.authenticated) {
    return (
      <Link className="topbar-auth" href="/login">
        <LogIn size={15} />
        เข้าสู่ระบบ
      </Link>
    );
  }

  return (
    <div className="topbar-auth" title={session.user?.email ?? ""}>
      <UserRound size={15} />
      <span>{roleLabels[session.role ?? "viewer"] ?? "ผู้เยี่ยมชม"}</span>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        aria-label="ออกจากระบบ"
      >
        <LogOut size={15} />
      </button>
    </div>
  );
}
