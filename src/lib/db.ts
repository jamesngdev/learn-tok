import Database from "better-sqlite3";

export type DB = Database.Database;

const MIGRATION = `
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guid TEXT UNIQUE NOT NULL,
  source_url TEXT NOT NULL,
  title_en TEXT NOT NULL,
  summary_en TEXT NOT NULL,
  summary_vi TEXT NOT NULL,
  category TEXT NOT NULL,
  cefr TEXT NOT NULL,
  published_at TEXT NOT NULL,
  crawled_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_order ON articles (published_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS words (
  word TEXT PRIMARY KEY,
  ipa TEXT,
  audio_url TEXT,
  pos TEXT,
  meaning_vi TEXT,
  example TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS my_words (
  word TEXT PRIMARY KEY,
  saved_at TEXT NOT NULL,
  source_article_id INTEGER
);

CREATE TABLE IF NOT EXISTS knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  title_en TEXT NOT NULL,
  summary_en TEXT NOT NULL,
  summary_vi TEXT NOT NULL,
  detail_md TEXT NOT NULL,
  diagram TEXT NOT NULL,
  cefr TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_order ON knowledge (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS ignored (
  card_type TEXT NOT NULL,
  card_id INTEGER NOT NULL,
  ignored_at TEXT NOT NULL,
  PRIMARY KEY (card_type, card_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDb(dbPath?: string): DB {
  const path = dbPath ?? process.env.DATABASE_PATH ?? "./dailytok.db";
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  // The web and crawler run as separate processes against the same DB file;
  // wait rather than fail if the other holds a write lock momentarily.
  db.pragma("busy_timeout = 5000");
  db.exec(MIGRATION);
  return db;
}
