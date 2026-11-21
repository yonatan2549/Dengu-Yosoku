import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const corpusPath = path.join(root, "data", "health-assistant", "dengue-th.json");
const outputDirectory = path.join(root, "data", "health-assistant", ".local");
const outputPath = path.join(outputDirectory, "vector-index.json");
const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const model = process.env.OLLAMA_EMBEDDING_MODEL || "qwen3-embedding:0.6b";
const batchSize = 4;

function assertLocalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("OLLAMA_BASE_URL ต้องเป็น http://127.0.0.1:11434 หรือ http://localhost:11434 เท่านั้น เพื่อให้ข้อมูลอยู่ในเครื่อง");
  }
}

function validateCorpus(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.sources) || !Array.isArray(data.chunks)) {
    throw new Error("รูปแบบ knowledge corpus ไม่ถูกต้อง");
  }
  const sources = new Map(data.sources.map((source) => [source.id, source]));
  const seen = new Set();
  for (const chunk of data.chunks) {
    if (!chunk.id || seen.has(chunk.id)) throw new Error("พบ chunk id ว่างหรือซ้ำ: " + chunk.id);
    seen.add(chunk.id);
    if (!sources.has(chunk.sourceId)) throw new Error("ไม่พบ source ของ chunk: " + chunk.id);
    if (typeof chunk.content !== "string" || chunk.content.trim().length < 40) throw new Error("เนื้อหา chunk สั้นหรือไม่ถูกต้อง: " + chunk.id);
    if (chunk.reviewStatus !== "awaiting_clinical_review") throw new Error("ทุก chunk ต้องรอการทบทวนทางคลินิก: " + chunk.id);
  }
}

async function embedBatch(texts) {
  const response = await fetch(baseUrl + "/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: texts, truncate: false, keep_alive: "2m" }),
    signal: AbortSignal.timeout(180000),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error("Ollama embeddings API ตอบ HTTP " + response.status + ": " + bodyText.slice(0, 500) +
      "\nตรวจว่าเปิด Ollama อยู่และดาวน์โหลดโมเดลด้วย: ollama pull " + model);
  }
  let body;
  try { body = JSON.parse(bodyText); } catch { throw new Error("Ollama ส่งผลลัพธ์ embeddings ที่ไม่ใช่ JSON"); }
  if (!Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) {
    throw new Error("จำนวน embeddings ที่ Ollama ส่งกลับไม่ตรงกับจำนวนข้อความ");
  }
  return body.embeddings;
}

assertLocalUrl(baseUrl);
const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
validateCorpus(corpus);

const chunks = [];
for (let offset = 0; offset < corpus.chunks.length; offset += batchSize) {
  const batch = corpus.chunks.slice(offset, offset + batchSize);
  const vectors = await embedBatch(batch.map((item) => item.content));
  for (let i = 0; i < batch.length; i += 1) {
    const vector = vectors[i];
    if (!Array.isArray(vector) || vector.length < 64 || !vector.every((n) => Number.isFinite(n))) {
      throw new Error("Embedding ไม่ถูกต้องสำหรับ chunk " + batch[i].id);
    }
    chunks.push({
      ...batch[i],
      source: corpus.sources.find((source) => source.id === batch[i].sourceId),
      embedding: vector,
    });
  }
  console.log("Embedded " + Math.min(offset + batch.length, corpus.chunks.length) + "/" + corpus.chunks.length + " chunks");
}

const dimensions = chunks[0]?.embedding.length || 0;
if (!dimensions || chunks.some((chunk) => chunk.embedding.length !== dimensions)) {
  throw new Error("Embedding dimensions ไม่สม่ำเสมอ");
}

const index = {
  schemaVersion: 1,
  datasetId: corpus.datasetId,
  language: corpus.language,
  embeddingModel: model,
  dimensions,
  generatedAt: new Date().toISOString(),
  chunkCount: chunks.length,
  sourceCount: corpus.sources.length,
  sources: corpus.sources,
  chunks,
};

await mkdir(outputDirectory, { recursive: true });
const temporaryPath = outputPath + ".tmp";
await writeFile(temporaryPath, JSON.stringify(index), "utf8");
await rename(temporaryPath, outputPath);
console.log("สร้าง Local RAG index สำเร็จ: " + outputPath);
console.log("Sources: " + corpus.sources.length + " | Chunks: " + chunks.length + " | Dimensions: " + dimensions);
console.log("Embedding model: " + model);
