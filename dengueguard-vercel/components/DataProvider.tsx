"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  DengueData,
  ModelMetricsPayload,
  ModelPredictionsPayload,
} from "@/lib/types";

interface DataContextValue {
  data: DengueData | null;
  loading: boolean;
  error: string | null;
  modelWarning: string | null;
}

interface OptionalJsonResult<T> {
  data: T | null;
  warning: string | null;
}

const DataContext = createContext<DataContextValue>({
  data: null,
  loading: true,
  error: null,
  modelWarning: null,
});

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error(`โหลดข้อมูล ${path} ไม่สำเร็จ (${response.status})`);
  return response.json() as Promise<T>;
}

// Model exports are optional: a missing or invalid model file must not block
// the legacy website systems from loading.
async function readOptionalJson<T>(path: string): Promise<OptionalJsonResult<T>> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (response.status === 404) return { data: null, warning: null };
    if (!response.ok) {
      return {
        data: null,
        warning: `โหลดไฟล์โมเดล ${path} ไม่สำเร็จ (HTTP ${response.status})`,
      };
    }
    return { data: await response.json() as T, warning: null };
  } catch (cause) {
    return {
      data: null,
      warning: cause instanceof Error
        ? `อ่านไฟล์โมเดล ${path} ไม่สำเร็จ: ${cause.message}`
        : `อ่านไฟล์โมเดล ${path} ไม่สำเร็จ`,
    };
  }
}

function inspectModelPayload(
  predictions: ModelPredictionsPayload | null,
  metrics: ModelMetricsPayload | null,
): {
  predictions: ModelPredictionsPayload | null;
  metrics: ModelMetricsPayload | null;
  warning: string | null;
} {
  if (!predictions) {
    return {
      predictions: null,
      metrics: null,
      warning: metrics ? "พบไฟล์ Metrics แต่ไม่พบไฟล์ผลพยากรณ์ จึงยังไม่ใช้โมเดลใหม่" : null,
    };
  }

  const problems: string[] = [];
  const provinceList = Array.isArray(predictions.provinces) ? predictions.provinces : [];
  const provinceSet = new Set(provinceList);

  if (predictions.schema_version >= 2) {
    if (!/^[a-f0-9]{40}$/i.test(predictions.model_revision ?? "")) {
      problems.push("ไม่พบ Model Commit SHA ที่ใช้ยืนยันชุดข้อมูล");
    }
    if (
      predictions.freshness?.timezone !== "Asia/Bangkok" ||
      !predictions.freshness?.source_retrieved_at_utc ||
      !predictions.freshness?.converted_at_utc
    ) {
      problems.push("ข้อมูลรุ่นนี้ขาด metadata สำหรับตรวจสอบที่มาและเวลา");
    }
  }

  if (predictions.province_count !== 77 || provinceList.length !== 77 || provinceSet.size !== 77) {
    problems.push("รายชื่อจังหวัดต้องครบ 77 จังหวัดและไม่ซ้ำกัน");
  }

  if (!Array.isArray(predictions.forecast) || predictions.forecast.length !== 77) {
    problems.push("ผลพยากรณ์ต้องมี 77 แถว");
  } else {
    const forecastProvinces = new Set<string>();
    const forecastWeeks = new Set<string>();
    for (const row of predictions.forecast) {
      if (!row || typeof row.province !== "string" || !provinceSet.has(row.province)) {
        problems.push("พบชื่อจังหวัดในผลพยากรณ์ที่ไม่ตรงกับรายชื่อจังหวัดหลัก");
        break;
      }
      if (forecastProvinces.has(row.province)) {
        problems.push("พบจังหวัดซ้ำในผลพยากรณ์");
        break;
      }
      forecastProvinces.add(row.province);
      forecastWeeks.add(row.week_start);
      if (typeof row.prediction !== "number" || !Number.isFinite(row.prediction) || row.prediction < 0) {
        problems.push("พบค่าพยากรณ์ที่ไม่ใช่ตัวเลขที่ถูกต้อง");
        break;
      }
    }
    if (forecastProvinces.size !== 77) problems.push("ผลพยากรณ์มีจังหวัดไม่ครบ");
    if (forecastWeeks.size !== 1 || !forecastWeeks.has(predictions.coverage?.forecast_week)) {
      problems.push("วันที่สัปดาห์พยากรณ์ไม่ตรงกันทั้งไฟล์");
    }
    if (predictions.coverage?.forecast_rows !== 77) {
      problems.push("จำนวนแถวพยากรณ์ใน metadata ไม่ตรงกับข้อมูลจริง");
    }
  }

  if (!Array.isArray(predictions.history) ||
      predictions.history.length !== predictions.coverage?.history_rows) {
    problems.push("จำนวนแถว Holdout ไม่ตรงกับ metadata");
  } else {
    const historyWeeks = new Set<string>();
    const weekProvinces = new Map<string, Set<string>>();
    const seen = new Set<string>();
    for (const row of predictions.history) {
      if (!row || typeof row.province !== "string" || !provinceSet.has(row.province)) {
        problems.push("พบจังหวัดใน Holdout ที่ไม่ตรงกับรายชื่อหลัก");
        break;
      }
      const key = row.week_start + "|" + row.province;
      if (seen.has(key)) {
        problems.push("พบข้อมูลจังหวัด/สัปดาห์ซ้ำใน Holdout");
        break;
      }
      seen.add(key);
      historyWeeks.add(row.week_start);
      const provinces = weekProvinces.get(row.week_start) ?? new Set<string>();
      provinces.add(row.province);
      weekProvinces.set(row.week_start, provinces);
      if (
        !Number.isFinite(row.actual_cases) || row.actual_cases < 0 ||
        !Number.isFinite(row.prediction) || row.prediction < 0 ||
        !Number.isFinite(row.persistence) || row.persistence < 0
      ) {
        problems.push("พบค่า Holdout ที่ไม่ใช่ตัวเลขที่ถูกต้อง");
        break;
      }
    }
    if (historyWeeks.size !== predictions.coverage?.history_week_count) {
      problems.push("จำนวนสัปดาห์ Holdout ไม่ตรงกับ metadata");
    }
    if ([...weekProvinces.values()].some((provinces) => provinces.size !== 77)) {
      problems.push("Holdout มีบางสัปดาห์ที่ข้อมูลจังหวัดไม่ครบ 77 จังหวัด");
    }
    const forecastWeek = predictions.coverage?.forecast_week ?? "";
    const historyEnd = predictions.coverage?.history_end_week ?? "";
    if (!predictions.coverage?.forecast_is_after_history || forecastWeek <= historyEnd) {
      problems.push("สัปดาห์พยากรณ์ต้องอยู่หลังสัปดาห์สุดท้ายของ Holdout");
    }
  }

  if (problems.length) {
    return {
      predictions: null,
      metrics: null,
      warning: "ข้อมูลโมเดลใหม่ไม่ผ่านการตรวจสอบ: " + [...new Set(problems)].join(" · ") +
        " เว็บไซต์จึงไม่แสดงผลโมเดลชุดนี้และจะกลับไปใช้ระบบข้อมูลเดิม",
    };
  }

  if (!predictions.model_revision) {
    return {
      predictions,
      metrics: null,
      warning: "ผลพยากรณ์โหลดได้ แต่ไม่มี Model Commit SHA สำหรับยืนยันแหล่งที่มา จึงไม่แสดง Metrics ประกอบ",
    };
  }

  if (metrics && metrics.model_revision !== predictions.model_revision) {
    return {
      predictions,
      metrics: null,
      warning: "Model Commit ของไฟล์ Metrics ไม่ตรงกับไฟล์ผลพยากรณ์ จึงซ่อน Metrics ไว้จนกว่าจะสร้างไฟล์จาก Commit เดียวกัน",
    };
  }

  if (
    metrics &&
    (
      typeof metrics.metrics.mae !== "number" ||
      !Number.isFinite(metrics.metrics.mae) ||
      metrics.metrics.mae < 0 ||
      typeof metrics.metrics.rmse !== "number" ||
      !Number.isFinite(metrics.metrics.rmse) ||
      metrics.metrics.rmse < 0 ||
      typeof metrics.metrics.eval_cutoff !== "string"
    )
  ) {
    return {
      predictions,
      metrics: null,
      warning: "ไฟล์ Metrics มีค่า MAE, RMSE หรือ eval_cutoff ที่ไม่ถูกต้อง จึงซ่อนตัวชี้วัดไว้",
    };
  }

  if (!metrics || !metrics.metrics || typeof metrics.metrics !== "object") {
    return {
      predictions,
      metrics: null,
      warning: "ผลพยากรณ์ผ่านการตรวจสอบ แต่ไม่พบ Metrics ที่อ่านได้จาก Model Repository",
    };
  }

  return { predictions, metrics, warning: null };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DengueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelWarning, setModelWarning] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      readJson("/data/predictions.json"),
      readJson("/data/weather_daily.json"),
      readJson("/data/prevention_actions.json"),
      readJson("/data/questions.json"),
      readJson("/data/options.json"),
      readJson("/data/assessment_rules.json"),
      readJson("/data/recommendations.json"),
      readJson("/data/meta.json"),
      readJson("/data/thailand_provinces.geojson"),
      readJson("/data/provinces_odpc4.geojson"),
      readOptionalJson<ModelPredictionsPayload>("/data/model_predictions.json"),
      readOptionalJson<ModelMetricsPayload>("/data/model_metrics.json"),
    ]).then(([
      predictions,
      weather,
      preventionActions,
      questions,
      options,
      rules,
      recommendations,
      meta,
      thailandGeo,
      odpcGeo,
      modelPredictionsResult,
      modelMetricsResult,
    ]) => {
      if (!active) return;

      const inspected = inspectModelPayload(
        modelPredictionsResult.data,
        modelMetricsResult.data,
      );
      const warnings = [
        modelPredictionsResult.warning,
        modelMetricsResult.warning,
        inspected.warning,
      ].filter((item): item is string => Boolean(item));
      setModelWarning(warnings.length ? warnings.join(" · ") : null);

      setData({
        predictions: predictions as DengueData["predictions"],
        weather: weather as DengueData["weather"],
        preventionActions: preventionActions as DengueData["preventionActions"],
        questions: questions as DengueData["questions"],
        options: options as DengueData["options"],
        rules: rules as DengueData["rules"],
        recommendations: recommendations as DengueData["recommendations"],
        meta: meta as DengueData["meta"],
        thailandGeo: thailandGeo as DengueData["thailandGeo"],
        odpcGeo: odpcGeo as DengueData["odpcGeo"],
        modelPredictions: inspected.predictions,
        modelMetrics: inspected.metrics,
      });
      setLoading(false);
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล");
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const value = useMemo(
    () => ({ data, loading, error, modelWarning }),
    [data, loading, error, modelWarning],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDengueData() {
  return useContext(DataContext);
}
