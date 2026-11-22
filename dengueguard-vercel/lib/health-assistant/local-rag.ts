import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseSearchOutput, type ParsedRagResult } from "./contracts";

export class LocalRagUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalRagUnavailableError";
  }
}

function runSearch(
  command: string,
  args: string[],
  cwd: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        windowsHide: true,
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: "utf8",
        env: {
          ...process.env,
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr ?? "").trim();
          reject(
            new LocalRagUnavailableError(
              detail || "Local RAG search process failed.",
            ),
          );
          return;
        }
        resolve(String(stdout ?? ""));
      },
    );
  });
}

export async function retrieveLocalPublicEvidence(
  question: string,
): Promise<ParsedRagResult> {
  if (process.env.NODE_ENV === "production") {
    throw new LocalRagUnavailableError(
      "Local RAG mode is disabled in production. Configure a separately hosted, authenticated RAG service before deployment.",
    );
  }

  const configuredRoot = process.env.DENGUE_RAG_PROJECT_DIR?.trim();
  if (!configuredRoot) {
    throw new LocalRagUnavailableError(
      "ยังไม่ได้กำหนด DENGUE_RAG_PROJECT_DIR ในไฟล์ .env.local",
    );
  }

  const projectRoot = path.resolve(configuredRoot);
  const searchScript = path.join(projectRoot, "scripts", "search.py");
  const database = path.join(projectRoot, "knowledge-base", "knowledge.db");

  if (!existsSync(searchScript) || !existsSync(database)) {
    throw new LocalRagUnavailableError(
      "ไม่พบ scripts/search.py หรือ knowledge-base/knowledge.db ในโฟลเดอร์ RAG ที่กำหนด",
    );
  }

  const pythonCommand = process.env.DENGUE_RAG_PYTHON?.trim() || "py";
  const isWindowsLauncher = /^py(?:\.exe)?$/i.test(path.basename(pythonCommand));
  const args = isWindowsLauncher
    ? ["-3", searchScript, question]
    : [searchScript, question];

  const stdout = await runSearch(pythonCommand, args, projectRoot);
  return parseSearchOutput(stdout);
}
