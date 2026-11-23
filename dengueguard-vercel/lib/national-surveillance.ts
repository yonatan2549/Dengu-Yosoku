export const NATIONAL_DENGUE_SNAPSHOT = {
  schemaVersion: 1, country: "Thailand", disease: "Dengue", measure: "new_suspected_cases",
  week: 46, year: 2026, situationAsOf: "2026-11-16", reportingPeriod: "2026-11-02/2026-11-15",
  publishedAt: "2026-11-18", cases: 694,
  previousWeek: { week: 45, year: 2026, cases: 1436 },
  sameWeekPreviousYear: { week: 46, year: 2025, cases: 889 },
  newDeaths: 0,
  source: {
    publisher: "World Health Organization, South-East Asia Region",
    report: "23rd (2026) Epidemiological Bulletin",
    url: "https://cdn.who.int/media/docs/default-source/searo/whe/wherepib/2026_23_searo_epi_bulletin.pdf",
  },
  notes: [
    "ตัวเลขเป็นผู้ป่วยสงสัยรายใหม่ระดับประเทศตามรายงาน ไม่ใช่จำนวนผู้ป่วยยืนยัน",
    "เป็นข้อมูลรวมประเทศไทย ไม่ใช่ข้อมูลแยกรายจังหวัด",
    "ไม่ใช่ผลพยากรณ์จากโมเดล DengueYosoku",
    "สัดส่วนการเปลี่ยนแปลงคำนวณจากจำนวนที่ WHO รายงานและปัดเป็นทศนิยม 1 ตำแหน่ง",
  ],
} as const;

export function percentageChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
