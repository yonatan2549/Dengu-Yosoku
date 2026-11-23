import { createReadStream } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

export function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  cells.push(value);
  return cells;
}

function isSunday(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === 0;
}

export async function buildProvinceHistorySnapshot({
  sourcePath,
  provinces,
  generatedAtUtc = new Date().toISOString(),
}) {
  const canonical = new Set(provinces);
  if (canonical.size !== 77 || provinces.length !== 77) {
    throw new Error("The canonical province list must contain exactly 77 unique provinces.");
  }

  const input = createInterface({
    input: createReadStream(sourcePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let indexes = null;
  let lineNumber = 0;
  let unknownProvinceRows = 0;
  const rowsByKey = new Map();

  for await (const line of input) {
    lineNumber += 1;
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (!indexes) {
      const headers = cells.map((cell, index) =>
        (index === 0 && cell.startsWith("\uFEFF") ? cell.slice(1) : cell).trim().toLowerCase()
      );
      indexes = {
        province: headers.indexOf("province"),
        weekStart: headers.indexOf("week_start"),
        cases: headers.indexOf("cases"),
      };
      const missing = Object.entries(indexes)
        .filter(([, index]) => index < 0)
        .map(([name]) => name);
      if (missing.length) {
        throw new Error("dengue_full.csv is missing required columns: " + missing.join(", "));
      }
      continue;
    }

    const province = (cells[indexes.province] ?? "").trim();
    const weekStart = (cells[indexes.weekStart] ?? "").trim().slice(0, 10);
    const casesText = (cells[indexes.cases] ?? "").trim();
    if (!province || !weekStart || !casesText) continue;
    if (!canonical.has(province)) {
      unknownProvinceRows += 1;
      continue;
    }
    if (!isSunday(weekStart)) {
      throw new Error("week_start must be a valid Sunday at CSV line " + lineNumber + ": " + weekStart);
    }
    const actualCases = Number(casesText);
    if (!Number.isFinite(actualCases) || actualCases < 0) {
      throw new Error("Invalid cases value at CSV line " + lineNumber + ": " + casesText);
    }
    const key = weekStart + "|" + province;
    const previous = rowsByKey.get(key);
    if (previous !== undefined) {
      if (previous !== actualCases) {
        throw new Error("Conflicting duplicate province-week row at CSV line " + lineNumber + ": " + key);
      }
      continue;
    }
    rowsByKey.set(key, actualCases);
  }

  if (!indexes) throw new Error("dengue_full.csv is empty.");
  const provinceOrder = new Map(provinces.map((province, index) => [province, index]));
  const rows = [...rowsByKey.entries()].map(([key, actual_cases]) => {
    const separator = key.indexOf("|");
    const week_start = key.slice(0, separator);
    const province = key.slice(separator + 1);
    return { province, week_start, year: Number(week_start.slice(0, 4)), actual_cases };
  });
  rows.sort((a, b) => a.week_start.localeCompare(b.week_start) ||
    provinceOrder.get(a.province) - provinceOrder.get(b.province));

  const provincesByWeek = new Map();
  for (const row of rows) {
    const covered = provincesByWeek.get(row.week_start) ?? new Set();
    covered.add(row.province);
    provincesByWeek.set(row.week_start, covered);
  }
  const week_coverage = [...provincesByWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week_start, covered]) => ({
      week_start,
      year: Number(week_start.slice(0, 4)),
      province_count: covered.size,
      complete: covered.size === 77,
    }));
  const years = [...new Set(rows.map((row) => row.year))].sort((a, b) => a - b);

  return {
    schema_version: 1,
    status: rows.length ? "ready" : "unavailable",
    source_file: "dengue_full.csv",
    generated_at_utc: generatedAtUtc,
    province_count: 77,
    row_count: rows.length,
    years,
    week_coverage,
    unknown_province_rows: unknownProvinceRows,
    rows,
    message: rows.length ? undefined : "ไม่พบข้อมูลผู้ป่วยจริงย้อนหลังที่ตรงกับรายชื่อ 77 จังหวัด",
  };
}

async function run() {
  const scriptPath = fileURLToPath(import.meta.url);
  const packageRoot = dirname(dirname(scriptPath));
  const repositoryRoot = dirname(packageRoot);
  const sourcePath = join(repositoryRoot, "dengue_full.csv");
  const modelPath = join(packageRoot, "public", "data", "model_predictions.json");
  const outputPath = join(packageRoot, "public", "data", "province_history_77.json");

  try {
    await access(sourcePath);
  } catch {
    try {
      await access(outputPath);
      console.warn("dengue_full.csv is outside this build context; preserving the existing historical snapshot.");
      return;
    } catch {
      const emptySnapshot = {
        schema_version: 1,
        status: "unavailable",
        source_file: "dengue_full.csv",
        generated_at_utc: new Date().toISOString(),
        province_count: 77,
        row_count: 0,
        years: [],
        week_coverage: [],
        unknown_province_rows: 0,
        rows: [],
        message: "ยังไม่พบไฟล์ข้อมูล dengue_full.csv สำหรับสร้างประวัติผู้ป่วย 77 จังหวัด",
      };
      await writeFile(outputPath, JSON.stringify(emptySnapshot) + "\n", "utf8");
      console.warn(emptySnapshot.message);
      return;
    }
  }

  const model = JSON.parse(await readFile(modelPath, "utf8"));
  const snapshot = await buildProvinceHistorySnapshot({
    sourcePath,
    provinces: model.provinces,
  });
  await writeFile(outputPath, JSON.stringify(snapshot) + "\n", "utf8");
  const partialWeeks = snapshot.week_coverage.filter((week) => !week.complete).length;
  console.log(
    "Built 77-province historical actuals: " + snapshot.row_count + " rows, " +
    snapshot.years.length + " years, " + partialWeeks + " partial weeks, " +
    snapshot.unknown_province_rows + " unrecognized-province rows.",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
