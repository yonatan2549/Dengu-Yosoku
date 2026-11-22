import type { ProviderMessage } from "./chat-contract";

export interface ChatProviderConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export type ConfigEnvironment = Record<string, string | undefined>;

export function readChatProviderConfig(
  env: ConfigEnvironment,
  nodeEnv: string | undefined,
): { ok: true; config: ChatProviderConfig } | { ok: false; error: string } {
  const endpoint = env.HEALTH_ASSISTANT_CHAT_ENDPOINT?.trim() ?? "";
  const apiKey = env.HEALTH_ASSISTANT_API_KEY?.trim() ?? "";
  const model = env.HEALTH_ASSISTANT_MODEL?.trim() ?? "";
  if (!endpoint || !apiKey || !model) {
    return { ok: false, error: "ยังไม่ได้ตั้งค่า AI Provider ฝั่ง Server" };
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { ok: false, error: "AI Provider Endpoint ไม่ใช่ URL ที่ถูกต้อง" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "AI Provider Endpoint ต้องใช้ HTTP หรือ HTTPS" };
  }
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (nodeEnv === "production" && (parsed.protocol !== "https:" || localHost)) {
    return { ok: false, error: "Production ต้องใช้ AI Provider Endpoint แบบ HTTPS" };
  }
  if (model.length > 120 || apiKey.length > 2048) {
    return { ok: false, error: "การตั้งค่า AI Provider มีความยาวเกินกำหนด" };
  }
  return { ok: true, config: { endpoint: parsed.toString(), apiKey, model } };
}

function extractContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textParts = content
      .filter((part): part is { type: string; text: string } => Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string"))
      .map((part) => part.text);
    return textParts.length ? textParts.join("\n") : null;
  }
  return null;
}

export async function requestChatCompletion(
  config: ChatProviderConfig,
  messages: ProviderMessage[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.1,
        max_tokens: 700,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return { ok: false, error: "ไม่สามารถเชื่อมต่อ AI Provider ได้ในขณะนี้" };
  }
  if (!response.ok) return { ok: false, error: `AI Provider ตอบกลับด้วยสถานะ ${response.status}` };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: "AI Provider ส่งข้อมูลกลับมาไม่อยู่ในรูปแบบ JSON" };
  }
  const answer = extractContent(payload);
  if (!answer) return { ok: false, error: "AI Provider ไม่ส่งข้อความคำตอบกลับมา" };
  return { ok: true, answer };
}
