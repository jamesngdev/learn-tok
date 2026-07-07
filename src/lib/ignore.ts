import type { DB } from "./db";

export type CardType = "news" | "knowledge";

export function ignoreCard(
  db: DB,
  cardType: CardType,
  cardId: number,
  now: string
): void {
  db.prepare(
    `INSERT OR IGNORE INTO ignored (card_type, card_id, ignored_at) VALUES (?, ?, ?)`
  ).run(cardType, cardId, now);
}
