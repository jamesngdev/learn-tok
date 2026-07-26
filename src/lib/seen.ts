import type { DB } from "./db";
import type { CardType } from "./ignore";

/** Cap one request so a runaway client can't dump thousands of ids. */
export const MAX_SEEN_PER_CALL = 100;

/**
 * Remember that the user scrolled past these cards. Returns how many rows were
 * newly recorded (ids already marked are ignored).
 */
export function markSeen(db: DB, cardType: CardType, cardIds: number[], now: string): number {
  const ids = [...new Set(cardIds.filter((id) => Number.isInteger(id) && id > 0))].slice(
    0,
    MAX_SEEN_PER_CALL
  );
  if (ids.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO seen (card_type, card_id, seen_at) VALUES (?, ?, ?)`
  );
  let added = 0;
  const run = db.transaction(() => {
    for (const id of ids) added += stmt.run(cardType, id, now).changes;
  });
  run();
  return added;
}

export function countSeen(db: DB, cardType: CardType): number {
  const row = db
    .prepare("SELECT COUNT(*) c FROM seen WHERE card_type = ?")
    .get(cardType) as { c: number };
  return row.c;
}
