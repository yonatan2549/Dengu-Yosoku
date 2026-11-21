export type ReadinessRuleStatus = "draft" | "approved";

export interface ReadinessProfile {
  profileId: string;
  version: string;
  status: ReadinessRuleStatus;
  externalNotificationsEnabled: boolean;
}

export interface ReadinessThreshold {
  provinceName: string;
  watch: number;
  alert: number;
}

export interface AlertReadinessInput {
  migration004Available: boolean;
  profile: ReadinessProfile | null;
  thresholds: ReadinessThreshold[];
  expectedProvinces: string[];
  applicationProfileId: string;
  applicationProfileVersion: string;
  applicationProfileStatus: ReadinessRuleStatus;
  databaseRoleMismatch?: boolean;
}

export interface AlertReadinessReport {
  migration004Available: boolean;
  databaseRoleMismatch: boolean;
  profileFound: boolean;
  profileStatus: ReadinessRuleStatus | null;
  profileVersion: string | null;
  profileMatchesApplication: boolean;
  thresholdCount: number;
  expectedThresholdCount: number;
  missingProvinces: string[];
  unexpectedProvinces: string[];
  duplicateThresholdProvinces: string[];
  invalidThresholdProvinces: string[];
  externalNotificationsEnabled: false;
  canCreateCandidates: boolean;
  blockers: string[];
}

/** Read-only readiness assessment. It never approves profiles or changes rules. */
export function assessAlertReadiness(input: AlertReadinessInput): AlertReadinessReport {
  const blockers: string[] = [];
  const expected = [...new Set(input.expectedProvinces.map((name) => name.trim()).filter(Boolean))];
  const expectedSet = new Set(expected);

  if (!input.migration004Available) blockers.push("ยังตรวจไม่พบ RPC จาก Migration 004 ใน Supabase");
  if (input.databaseRoleMismatch) blockers.push("Role ใน user_profiles ไม่สอดคล้องกับสิทธิ์ที่ตรวจได้จาก Supabase Auth");
  if (!input.profile) blockers.push("ยังไม่พบ Rule Profile เวอร์ชันที่แอปกำหนดในฐานข้อมูล");
  if (expected.length !== 77 || input.expectedProvinces.length !== 77) {
    blockers.push(`ชุดข้อมูลจังหวัดของโมเดลไม่ครบ 77 จังหวัด (พบ ${expected.length}/77 จังหวัดไม่ซ้ำ)`);
  }

  const counts = new Map<string, number>();
  for (const threshold of input.thresholds) {
    const name = threshold.provinceName.trim();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const duplicateThresholdProvinces = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b, "th"));
  const configuredNames = new Set(counts.keys());
  const missingProvinces = expected.filter((name) => !configuredNames.has(name));
  const unexpectedProvinces = [...configuredNames]
    .filter((name) => !expectedSet.has(name))
    .sort((a, b) => a.localeCompare(b, "th"));
  const invalidThresholdProvinces = input.thresholds
    .filter((item) => !Number.isFinite(item.watch) || !Number.isFinite(item.alert) || item.watch < 0 || item.alert <= item.watch)
    .map((item) => item.provinceName)
    .filter((name, index, all) => all.indexOf(name) === index)
    .sort((a, b) => a.localeCompare(b, "th"));

  if (duplicateThresholdProvinces.length) blockers.push(`พบ Threshold จังหวัดซ้ำ ${duplicateThresholdProvinces.length} รายการ`);
  if (missingProvinces.length || unexpectedProvinces.length || input.thresholds.length !== 77) {
    blockers.push(`Threshold ต้องตรงกับรายชื่อจังหวัดในโมเดลครบ 77 จังหวัด (พบ ${configuredNames.size}/77 จังหวัดไม่ซ้ำ)`);
  }
  if (invalidThresholdProvinces.length) blockers.push(`พบค่า Threshold ไม่ถูกต้อง ${invalidThresholdProvinces.length} จังหวัด`);

  const profileMatchesApplication = Boolean(
    input.profile &&
    input.profile.profileId === input.applicationProfileId &&
    input.profile.version === input.applicationProfileVersion &&
    input.profile.status === input.applicationProfileStatus,
  );
  if (input.profile && !profileMatchesApplication) blockers.push("สถานะหรือเวอร์ชัน Rule Profile ในฐานข้อมูลไม่ตรงกับที่แอปกำหนด");
  if (input.profile?.status !== "approved") blockers.push("Rule Profile ยังไม่ผ่านการรับรองจากผู้มีอำนาจและผู้เชี่ยวชาญ");
  if (input.profile && input.profile.externalNotificationsEnabled !== false) blockers.push("พบการตั้งค่า External Notifications ที่ไม่ปลอดภัย");

  const canCreateCandidates = blockers.length === 0 && input.profile?.status === "approved";
  return {
    migration004Available: input.migration004Available,
    databaseRoleMismatch: Boolean(input.databaseRoleMismatch),
    profileFound: Boolean(input.profile),
    profileStatus: input.profile?.status ?? null,
    profileVersion: input.profile?.version ?? null,
    profileMatchesApplication,
    thresholdCount: configuredNames.size,
    expectedThresholdCount: 77,
    missingProvinces,
    unexpectedProvinces,
    duplicateThresholdProvinces,
    invalidThresholdProvinces,
    externalNotificationsEnabled: false,
    canCreateCandidates,
    blockers,
  };
}
