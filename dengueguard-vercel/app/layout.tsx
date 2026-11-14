import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./platform.css";
import { DataProvider } from "@/components/DataProvider";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "DengueYosoku | Intelligent Dengue Health Platform",
  description:
    "แพลตฟอร์มสุขภาพดิจิทัลด้านไข้เลือดออก ครอบคลุมการเฝ้าระวัง การป้องกัน การคัดกรอง และการเรียนรู้",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <DataProvider>
          <AppShell>{children}</AppShell>
        </DataProvider>
      </body>
    </html>
  );
}
