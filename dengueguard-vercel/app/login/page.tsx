"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
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
        setError(result.error ?? "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("ไม่สามารถติดต่อระบบเข้าสู่ระบบได้");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack" style={{ maxWidth: 480, margin: "36px auto" }}>
      <section className="panel" style={{ padding: 28 }}>
        <div className="heading-icon-card" style={{ marginBottom: 18 }}>
          <Activity size={26} /><span>DENGUEYOSOKU ACCOUNT</span>
        </div>
        <div className="eyebrow">SECURE REVIEWER ACCESS</div>
        <h1 style={{ marginTop: 8 }}>เข้าสู่ระบบ</h1>
        <p>สำหรับผู้ดูแลและผู้ทบทวนเหตุการณ์ DengueYosoku</p>

        <form onSubmit={submit} className="page-stack" style={{ gap: 14, marginTop: 22 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>อีเมล</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="form-input"
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
              placeholder="รหัสผ่านบัญชี"
              className="form-input"
            />
          </label>
          {error && <div className="inline-callout warning" role="alert">{error}</div>}
          <button type="submit" className="primary-button" disabled={loading}>
            <LockKeyhole size={17} /> {loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <p className="disclaimer-line" style={{ marginTop: 18 }}>
          บัญชีผู้ใช้ต้องได้รับการสร้างโดยผู้ดูแลใน Supabase ก่อน ไม่มีการเปิดสมัครสมาชิกสาธารณะจากหน้านี้
        </p>
        <Link href="/dashboard">กลับสู่หน้า Dashboard</Link>
      </section>
    </div>
  );
}
