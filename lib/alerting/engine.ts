import type {
  AlertCandidateEvent,
  AlertDryRunCheck,
  AlertDryRunResult,
  AlertModelSnapshot,
  AlertRuleProfile,
  ForecastFreshness,
  ProvinceAlertThreshold,
} from "./types";

const EXPECTED_PROVINCES = 77;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isSundayDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    parsed.getUTCDay() === 0;
}

function getLagWeeks(targetWeek: string, currentWeek: string): number | null {
  if (!isSundayDate(targetWeek) || !isSundayDate(currentWeek)) return null;
  const difference = Date.parse(currentWeek + "T00:00:00Z") -
    Date.parse(targetWeek + "T00:00:00Z");
  return difference > 0 ? Math.floor(difference / WEEK_MS) : 0;
}

function validateForecast(model: AlertModelSnapshot | null) {
  if (!model) {
    return {
      valid: false,
      provinceCount: 0,
      targetWeek: null as string | null,
      reasons: ["ไม่พบข้อมูลโมเดลสำหรับประเมิน"],
      detail: "ยังไม่มีข้อมูลโมเดล 77 จังหวัด",
    };
  }

  const provinceSet = new Set(model.provinces);
  const forecastRows = Array.isArray(model.forecast) ? model.forecast : [];
  const forecastProvinces = new Set(forecastRows.map((row) => row?.province));
  const forecastWeeks = new Set(forecastRows.map((row) => row?.week_start));
  const targetWeek = model.coverage?.forecast_week ?? null;

  const coverageValid =
    model.province_count === EXPECTED_PROVINCES &&
    model.provinces.length === EXPECTED_PROVINCES &&
    provinceSet.size === EXPECTED_PROVINCES &&
    forecastRows.length === EXPECTED_PROVINCES &&
    model.coverage?.forecast_rows === EXPECTED_PROVINCES &&
    forecastProvinces.size === EXPECTED_PROVINCES &&
    [...forecastProvinces].every((province) => typeof province === "string" && provinceSet.has(province)) &&
    forecastRows.every((row) =>
      typeof row.prediction === "number" &&
      Number.isFinite(row.prediction) &&
      row.prediction >= 0 &&
      row.week_start === targetWeek
    ) &&
    forecastWeeks.size === 1;

  const weekValid = isSundayDate(targetWeek);
  const revisionValid = /^[a-f0-9]{40}$/i.test(model.model_revision ?? "");
  const reasons: string[] = [];
  if (!coverageValid) reasons.push("ผลพยากรณ์ไม่ครบ 77 จังหวัดหรือมีข้อมูลซ้ำ/ไม่สอดคล้อง");
  if (!weekValid) reasons.push("สัปดาห์เป้าหมายไม่ใช่วันอาทิตย์ในรูปแบบ YYYY-MM-DD");
  if (!revisionValid) reasons.push("ไม่มี Model Commit SHA สำหรับตรวจสอบรุ่นข้อมูล");

  return {
    valid: coverageValid && weekValid && revisionValid,
    provinceCount: forecastProvinces.size,
    targetWeek,
    reasons,
    detail: coverageValid
      ? `ตรวจพบผลพยากรณ์ ${forecastRows.length}/77 จังหวัด ไม่ซ้ำและอยู่ในสัปดาห์เดียวกัน`
      : `ตรวจพบ ${forecastRows.length} แถว และจับคู่จังหวัดได้ ${forecastProvinces.size}/77 จังหวัด`,
  };
}

function validateThresholds(
  model: AlertModelSnapshot | null,
  profile: AlertRuleProfile,
): { valid: boolean; covered: number; detail: string; reasons: string[] } {
  if (!model) {
    return { valid: false, covered: 0, detail: "ไม่มีรายชื่อจังหวัดสำหรับตรวจเกณฑ์", reasons: ["ไม่มีข้อมูลจังหวัด"] };
  }

  const thresholds = profile.thresholdsByProvince ?? {};
  const modelProvinces = new Set(model.provinces);
  const thresholdProvinces = Object.keys(thresholds);
  const covered = thresholdProvinces.filter((province) => modelProvinces.has(province)).length;
  const reasons: string[] = [];

  if (thresholdProvinces.length !== EXPECTED_PROVINCES || covered !== EXPECTED_PROVINCES) {
    reasons.push(`ยังไม่ได้กำหนดเกณฑ์รายจังหวัดครบ 77 จังหวัด (พบ ${covered}/77)`);
  }

  const invalidThresholds = thresholdProvinces.filter((province) => {
    const value: ProvinceAlertThreshold | undefined = thresholds[province];
    return !modelProvinces.has(province) ||
      !value ||
      !Number.isFinite(value.watch) ||
      !Number.isFinite(value.alert) ||
      value.watch < 0 ||
      value.alert <= value.watch;
  });

  if (invalidThresholds.length) {
    reasons.push("พบเกณฑ์ที่ไม่ถูกต้อง หรือเกณฑ์เตือนต้องสูงกว่าเกณฑ์เฝ้าระวัง");
  }

  return {
    valid: reasons.length === 0,
    covered,
    detail: reasons.length
      ? reasons.join(" · ")
      : "เกณฑ์รายจังหวัดครบและผ่านการตรวจค่าตัวเลข",
    reasons,
  };
}

export function evaluateAlertDryRun(
  model: AlertModelSnapshot | null,
  profile: AlertRuleProfile,
  currentEpiWeek: string,
): AlertDryRunResult {
  const forecast = validateForecast(model);
  const thresholds = validateThresholds(model, profile);
  const targetWeek = forecast.targetWeek;
  const lag = targetWeek ? getLagWeeks(targetWeek, currentEpiWeek) : null;
  const freshness: ForecastFreshness = lag === null
    ? "unknown"
    : lag > 0
      ? "stale"
      : "current_or_future";

  const approvalValid =
    profile.status === "approved" &&
    Boolean(profile.approvalReference?.trim()) &&
    isSundayDate(profile.effectiveFromWeek) &&
    Boolean(targetWeek && profile.effectiveFromWeek && targetWeek >= profile.effectiveFromWeek);

  const profileShapeValid =
    profile.scope === "national_77_provinces" &&
    profile.metric === "weekly_predicted_cases" &&
    profile.externalNotificationsEnabled === false;

  const checks: AlertDryRunCheck[] = [
    {
      id: "forecast-coverage",
      label: "ความครบถ้วนของผลพยากรณ์",
      status: forecast.valid ? "pass" : "blocked",
      detail: forecast.detail,
    },
    {
      id: "forecast-freshness",
      label: "ความใหม่ของข้อมูล",
      status: freshness === "stale" ? "blocked" : freshness === "unknown" ? "blocked" : "pass",
      detail: freshness === "stale"
        ? `Snapshot เก่ากว่าสัปดาห์ปัจจุบัน ${lag} สัปดาห์ จึงไม่สร้าง Candidate และไม่ใช้สื่อสารเป็นสถานการณ์ปัจจุบัน`
        : freshness === "current_or_future"
          ? "สัปดาห์เป้าหมายไม่เก่ากว่าสัปดาห์ระบาดวิทยาปัจจุบัน"
          : "ไม่สามารถคำนวณความใหม่ของข้อมูลได้",
    },
    {
      id: "rule-approval",
      label: "การรับรองระเบียบวิธี",
      status: approvalValid ? "pass" : "blocked",
      detail: approvalValid
        ? `Profile ${profile.version} มีสถานะอนุมัติและมีเอกสารอ้างอิง`
        : "Rule profile ยังเป็น Draft หรือยังไม่มีเอกสารอนุมัติ/วันที่เริ่มใช้ที่ถูกต้อง",
    },
    {
      id: "threshold-coverage",
      label: "เกณฑ์ Watch / Alert รายจังหวัด",
      status: thresholds.valid ? "pass" : "blocked",
      detail: thresholds.detail,
    },
    {
      id: "delivery-safety",
      label: "การส่งข้อความภายนอก",
      status: profileShapeValid ? "pass" : "blocked",
      detail: profileShapeValid
        ? "ปิดการส่ง LINE, Email, SMS และช่องทางภายนอกทั้งหมด (Dry-run only)"
        : "Profile ต้องใช้ขอบเขต/ตัวชี้วัดที่กำหนด และต้องปิดการส่งข้อความภายนอก",
    },
  ];

  const blockedReasons = [
    ...forecast.reasons,
    ...(approvalValid ? [] : ["ยังไม่มี Rule Profile ที่ผ่านการรับรอง"]),
    ...thresholds.reasons,
    ...(freshness === "stale" ? [`Forecast Snapshot เก่ากว่าสัปดาห์ปัจจุบัน ${lag} สัปดาห์ จึงไม่สร้าง Candidate`] : []),
    ...(!profileShapeValid ? ["รูปแบบ Profile ไม่ปลอดภัยสำหรับ Dry-run"] : []),
  ];

  const canEvaluate = forecast.valid &&
    freshness === "current_or_future" &&
    approvalValid &&
    thresholds.valid &&
    profileShapeValid;

  const candidateEvents: AlertCandidateEvent[] = [];
  if (canEvaluate && model && targetWeek) {
    for (const row of model.forecast) {
      const threshold = profile.thresholdsByProvince[row.province];
      let level: AlertCandidateEvent["level"] | null = null;
      let triggerThreshold = 0;
      if (row.prediction >= threshold.alert) {
        level = "ALERT";
        triggerThreshold = threshold.alert;
      } else if (row.prediction >= threshold.watch) {
        level = "WATCH";
        triggerThreshold = threshold.watch;
      }
      if (!level) continue;

      candidateEvents.push({
        eventId: [
          profile.profileId,
          targetWeek,
          row.province,
          "predicted_cases_threshold",
        ].join(":"),
        province: row.province,
        weekStart: targetWeek,
        level,
        signal: "predicted_cases_threshold",
        predictedCases: row.prediction,
        threshold: triggerThreshold,
        ruleProfileId: profile.profileId,
        ruleProfileVersion: profile.version,
        snapshotIsStale: false,
        delivery: "not_sent_dry_run_only",
      });
    }
  }

  const watchCandidateCount = candidateEvents.filter((event) => event.level === "WATCH").length;
  const alertCandidateCount = candidateEvents.filter((event) => event.level === "ALERT").length;

  return {
    status: canEvaluate ? "evaluated" : "blocked",
    mode: "dry_run_only",
    ruleProfileId: profile.profileId,
    ruleProfileVersion: profile.version,
    ruleProfileStatus: profile.status,
    targetWeek,
    currentEpiWeek,
    freshness,
    forecastLagWeeks: lag,
    forecastProvinceCount: forecast.provinceCount,
    evaluatedProvinceCount: canEvaluate ? model?.forecast.length ?? 0 : 0,
    watchCandidateCount,
    alertCandidateCount,
    externalNotificationsEnabled: false,
    blockedReasons,
    checks,
    candidateEvents,
  };
}
