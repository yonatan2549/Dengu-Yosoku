import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  validatePublicRagPayload,
  type PublicRagPayload,
} from "./sqlite-rag-contract";

export type SqliteRagSearchOutcome =
  | { ok: true; data: PublicRagPayload }
  | {
      ok: false;
      code: "production_disabled" | "not_configured" | "invalid_runtime" | "unavailable" | "invalid_output";
      message: string;
    };

export interface SqliteRagRuntimeStatus {
  configured: boolean;
  available: boolean;
  code?: "production_disabled" | "not_configured" | "invalid_runtime" | "unavailable" | "invalid_output";
  message: string;
}

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

function resolveRuntime() {
  if (process.env.NODE_ENV === "production") {
    return { ok: false as const, configured: false, code: "production_disabled" as const,
      message: "Local SQLite RAG เปิดใช้ได้เฉพาะ Local Development เท่านั้น" };
  }
  if (process.env.NODE_ENV !== "development") {
    return { ok: false as const, configured: false, code: "production_disabled" as const,
      message: "Local SQLite RAG เปิดใช้ได้เฉพาะ Next.js Development Server" };
  }

  const projectDirValue = process.env.DENGUE_RAG_PROJECT_DIR?.trim() ?? "";
  if (!projectDirValue || !path.isAbsolute(projectDirValue)) {
    return { ok: false as const, configured: false, code: "not_configured" as const,
      message: "ยังไม่ได้กำหนด DENGUE_RAG_PROJECT_DIR ใน .env.local" };
  }

  const python = pythonCommand(process.env.DENGUE_RAG_PYTHON?.trim() || "py");
  if (!python) {
    return { ok: false as const, configured: true, code: "invalid_runtime" as const,
      message: "DENGUE_RAG_PYTHON ต้องเป็น py, python หรือพาธไปยัง Python executable" };
  }

  const projectDir = path.resolve(projectDirValue);
  const searchScript = path.join(projectDir, "scripts", "search.py");
  const knowledgeDb = path.join(projectDir, "knowledge-base", "knowledge.db");
  if (!existsSync(searchScript) || !existsSync(knowledgeDb)) {
    return { ok: false as const, configured: true, code: "not_configured" as const,
      message: "ไม่พบสคริปต์ค้นหาและฐานข้อมูล SQLite ในโฟลเดอร์ RAG ที่กำหนด" };
  }

  return { ok: true as const, configured: true, python, projectDir, searchScript,
    message: "เชื่อมต่อคลังความรู้ SQLite ในเครื่องแล้ว โหมดนี้แสดงหลักฐานเท่านั้นและไม่สร้างคำตอบด้วย AI" };
}

export function getLocalSqliteRagStatus(): SqliteRagRuntimeStatus {
  const runtime = resolveRuntime();
  return {
    configured: runtime.configured,
    available: runtime.ok,
    ...(!runtime.ok ? { code: runtime.code } : {}),
    message: runtime.message,
  };
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
 * Calls only the fixed public-audience SQLite retrieval command.
 * It never exposes review mode, invokes a generative model, or uses a shell.
 */
export async function searchLocalSqliteRagEvidence(query: string): Promise<SqliteRagSearchOutcome> {
  const runtime = resolveRuntime();
  if (!runtime.ok) {
    return { ok: false, code: runtime.code, message: runtime.message };
  }

  const args = [
    ...runtime.python.prefixArgs,
    runtime.searchScript,
    query,
    "--audience", "public",
    "--top-k", "5",
    "--per-source", "2",
    "--output-format", "json",
  ];

  try {
    const stdout = await runSearch(runtime.python.command, args, runtime.projectDir);
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      return { ok: false, code: "invalid_output", message: "Local SQLite RAG ส่งผลลัพธ์ที่ไม่ใช่ JSON ที่ถูกต้อง" };
    }

    const validated = validatePublicRagPayload(parsed);
    if (!validated.ok) {
      return { ok: false, code: "invalid_output", message: "ผลค้นจาก SQLite ไม่ผ่านการตรวจสอบ Public Evidence Policy" };
    }
    return { ok: true, data: validated.value };
  } catch {
    return { ok: false, code: "unavailable",
      message: "เชื่อมต่อ Local SQLite RAG ไม่สำเร็จ โปรดตรวจว่า Ollama, Embedding Model และ Python ทำงานอยู่" };
  }
}
