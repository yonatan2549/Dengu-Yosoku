import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = Number(process.env.SMOKE_TEST_PORT || 3187);
const baseUrl = `http://${host}:${port}`;
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", host, "--port", String(port)],
  {
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "production",
      VERCEL_ENV: "",
      HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS: "false",
      AI_GATEWAY_API_KEY: "",
      HEALTH_ASSISTANT_API_KEY: "",
    },
  },
);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, init) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    redirect: "follow",
  });
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js server exited early with code ${server.exitCode}`);
    }
    try {
      const response = await request("/api/health-assistant/chat");
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(500);
  }
  throw new Error("Next.js production server did not become ready within 30 seconds");
}

async function assertPage(path) {
  const response = await request(path, { headers: { accept: "text/html" } });
  const contentType = response.headers.get("content-type") || "";
  if (response.status !== 200 || !contentType.includes("text/html")) {
    throw new Error(`Page smoke test failed for ${path}: HTTP ${response.status}, content-type ${contentType}`);
  }
  console.log(`PASS page ${path}`);
  return response;
}

async function assertSecurityHeaders(response) {
  const expected = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
  for (const [name, value] of Object.entries(expected)) {
    const actual = response.headers.get(name);
    if (actual !== value) {
      throw new Error(`Security header ${name} expected "${value}", received "${actual}"`);
    }
  }
  const hsts = response.headers.get("strict-transport-security") || "";
  if (!hsts.includes("max-age=31536000")) {
    throw new Error("Strict-Transport-Security header is missing or has an unexpected max-age");
  }
  console.log("PASS security headers");
}

async function assertHealthAssistantProductionPolicy() {
  const response = await request("/api/health-assistant/chat");
  if (!response.ok) throw new Error(`Health Assistant readiness returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.mode !== "evidence-only" || body.generatedAnswersEnabled !== false) {
    throw new Error("Health Assistant must remain evidence-only in the Production build smoke test");
  }
  if (Object.hasOwn(body, "apiKey") || Object.hasOwn(body, "token")) {
    throw new Error("Health Assistant readiness must never expose provider credentials");
  }
  console.log("PASS Health Assistant Production evidence-only policy");
}

async function assertModelSafetyGates() {
  const response = await request("/api/model/diagnostics");
  if (!response.ok) throw new Error(`Model diagnostics returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.ok !== true || !body.report) {
    throw new Error("Model diagnostics did not return a valid report");
  }
  if (body.report.releaseStatus !== "review_only" || body.report.canUseForCurrentAlerting !== false) {
    throw new Error("Review-only model snapshot must remain blocked from current Alert use");
  }

  const operationsResponse = await request("/api/model/operations");
  if (!operationsResponse.ok) {
    throw new Error(`Model operations returned HTTP ${operationsResponse.status}`);
  }
  const operations = await operationsResponse.json();
  if (operations.eligibleForCurrentEvaluation !== false) {
    throw new Error("Model operations must not mark the review-only snapshot operationally eligible");
  }
  console.log("PASS 77-province review-only model and Alert gates");
}

async function main() {
  try {
    await waitUntilReady();
    const pages = [
      "/",
      "/dashboard",
      "/prevention",
      "/symptom-checker",
      "/health-assistant",
      "/knowledge",
      "/references",
      "/about",
      "/alerts",
      "/model-operations",
      "/login",
    ];
    const dashboardResponse = await assertPage(pages[1]);
    await assertSecurityHeaders(dashboardResponse);
    for (const path of pages.filter((item) => item !== "/dashboard")) {
      await assertPage(path);
    }
    await assertHealthAssistantProductionPolicy();
    await assertModelSafetyGates();
    console.log(`PASS built-app smoke tests (${pages.length} pages + API safety checks)`);
  } finally {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(3_000),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
