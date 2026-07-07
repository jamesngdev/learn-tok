import type { DB } from "./db";
import type { Card, NewsCard } from "./types";

export interface FeedPage {
  cards: Card[];
  nextCursor: string | null;
}

function toCard(row: any): NewsCard {
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

export function getFeed(
  db: DB,
  cursor?: string | null,
  limit = 10
): FeedPage {
  let rows: any[];
  if (cursor) {
    const [pub, idStr] = cursor.split("|");
    rows = db
      .prepare(
        `SELECT * FROM articles
         WHERE (published_at < ?) OR (published_at = ? AND id < ?)
         ORDER BY published_at DESC, id DESC LIMIT ?`
      )
      .all(pub, pub, Number(idStr), limit + 1);
  } else {
    rows = db
      .prepare(
        `SELECT * FROM articles ORDER BY published_at DESC, id DESC LIMIT ?`
      )
      .all(limit + 1);
  }

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const cards = pageRows.map(toCard);
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last ? `${last.published_at}|${last.id}` : null;
  return { cards, nextCursor };
}
