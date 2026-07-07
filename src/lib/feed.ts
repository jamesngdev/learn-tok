import type { DB } from "./db";
import type { Card, NewsCard, KnowledgeCard } from "./types";

export interface FeedPage {
  cards: Card[];
  nextCursor: string | null;
}

// One knowledge card every 5th slot (i.e. 1 knowledge per 4 news).
const CYCLE = 5;
const KNOWLEDGE_SLOT = 4;

interface Cursor {
  emitted: number;
  n: string | null; // "published_at|id" of last news
  k: string | null; // "created_at|id" of last knowledge
}

function decodeCursor(cursor?: string | null): Cursor {
  if (!cursor) return { emitted: 0, n: null, k: null };
  try {
    const obj = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
    return {
      emitted: Number(obj.emitted) || 0,
      n: obj.n ?? null,
      k: obj.k ?? null,
    };
  } catch {
    return { emitted: 0, n: null, k: null };
  }
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64");
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

function fetchNews(db: DB, cur: string | null, limit: number): any[] {
  if (cur) {
    const [pub, id] = cur.split("|");
    return db
      .prepare(
        `SELECT * FROM articles a
         WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='news' AND i.card_id=a.id)
           AND (a.published_at < ? OR (a.published_at = ? AND a.id < ?))
         ORDER BY a.published_at DESC, a.id DESC LIMIT ?`
      )
      .all(pub, pub, Number(id), limit);
  }
  return db
    .prepare(
      `SELECT * FROM articles a
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='news' AND i.card_id=a.id)
       ORDER BY a.published_at DESC, a.id DESC LIMIT ?`
    )
    .all(limit);
}

// Knowledge is ordered oldest-first so newly generated cards append to the
// runway and appear as the user scrolls deeper (rather than at the very top).
function fetchKnowledge(db: DB, cur: string | null, limit: number): any[] {
  if (cur) {
    const [created, id] = cur.split("|");
    return db
      .prepare(
        `SELECT id, category, title_en, summary_en, summary_vi, cefr, created_at FROM knowledge k
         WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='knowledge' AND i.card_id=k.id)
           AND (k.created_at > ? OR (k.created_at = ? AND k.id > ?))
         ORDER BY k.created_at ASC, k.id ASC LIMIT ?`
      )
      .all(created, created, Number(id), limit);
  }
  return db
    .prepare(
      `SELECT id, category, title_en, summary_en, summary_vi, cefr, created_at FROM knowledge k
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='knowledge' AND i.card_id=k.id)
       ORDER BY k.created_at ASC, k.id ASC LIMIT ?`
    )
    .all(limit);
}

function hasMoreNews(db: DB, cur: string | null): boolean {
  if (!cur) {
    return !!db
      .prepare(
        `SELECT 1 FROM articles a WHERE NOT EXISTS
         (SELECT 1 FROM ignored i WHERE i.card_type='news' AND i.card_id=a.id) LIMIT 1`
      )
      .get();
  }
  const [pub, id] = cur.split("|");
  return !!db
    .prepare(
      `SELECT 1 FROM articles a
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='news' AND i.card_id=a.id)
         AND (a.published_at < ? OR (a.published_at = ? AND a.id < ?)) LIMIT 1`
    )
    .get(pub, pub, Number(id));
}

function hasMoreKnowledge(db: DB, cur: string | null): boolean {
  if (!cur) {
    return !!db
      .prepare(
        `SELECT 1 FROM knowledge k WHERE NOT EXISTS
         (SELECT 1 FROM ignored i WHERE i.card_type='knowledge' AND i.card_id=k.id) LIMIT 1`
      )
      .get();
  }
  const [created, id] = cur.split("|");
  return !!db
    .prepare(
      `SELECT 1 FROM knowledge k
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='knowledge' AND i.card_id=k.id)
         AND (k.created_at > ? OR (k.created_at = ? AND k.id > ?)) LIMIT 1`
    )
    .get(created, created, Number(id));
}

export function getFeed(db: DB, cursor?: string | null, limit = 10): FeedPage {
  const { emitted, n: newsCur, k: kCur } = decodeCursor(cursor);
  const news = fetchNews(db, newsCur, limit);
  const knowledge = fetchKnowledge(db, kCur, limit);

  const cards: Card[] = [];
  let ni = 0;
  let ki = 0;
  let pos = emitted;
  while (cards.length < limit) {
    const wantKnowledge = pos % CYCLE === KNOWLEDGE_SLOT;
    if (wantKnowledge) {
      if (ki < knowledge.length) cards.push(knowledgeToCard(knowledge[ki++]));
      else if (ni < news.length) cards.push(newsToCard(news[ni++]));
      else break;
    } else {
      if (ni < news.length) cards.push(newsToCard(news[ni++]));
      else if (ki < knowledge.length) cards.push(knowledgeToCard(knowledge[ki++]));
      else break;
    }
    pos++;
  }

  const lastNews = ni > 0 ? news[ni - 1] : null;
  const lastK = ki > 0 ? knowledge[ki - 1] : null;
  const newNewsCur = lastNews ? `${lastNews.published_at}|${lastNews.id}` : newsCur;
  const newKCur = lastK ? `${lastK.created_at}|${lastK.id}` : kCur;

  const more = hasMoreNews(db, newNewsCur) || hasMoreKnowledge(db, newKCur);
  const nextCursor = more
    ? encodeCursor({ emitted: emitted + cards.length, n: newNewsCur, k: newKCur })
    : null;

  return { cards, nextCursor };
}
