import { HEALTH_KNOWLEDGE, searchHealthKnowledge, validateKnowledgeQuery, type HealthKnowledgeDocument } from "./knowledge";

export type KnowledgeChunkSection = "summary" | "key-point";

export interface HealthKnowledgeChunk {
  chunkId: string;
  documentId: string;
  title: string;
  section: KnowledgeChunkSection;
  sectionLabel: string;
  text: string;
  publisher: string;
  publishedAt: string;
  sourceUrl: string;
  sourceType: string;
  reviewStatus: "awaiting_clinical_review";
  lexicalScore: number;
  retrievalMethod: "curated-registry-lexical";
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("th-TH").normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
}

function candidateChunks(document: HealthKnowledgeDocument): Array<Omit<HealthKnowledgeChunk, "lexicalScore" | "retrievalMethod">> {
  const common = {
    documentId: document.id,
    title: document.title,
    publisher: document.publisher,
    publishedAt: document.publishedAt,
    sourceUrl: document.sourceUrl,
    sourceType: document.sourceType,
    reviewStatus: document.reviewStatus,
  } as const;
  return [
    {
      ...common,
      chunkId: `${document.id}:summary`,
      section: "summary",
      sectionLabel: "สรุปในทะเบียนความรู้",
      text: document.summary,
    },
    ...document.keyPoints.map((point, index) => ({
      ...common,
      chunkId: `${document.id}:point:${index + 1}`,
      section: "key-point" as const,
      sectionLabel: `ประเด็นสำคัญ ${index + 1}`,
      text: point,
    })),
  ];
}

export function retrieveHealthKnowledgeChunks(query: string, limit = 8): HealthKnowledgeChunk[] {
  const validation = validateKnowledgeQuery({ query });
  if (!validation.ok) return [];

  const normalizedQuery = normalize(validation.query);
  const documentMatches = searchHealthKnowledge(validation.query, 8);
  if (documentMatches.length === 0) return [];
  const matchingIds = new Map(documentMatches.map((item) => [item.id, item.relevance]));
  const documents = HEALTH_KNOWLEDGE.filter((document) => matchingIds.has(document.id));
  const candidates: HealthKnowledgeChunk[] = [];

  for (const document of documents) {
    const documentScore = matchingIds.get(document.id) ?? 0;
    const keywordHits = document.keywords
      .map(normalize)
      .filter((keyword) => keyword.length >= 2 && normalizedQuery.includes(keyword));
    for (const chunk of candidateChunks(document)) {
      const normalizedText = normalize(chunk.text);
      const phraseMatch = normalizedQuery.length >= 3 && normalizedText.includes(normalizedQuery);
      const textTermHits = keywordHits.filter((keyword) => normalizedText.includes(keyword)).length;
      const lexicalScore = documentScore + (phraseMatch ? 8 : 0) + textTermHits * 2;
      if (lexicalScore <= 0) continue;
      candidates.push({ ...chunk, lexicalScore, retrievalMethod: "curated-registry-lexical" });
    }
  }

  candidates.sort((left, right) => right.lexicalScore - left.lexicalScore || left.documentId.localeCompare(right.documentId) || left.chunkId.localeCompare(right.chunkId));
  const safeLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 8, 8));
  const perDocument = new Map<string, number>();
  const selected: HealthKnowledgeChunk[] = [];
  for (const candidate of candidates) {
    const count = perDocument.get(candidate.documentId) ?? 0;
    if (count >= 2) continue;
    selected.push(candidate);
    perDocument.set(candidate.documentId, count + 1);
    if (selected.length >= safeLimit) break;
  }
  return selected;
}
