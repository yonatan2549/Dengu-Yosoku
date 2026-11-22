import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { validatePublicRagPayload, type PublicRagPayload } from "./local-rag-contract";

export type LocalRagSearchOutcome =
  | { ok: true; data: PublicRagPayload }
  | { ok: false; code: "production_disabled" | "not_configured" | "invalid_runtime" | "unavailable" | "invalid_output"; message: string };

function pythonCommand(value: string): { command: string; prefixArgs: string[] } | null {
  const command = value.trim();
  if (!command) return null;
  const name = path.basename(command).toLowerCase();
  if (name === "py" || name === "py.exe") return { command, prefixArgs: ["-3"] };
  if (name === "python" || name === "python.exe" || name === "python3" || name === "python3.exe") {
    return { command, prefixArgs: [] };
  }
  return null;
}

function runSearch(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd,
      windowsHide: true,
      timeout: 315_000,
      maxBuffer: 2 * 1024 * 1024,
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
    }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(String(stdout));
    });
  });
}

/**
 * Local-only adapter. It never exposes review mode and never invokes a generative model.
 * The Python process receives the query as a separate argv value; no shell is involved.
 */
export async function searchLocalRagEvidence(query: string): Promise<LocalRagSearchOutcome> {
  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      code: "production_disabled",
      message: "Local SQLite RAG เปิดใช้ได้เฉพาะ Local Development เท่านั้น",
    };
  }

  const projectDirValue = process.env.DENGUE_RAG_PROJECT_DIR?.trim() ?? "";
  if (!projectDirValue || !path.isAbsolute(projectDirValue)) {
    return {
      ok: false,
      code: "not_configured",
      message: "ยังไม่ได้กำหนด DENGUE_RAG_PROJECT_DIR ใน .env.local",
    };
  }

  const python = pythonCommand(process.env.DENGUE_RAG_PYTHON?.trim() || "py");
  if (!python) {
    return {
      ok: false,
      code: "invalid_runtime",
      message: "DENGUE_RAG_PYTHON ต้องเป็น py, python หรือพาธไปยัง Python executable",
    };
  }

  const projectDir = path.resolve(projectDirValue);
  const searchScript = path.join(projectDir, "scripts", "search.py");
  const knowledgeDb = path.join(projectDir, "knowledge-base", "knowledge.db");
  if (!existsSync(searchScript) || !existsSync(knowledgeDb)) {
    return {
      ok: false,
      code: "not_configured",
      message: "ไม่พบ scripts/search.py หรือ knowledge-base/knowledge.db ในโฟลเดอร์ RAG ที่กำหนด",
    };
  }

  const args = [
    ...python.prefixArgs,
    searchScript,
    query,
    "--audience", "public",
    "--top-k", "5",
    "--per-source", "2",
    "--output-format", "json",
  ];

  try {
    const stdout = await runSearch(python.command, args, projectDir);
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      return {
        ok: false,
        code: "invalid_output",
        message: "Local RAG ส่งผลลัพธ์ที่ไม่ใช่ JSON ที่ถูกต้อง",
      };
    }

    const validated = validatePublicRagPayload(parsed);
    if (!validated.ok) {
      return {
        ok: false,
        code: "invalid_output",
        message: "ผลค้นจาก Local RAG ไม่ผ่านการตรวจสอบ Public Evidence Policy",
      };
    }

    return { ok: true, data: validated.value };
  } catch {
    return {
      ok: false,
      code: "unavailable",
      message: "เชื่อมต่อ Local RAG ไม่สำเร็จ โปรดตรวจว่า Ollama และ Embedding Model ทำงานอยู่",
    };
  }
}
