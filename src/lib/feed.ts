import type { DB } from "./db";
import type { Card, NewsCard, KnowledgeCard } from "./types";

export type FeedMode = "news" | "knowledge";

export interface FeedPage {
  cards: Card[];
  nextCursor: string | null;
}

function newsToCard(row: any): NewsCard {
  return {
    type: "news",
    id: row.id,
    title_en: row.title_en,
    summary_en: row.summary_en,
    summary_vi: row.summary_vi,
    category: row.category,
    cefr: row.cefr,
    source_url: row.source_url,
    published_at: row.published_at,
  };
}

function knowledgeToCard(row: any): KnowledgeCard {
  return {
    type: "knowledge",
    id: row.id,
    category: row.category,
    title_en: row.title_en,
    summary_en: row.summary_en,
    summary_vi: row.summary_vi,
    cefr: row.cefr,
    created_at: row.created_at,
  };
}

function fetchNews(db: DB, cursor: string | null, limit: number): any[] {
  if (cursor) {
    const [pub, id] = cursor.split("|");
    return db
      .prepare(
        `SELECT * FROM articles a
         WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='news' AND i.card_id=a.id)
           AND (a.published_at < ? OR (a.published_at = ? AND a.id < ?))
         ORDER BY a.published_at DESC, a.id DESC LIMIT ?`
      )
      .all(pub, pub, Number(id), limit + 1);
  }
  return db
    .prepare(
      `SELECT * FROM articles a
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='news' AND i.card_id=a.id)
       ORDER BY a.published_at DESC, a.id DESC LIMIT ?`
    )
    .all(limit + 1);
}

// Knowledge is ordered oldest-first so newly generated cards extend the runway
// as the user scrolls deeper (top-ups append to the end of the stream).
function fetchKnowledge(db: DB, cursor: string | null, limit: number): any[] {
  if (cursor) {
    const [created, id] = cursor.split("|");
    return db
      .prepare(
        `SELECT id, category, title_en, summary_en, summary_vi, cefr, created_at FROM knowledge k
         WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='knowledge' AND i.card_id=k.id)
           AND (k.created_at > ? OR (k.created_at = ? AND k.id > ?))
         ORDER BY k.created_at ASC, k.id ASC LIMIT ?`
      )
      .all(created, created, Number(id), limit + 1);
  }
  return db
    .prepare(
      `SELECT id, category, title_en, summary_en, summary_vi, cefr, created_at FROM knowledge k
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='knowledge' AND i.card_id=k.id)
       ORDER BY k.created_at ASC, k.id ASC LIMIT ?`
    )
    .all(limit + 1);
}

export function getFeed(
  db: DB,
  mode: FeedMode = "news",
  cursor?: string | null,
  limit = 10
): FeedPage {
  const rows =
    mode === "knowledge"
      ? fetchKnowledge(db, cursor ?? null, limit)
      : fetchNews(db, cursor ?? null, limit);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const cards: Card[] = pageRows.map((r) =>
    mode === "knowledge" ? knowledgeToCard(r) : newsToCard(r)
  );

  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last
      ? `${mode === "knowledge" ? last.created_at : last.published_at}|${last.id}`
      : null;

  return { cards, nextCursor };
}
