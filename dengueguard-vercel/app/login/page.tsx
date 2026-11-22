
"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Activity, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูล");
        return;
      }

      // ตรวจสอบว่า Session หลัง Login ใช้งานได้จริง
const sessionResponse = await fetch("/api/auth/session", {
  cache: "no-store",
  credentials: "same-origin",
});

const session = await sessionResponse.json();

if (!sessionResponse.ok || session.authenticated !== true) {
  setError("เข้าสู่ระบบแล้ว แต่ยังตรวจสอบ Session ไม่สำเร็จ กรุณาลองอีกครั้ง");
  return;
}

// แจ้ง AuthStatus ให้อัปเดตสถานะบัญชีใหม่
window.dispatchEvent(new Event("dy:auth-change"));

      // Reload the page so AuthStatus fetches the new session.
      window.location.assign("/dashboard");
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบเข้าสู่ระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack" style={{ maxWidth: 480, margin: "36px auto" }}>
      <section className="panel" style={{ padding: 28 }}>
        <div className="heading-icon-card" style={{ marginBottom: 18 }}>
          <Activity size={26} />
          <span>DENGUEYOSOKU ACCOUNT</span>
        </div>

        <div className="eyebrow">SECURE REVIEWER ACCESS</div>

        <h1 style={{ marginTop: 8 }}>เข้าสู่ระบบ</h1>

        <p>
          สำหรับผู้ดูแลและผู้ทบทวนเหตุการณ์ DengueYosoku
        </p>

        <form
          onSubmit={submit}
          className="page-stack"
          style={{ gap: 14, marginTop: 22 }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span>อีเมล</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="dy-auth-input"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>รหัสผ่าน</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="กรอกรหัสผ่านของคุณ"
              className="form-input"
            />
          </label>

          {error && (
            <div className="inline-callout warning" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="dy-auth-submit"
            disabled={loading}
          >
            <LockKeyhole size={17} />
            {loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <p className="disclaimer-line" style={{ marginTop: 18 }}>
          บัญชีผู้ใช้ต้องได้รับการสร้างโดยผู้ดูแลระบบผ่าน Supabase
          ไม่มีการเปิดสมัครสมาชิกสาธารณะในขณะนี้
        </p>

        <Link href="/dashboard">
          กลับสู่หน้า Dashboard
        </Link>
      </section>
    </div>
  );
}
