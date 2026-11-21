"use client";

import { useEffect, useMemo } from "react";
import type * as L from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Feature, FeatureCollection } from "geojson";
import type { GeoJsonData, ModelMapRow } from "@/lib/types";
import { normalizeProvince } from "@/lib/utils";

const RISK_COLORS = {
  normal: "#2f9e63",
  watch: "#f0b429",
  alert: "#d94848",
  noThreshold: "#aeb8c4",
  noData: "#cbd3dc",
} as const;

type RiskBand = "normal" | "watch" | "alert" | "no-threshold";

function FitThailand() {
  const map = useMap();
  useEffect(() => {
    map.setView([15.2, 101.0], 5.4);
  }, [map]);
  return null;
}

function formatCases(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? "ไม่มีข้อมูล"
    : value.toLocaleString("th-TH", { maximumFractionDigits: 1 }) + " ราย";
}

function getRiskBand(row: ModelMapRow): RiskBand {
  if (
    row.watch_threshold === null || row.watch_threshold === undefined ||
    row.alert_threshold === null || row.alert_threshold === undefined
  ) return "no-threshold";
  if (row.prediction >= row.alert_threshold) return "alert";
  if (row.prediction >= row.watch_threshold) return "watch";
  return "normal";
}

function riskColor(row: ModelMapRow) {
  const band = getRiskBand(row);
  if (band === "normal") return RISK_COLORS.normal;
  if (band === "watch") return RISK_COLORS.watch;
  if (band === "alert") return RISK_COLORS.alert;
  return RISK_COLORS.noThreshold;
}

function formatThreshold(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "ไม่มีเกณฑ์"
    : value.toLocaleString("th-TH", { maximumFractionDigits: 1 }) + " ราย";
}

export function ModelThailandMap({
  geo,
  rows,
}: {
  geo: GeoJsonData;
  rows: ModelMapRow[];
}) {
  const byProvince = useMemo(() => {
    const result = new Map<string, ModelMapRow>();
    rows.forEach((row) => result.set(normalizeProvince(row.province), row));
    return result;
  }, [rows]);

  const geoJson = geo as unknown as FeatureCollection;
  const boundaryProvinces = useMemo(
    () => new Set(
      geo.features
        .map((feature) => normalizeProvince(feature.properties?.pro_th))
        .filter(Boolean),
    ),
    [geo],
  );
  const unmatchedProvinces = useMemo(
    () => rows
      .filter((row) => !boundaryProvinces.has(normalizeProvince(row.province)))
      .map((row) => row.province),
    [rows, boundaryProvinces],
  );
  const matchedProvinceCount = rows.length - unmatchedProvinces.length;

  const style = (feature?: Feature) => {
    const provinceName = String(feature?.properties?.pro_th ?? "");
    const row = byProvince.get(normalizeProvince(provinceName));
    return {
      fillColor: row
        ? riskColor(row)
        : RISK_COLORS.noData,
      weight: 1.1,
      opacity: 1,
      color: "#ffffff",
      dashArray: "",
      fillOpacity: row ? 0.86 : 0.32,
    };
  };

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    const name = String(feature.properties?.pro_th ?? "ไม่ทราบจังหวัด");
    const row = byProvince.get(normalizeProvince(name));
    const band = row ? getRiskBand(row) : "no-threshold";
    const riskLabel = band === "alert" ? "เตือนระบาด (เกณฑ์ทดลอง)" : band === "watch" ? "เฝ้าระวัง (เกณฑ์ทดลอง)" : band === "normal" ? "ปกติ (เกณฑ์ทดลอง)" : "ไม่มีเกณฑ์ทดลอง";
    const label = row
      ? [
          name,
          "AI คาดการณ์ " + formatCases(row.prediction),
          "ระดับ " + riskLabel,
          "P75 เฝ้าระวัง " + formatThreshold(row.watch_threshold),
          "P90 เตือน " + formatThreshold(row.alert_threshold),
          row.actual_cases === null ? "ยังไม่มีค่าจริงรายจังหวัดของสัปดาห์พยากรณ์" : "ผู้ป่วยจริง " + formatCases(row.actual_cases),
          row.persistence === null ? "" : "Persistence " + formatCases(row.persistence),
        ].filter(Boolean).join(" · ")
      : name + " · ไม่มีข้อมูลในสัปดาห์ที่เลือก";

    (layer as L.Layer & { bindTooltip: (content: string, options?: object) => unknown })
      .bindTooltip(label, { sticky: true, direction: "auto" });
  };

  const mapKey = rows.map((row) => row.province + ":" + row.prediction).join("|");

  return (
    <>
    <div className="map-wrap">
      <MapContainer
        center={[15.2, 101.0]}
        zoom={5.4}
        minZoom={4.5}
        maxZoom={9}
        scrollWheelZoom={false}
        zoomControl
        style={{ height: "100%", width: "100%", borderRadius: "16px" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GeoJSON
          key={mapKey}
          data={geoJson as any}
          style={style as any}
          onEachFeature={onEachFeature as any}
        />
        <FitThailand />
      </MapContainer>
    </div>
    <p className="panel-note" role={unmatchedProvinces.length ? "alert" : "status"}>
      จับคู่ข้อมูลกับขอบเขตแผนที่ได้ {matchedProvinceCount} / {rows.length} จังหวัด
      {unmatchedProvinces.length
        ? ` · ไม่พบขอบเขตสำหรับ: ${unmatchedProvinces.join(", ")}`
        : " · ชื่อจังหวัดตรงกับข้อมูลแผนที่ครบถ้วน"}
    </p>
    </>
  );
}
