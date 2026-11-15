"use client";

import { useEffect, useMemo, useState } from "react";
import type * as L from "leaflet";
import { GeoJSON, MapContainer, useMap } from "react-leaflet";
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

function MapZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();

  useEffect(() => {
    const updateZoom = () => onZoomChange(map.getZoom());
    updateZoom();
    map.on("zoomend", updateZoom);
    return () => {
      map.off("zoomend", updateZoom);
    };
  }, [map, onZoomChange]);

  return null;
}

export function ThailandMap({
  geo,
  currentRows,
}: {
  geo: GeoJsonData;
  currentRows: ForecastRow[];
}) {
  const [zoom, setZoom] = useState(5.4);
  // Keep the overview uncluttered; show Thai labels for forecast provinces
  // only after the user zooms in. Hover tooltips remain available at every zoom.
  const showProvinceLabels = zoom >= 6.5;

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
    const isPermanentLabel = Boolean(row && showProvinceLabels);
    const label = isPermanentLabel
      ? name
      : row
        ? `${name} · ${row.level} · คาดการณ์ ${Number(row.pred).toFixed(1)} ราย`
        : `${name} · ไม่มีข้อมูลพยากรณ์ในชุดข้อมูลนี้`;

    // Province names come from the project's Thai GeoJSON properties.
    (layer as L.Layer & { bindTooltip: (content: string, options?: object) => unknown })
      .bindTooltip(label, {
        permanent: isPermanentLabel,
        sticky: !isPermanentLabel,
        direction: isPermanentLabel ? "center" : "auto",
        className: isPermanentLabel ? "province-name-label" : "province-hover-tooltip",
        opacity: 1,
      });
  };

  const mapKey = currentRows
    .map((row) => `${row.province}-${row.level}-${row.pred}`)
    .join("|");

  return (
    <div className="map-wrap">
      <MapContainer
        center={[15.2, 101.0]}
        zoom={5.4}
        minZoom={4.5}
        maxZoom={9}
        scrollWheelZoom={false}
        zoomControl
        attributionControl={false}
        style={{ height: "100%", width: "100%", borderRadius: "16px" }}
      >
        <MapZoomTracker onZoomChange={setZoom} />
        <GeoJSON
          key={`${mapKey}-${showProvinceLabels ? "thai-labels" : "hover-labels"}`}
          data={geoJson as any}
          style={style as any}
          onEachFeature={onEachFeature as any}
        />
        <FitThailand />
      </MapContainer>
    </div>
  );
}
