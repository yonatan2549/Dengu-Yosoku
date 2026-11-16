"use client";

import dynamic from "next/dynamic";
import type { GeoJsonData, ModelMapRow } from "@/lib/types";

const ModelThailandMap = dynamic(
  () => import("@/components/ModelThailandMap").then((module) => module.ModelThailandMap),
  {
    ssr: false,
    loading: () => (
      <div className="map-placeholder">
        <div className="spinner" />
        <span>กำลังโหลดแผนที่ประเทศไทย</span>
      </div>
    ),
  },
);

export function ModelMapLoader({
  geo,
  rows,
}: {
  geo: GeoJsonData;
  rows: ModelMapRow[];
}) {
  if (!geo?.features?.length) {
    return <div className="map-placeholder">ไม่พบข้อมูลขอบเขตจังหวัดสำหรับแสดงแผนที่</div>;
  }

  return <ModelThailandMap geo={geo} rows={rows} />;
}
