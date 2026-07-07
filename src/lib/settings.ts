import type { DB } from "./db";

const INTERESTS_KEY = "interests";

export function getInterests(db: DB): string[] {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(INTERESTS_KEY) as { value: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function setInterests(db: DB, interests: string[]): void {
  const clean = interests
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 30);
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(INTERESTS_KEY, JSON.stringify(clean));
}
