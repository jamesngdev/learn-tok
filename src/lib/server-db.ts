import { openDb, type DB } from "./db";

let db: DB | null = null;

export function getServerDb(): DB {
  if (!db) db = openDb();
  return db;
}
