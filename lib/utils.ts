import type { ForecastRow, RegionalSummary, WeatherRow } from "@/lib/types";

export const RISK_COLORS: Record<string, string> = {
  "ปกติ": "#16a36a",
  "เฝ้าระวัง": "#d79a16",
  "เตือนระบาด": "#df4d4d",
  "ไม่มีข้อมูล": "#c9d0d8",
};

export const ALL_PROVINCES = "รวม 8 จังหวัด";

export function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return value.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatCases(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "ไม่มีข้อมูล"
    : `${formatNumber(value, 1)} ราย`;
}

export function normalizeProvince(name: unknown) {
  return String(name ?? "").trim().toLowerCase().replace(/^จังหวัด/, "").replace(/^จ\./, "").replace(/\s+/g, "");
}

export function getUniqueYears(rows: ForecastRow[]) {
  return [...new Set(rows.map((row) => Number(row.year)))].sort((a, b) => a - b);
}

export function getWeeksForYear(rows: ForecastRow[], year: number) {
  return [...new Set(rows.filter((row) => Number(row.year) === year).map((row) => row.target_week_start))].sort();
}

export function getCurrentRows(rows: ForecastRow[], week: string) {
  return rows.filter((row) => row.target_week_start === week);
}

export function sumNullable(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return present.length ? present.reduce((total, value) => total + value, 0) : null;
}

export function getRegionalSummary(
  predictions: ForecastRow[],
  weather: WeatherRow[],
  week: string,
): RegionalSummary {
  const current = getCurrentRows(predictions, week);
  const totalPredicted = current.reduce((sum, row) => sum + (Number(row.pred) || 0), 0);
  const alertCount = current.filter((row) => row.level === "เตือนระบาด").length;
  const watchCount = current.filter((row) => row.level === "เฝ้าระวัง").length;
  const normalCount = current.filter((row) => row.level === "ปกติ").length;

  // Weather file contains observed daily records. Summarize the 7 calendar days
  // beginning on the selected target week; do not label them as a forecast.
  const start = new Date(`${week}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const endString = end.toISOString().slice(0, 10);
  const days = weather.filter((row) => row.date >= week && row.date <= endString);

  const byProvince = new Map<string, WeatherRow[]>();
  for (const row of days) {
    const key = normalizeProvince(row.province);
    const list = byProvince.get(key) ?? [];
    list.push(row);
    byProvince.set(key, list);
  }

  const provinceRainTotals: number[] = [];
  const provinceTemperatureMeans: number[] = [];
  let maxDays = 0;
  for (const list of byProvince.values()) {
    const rain = sumNullable(list.map((row) => row.precipitation_sum));
    const tempValues = list.map((row) => row.temperature_2m_mean).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
    if (rain !== null) provinceRainTotals.push(rain);
    if (tempValues.length) provinceTemperatureMeans.push(tempValues.reduce((a, b) => a + b, 0) / tempValues.length);
    maxDays = Math.max(maxDays, list.length);
  }

  // Average province-level 7-day rainfall totals and province-level mean temperatures.
  const rainfallAverage = provinceRainTotals.length
    ? provinceRainTotals.reduce((a, b) => a + b, 0) / provinceRainTotals.length
    : null;
  const temperatureAverage = provinceTemperatureMeans.length
    ? provinceTemperatureMeans.reduce((a, b) => a + b, 0) / provinceTemperatureMeans.length
    : null;

  const dates = [...new Set(predictions.map((row) => row.target_week_start))].sort();
  const selectedYear = week.slice(0, 4);
  const priorDates = dates.filter((date) => date < week && date.slice(0, 4) === selectedYear);
  const previousWeek = priorDates.at(-1) ?? null;
  const previousRows = previousWeek ? getCurrentRows(predictions, previousWeek) : [];
  const previousTotal = previousRows.length
    ? previousRows.reduce((sum, row) => sum + (Number(row.pred) || 0), 0)
    : null;
  const trendDelta = previousTotal === null ? null : totalPredicted - previousTotal;
  const trendPercent = previousTotal !== null && previousTotal > 0 && trendDelta !== null
    ? (trendDelta / previousTotal) * 100
    : null;
  let trend: RegionalSummary["trend"] = "ไม่มีข้อมูลเปรียบเทียบ";
  if (trendDelta !== null) {
    if (trendPercent !== null && Math.abs(trendPercent) <= 5) trend = "ค่อนข้างคงที่";
    else if (trendDelta > 0) trend = "เพิ่มขึ้น";
    else if (trendDelta < 0) trend = "ลดลง";
    else trend = "ค่อนข้างคงที่";
  }

  return {
    week,
    totalPredicted,
    alertCount,
    watchCount,
    normalCount,
    rainfallAverage,
    temperatureAverage,
    weatherProvinceCount: Math.max(provinceRainTotals.length, provinceTemperatureMeans.length),
    weatherDays: maxDays,
    trend,
    trendDelta,
    trendPercent,
    previousTotal,
  };
}

export function compareProvinceWeek(
  predictions: ForecastRow[],
  province: string,
  week: string,
) {
  const current = predictions.find((row) => normalizeProvince(row.province) === normalizeProvince(province) && row.target_week_start === week);
  const selectedYear = week.slice(0, 4);
  const priorDates = [...new Set(predictions.map((row) => row.target_week_start))].filter((date) => date < week && date.slice(0, 4) === selectedYear).sort();
  const previousWeek = priorDates.at(-1) ?? null;
  const previous = previousWeek
    ? predictions.find((row) => normalizeProvince(row.province) === normalizeProvince(province) && row.target_week_start === previousWeek)
    : undefined;
  if (!current || !previous) return { current, previous, delta: null as number | null, percent: null as number | null };
  const delta = Number(current.pred) - Number(previous.pred);
  const percent = Number(previous.pred) > 0 ? delta / Number(previous.pred) * 100 : null;
  return { current, previous, delta, percent };
}


export function getCurrentEpiWeekStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const todayUtc = new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
  ));
  const weekday = todayUtc.getUTCDay();
  todayUtc.setUTCDate(todayUtc.getUTCDate() - weekday);
  return todayUtc.toISOString().slice(0, 10);
}

export function getEpiWeekLagWeeks(forecastWeek: string, currentWeek = getCurrentEpiWeekStart()) {
  const forecastTime = Date.parse(forecastWeek + "T00:00:00Z");
  const currentTime = Date.parse(currentWeek + "T00:00:00Z");
  if (!Number.isFinite(forecastTime) || !Number.isFinite(currentTime) || forecastTime >= currentTime) {
    return 0;
  }
  return Math.floor((currentTime - forecastTime) / (7 * 24 * 60 * 60 * 1000));
}
