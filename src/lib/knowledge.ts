import type { DB } from "./db";
import type { Cefr, KnowledgeGenerated, KnowledgeDetail } from "./types";
import { deepseekComplete, type CompleteFn } from "./deepseek";

const VALID_CEFR: Cefr[] = ["A2", "B1", "B2", "C1"];

const SYSTEM_PROMPT = `You are a staff-level backend engineering mentor teaching an ambitious mid-level backend developer.
Pick ONE focused, advanced backend topic in the areas of database optimization, system design / scalability,
security, or advanced backend techniques (concurrency, caching, messaging, observability, etc.).
Teach it in ENGLISH (the reader is also practicing technical English).

Respond with ONLY a JSON object with keys:
"topic" (a short unique title of the concept, e.g. "Database connection pooling"),
"category" (exactly one of: Database, System, Security, Technique),
"title_en" (a punchy card headline),
"summary_en" (2-3 sentence hook explaining why it matters — fits one phone card),
"summary_vi" (Vietnamese translation of summary_en),
"detail_md" (an IN-DEPTH Markdown lesson, roughly 500-900 words, with these sections:
   "## The Problem" (real-world scenario + what breaks and why),
   "## How It Works" (the underlying mechanism/theory),
   "## The Solution" (a concrete, production-grade approach with a realistic code snippet in a fenced block),
   "## Trade-offs & Pitfalls" (what it costs, when NOT to use it, common mistakes),
   "## Rule of Thumb" (crisp actionable guidance + rough numbers).
   Be specific and practical — name real tools, configs, and numbers, not generic advice),
"diagram" (a Mermaid diagram illustrating the concept, e.g. "flowchart LR\\n A-->B", or "" if not helpful),
"cefr" (reading difficulty of summary_en: one of A2, B1, B2, C1).`;

function interestClause(interests: string[]): string {
  if (interests.length === 0) return "";
  return `\n\nThe reader is especially interested in these areas — strongly prefer topics within or closely related to them:\n- ${interests.join(
    "\n- "
  )}`;
}

function parseKnowledge(raw: string): KnowledgeGenerated {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("DeepSeek returned non-JSON output");
  }
  for (const key of ["topic", "category", "title_en", "summary_en", "summary_vi", "detail_md"] as const) {
    if (typeof obj[key] !== "string" || obj[key].trim() === "") {
      throw new Error(`knowledge response missing field: ${key}`);
    }
  }
  const cefr: Cefr = VALID_CEFR.includes(obj.cefr) ? obj.cefr : "B2";
  return {
    topic: obj.topic.trim(),
    category: obj.category.trim(),
    title_en: obj.title_en.trim(),
    summary_en: obj.summary_en.trim(),
    summary_vi: obj.summary_vi.trim(),
    detail_md: obj.detail_md.trim(),
    diagram: typeof obj.diagram === "string" ? obj.diagram.trim() : "",
    cefr,
  };
}

export async function generateKnowledge(
  existingTopics: string[],
  interests: string[] = [],
  complete: CompleteFn = deepseekComplete
): Promise<KnowledgeGenerated> {
  const avoid =
    existingTopics.length > 0
      ? `Do NOT repeat any of these already-covered topics:\n- ${existingTopics.join("\n- ")}`
      : "This is the first topic.";
  const raw = await complete(SYSTEM_PROMPT, avoid + interestClause(interests));
  return parseKnowledge(raw);
}

export function listKnowledgeTopics(db: DB): string[] {
  return (db.prepare("SELECT topic FROM knowledge").all() as { topic: string }[]).map(
    (r) => r.topic
  );
}

/** Insert a generated card. Returns false if the topic already exists. */
export function insertKnowledge(db: DB, k: KnowledgeGenerated, now: string): boolean {
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO knowledge
         (topic, category, title_en, summary_en, summary_vi, detail_md, diagram, cefr, created_at)
       VALUES (@topic, @category, @title_en, @summary_en, @summary_vi, @detail_md, @diagram, @cefr, @created_at)`
    )
    .run({ ...k, created_at: now });
  return info.changes > 0;
}

/** Number of knowledge cards not ignored by the user. */
export function countActiveKnowledge(db: DB): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) c FROM knowledge k
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='knowledge' AND i.card_id=k.id)`
    )
    .get() as { c: number };
  return row.c;
}

export function getKnowledgeDetail(db: DB, id: number): KnowledgeDetail | null {
  const row = db
    .prepare(
      `SELECT id, category, title_en, summary_en, summary_vi, detail_md, diagram
       FROM knowledge WHERE id = ?`
    )
    .get(id) as KnowledgeDetail | undefined;
  return row ?? null;
}

export interface KnowledgeDeps {
  generate: (existingTopics: string[]) => Promise<KnowledgeGenerated>;
  now: () => string;
}

/**
 * Generate up to `count` new, non-duplicate knowledge cards.
 * Returns how many were actually inserted.
 */
export async function generateKnowledgeBatch(
  db: DB,
  count: number,
  deps: KnowledgeDeps
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < count; i++) {
    try {
      const topics = listKnowledgeTopics(db);
      const k = await deps.generate(topics);
      if (insertKnowledge(db, k, deps.now())) inserted++;
    } catch (err) {
      console.error("knowledge generation failed:", err);
    }
  }
  return inserted;
}
