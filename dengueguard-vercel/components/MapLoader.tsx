"use client";

import dynamic from "next/dynamic";
import type { ForecastRow, GeoJsonData } from "@/lib/types";

const ThailandMap = dynamic(
  () => import("@/components/ThailandMap").then((module) => module.ThailandMap),
  {
    ssr: false,
    loading: () => <div className="map-placeholder"><div className="spinner" /><span>กำลังโหลดแผนที่ประเทศไทย</span></div>,
  },
);

export function MapLoader({ geo, currentRows }: { geo: GeoJsonData; currentRows: ForecastRow[] }) {
  return <ThailandMap geo={geo} currentRows={currentRows} />;
}
