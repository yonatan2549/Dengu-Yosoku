/**
 * Epidemiological week numbering used by the Phase 13 data pipeline:
 * week 1 begins on the first Sunday on or after January 1.
 * Input must be a real Sunday date (YYYY-MM-DD).
 */
function firstSundayOfYear(year: number): Date {
  const first = new Date(Date.UTC(year, 0, 1));
  const offset = (7 - first.getUTCDay()) % 7;
  first.setUTCDate(first.getUTCDate() + offset);
  return first;
}

export function getEpiWeek(value: string): { year: number; week: number } | null {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value ||
      date.getUTCDay() !== 0) return null;

  const calendarYear = date.getUTCFullYear();
  for (const year of [calendarYear - 1, calendarYear, calendarYear + 1]) {
    const start = firstSundayOfYear(year);
    const nextStart = firstSundayOfYear(year + 1);
    if (date >= start && date < nextStart) {
      return {
        year,
        week: Math.floor((date.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1,
      };
    }
  }
  return null;
}

export function formatEpiWeekLabel(value: string): string {
  const epiWeek = getEpiWeek(value);
  return epiWeek
    ? `สัปดาห์ที่ ${epiWeek.week}/${epiWeek.year + 543}`
    : "ไม่ทราบสัปดาห์ระบาดวิทยา";
}
