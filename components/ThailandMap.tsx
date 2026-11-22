"use client";

import { useEffect, useMemo } from "react";
import type * as L from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Feature, FeatureCollection } from "geojson";
import type { ForecastRow, GeoJsonData } from "@/lib/types";
import { normalizeProvince, RISK_COLORS } from "@/lib/utils";

function FitThailand() {
  const map = useMap();
  useEffect(() => {
    map.setView([15.2, 101.0], 5.4);
  }, [map]);
  return null;
}

export function ThailandMap({
  geo,
  currentRows,
}: {
  geo: GeoJsonData;
  currentRows: ForecastRow[];
}) {
  const byProvince = useMemo(() => {
    const result = new Map<string, ForecastRow>();
    currentRows.forEach((row) => result.set(normalizeProvince(row.province), row));
    return result;
  }, [currentRows]);

  const geoJson = geo as unknown as FeatureCollection;
  const style = (feature?: Feature) => {
    const name = feature?.properties?.pro_th ?? "";
    const row = byProvince.get(normalizeProvince(name));
    const level = row?.level ?? "ไม่มีข้อมูล";
    return {
      fillColor: RISK_COLORS[level] ?? RISK_COLORS["ไม่มีข้อมูล"],
      weight: 1.1,
      opacity: 1,
      color: "#ffffff",
      dashArray: "",
      fillOpacity: row ? 0.78 : 0.34,
    };
  };

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    const name = String(feature.properties?.pro_th ?? "ไม่ทราบจังหวัด");
    const row = byProvince.get(normalizeProvince(name));
    const label = row
      ? `${name} · ${row.level} · คาดการณ์ ${Number(row.pred).toFixed(1)} ราย`
      : `${name} · ไม่มีข้อมูลพยากรณ์ในชุดข้อมูลนี้`;
    // Tooltip text comes from local project data, not user input.
    (layer as L.Layer & { bindTooltip: (content: string, options?: object) => unknown })
      .bindTooltip(label, { sticky: true, direction: "auto" });
  };

  return (
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
          key={currentRows.map((row) => `${row.province}-${row.level}-${row.pred}`).join("|")}
          data={geoJson as any}
          style={style as any}
          onEachFeature={onEachFeature as any}
        />
        <FitThailand />
      </MapContainer>
    </div>
  );
}
