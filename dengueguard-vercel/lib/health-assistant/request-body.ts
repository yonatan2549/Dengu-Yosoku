export const MAX_HEALTH_ASSISTANT_REQUEST_BYTES = 32 * 1024;

export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };

/**
 * Reads JSON from a request stream with a hard byte limit.
 * This prevents oversized chat/evidence payloads from being fully buffered
 * before query and history validation runs.
 */
export async function readBoundedJson(
  request: Request,
  maximumBytes = MAX_HEALTH_ASSISTANT_REQUEST_BYTES,
): Promise<BoundedJsonResult> {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("maximumBytes must be a positive integer");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maximumBytes) {
    return {
      ok: false,
      status: 413,
      error: "คำขอมีขนาดใหญ่เกินกำหนด โปรดลดความยาวข้อความแล้วส่งใหม่",
    };
  }

  if (!request.body) {
    return { ok: false, status: 400, error: "คำขอต้องอยู่ในรูปแบบ JSON" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // The request has already exceeded the limit; cancellation is best effort.
        }
        return {
          ok: false,
          status: 413,
          error: "คำขอมีขนาดใหญ่เกินกำหนด โปรดลดความยาวข้อความแล้วส่งใหม่",
        };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "ไม่สามารถอ่านเนื้อหาคำขอได้" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A cancelled stream may already have released its lock.
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, error: "คำขอต้องอยู่ในรูปแบบ JSON ที่ถูกต้อง" };
  }
}
