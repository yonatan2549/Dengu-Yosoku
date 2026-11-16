"use client";

import { useEffect, useMemo } from "react";
import type * as L from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Feature, FeatureCollection } from "geojson";
import type { GeoJsonData, ModelMapRow } from "@/lib/types";
import { normalizeProvince } from "@/lib/utils";

const PREDICTION_COLORS = ["#e8f1fb", "#b8d3f0", "#78a9df", "#397fc4", "#174f91"];

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

function getQuantileThresholds(values: number[]) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return [];
  return [0.2, 0.4, 0.6, 0.8].map((fraction) => {
    const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction));
    return sorted[index];
  });
}

function predictionColor(value: number, thresholds: number[]) {
  if (!thresholds.length) return PREDICTION_COLORS[0];
  if (value <= thresholds[0]) return PREDICTION_COLORS[0];
  if (value <= thresholds[1]) return PREDICTION_COLORS[1];
  if (value <= thresholds[2]) return PREDICTION_COLORS[2];
  if (value <= thresholds[3]) return PREDICTION_COLORS[3];
  return PREDICTION_COLORS[4];
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

  const thresholds = useMemo(
    () => getQuantileThresholds(rows.map((row) => row.prediction)),
    [rows],
  );
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
        ? predictionColor(row.prediction, thresholds)
        : "#cbd3dc",
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
    const label = row
      ? [
          name,
          "AI คาดการณ์ " + formatCases(row.prediction),
          row.actual_cases === null ? "ยังไม่มีค่าจริงของสัปดาห์พยากรณ์" : "ผู้ป่วยจริง " + formatCases(row.actual_cases),
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
