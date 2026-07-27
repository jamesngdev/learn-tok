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

-- Cards the user has already scrolled past. News is one-shot: once seen it
-- never comes back in the feed (knowledge cards are kept, they are re-readable).
CREATE TABLE IF NOT EXISTS seen (
  card_type TEXT NOT NULL,
  card_id INTEGER NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (card_type, card_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Chi tiêu (/chi-tieu). The category column holds the category *name*, not a
-- foreign key: deleting a category must never take its expenses down with it.
CREATE TABLE IF NOT EXISTS expense_categories (
  name       TEXT PRIMARY KEY,
  emoji      TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- VND as an integer. There is no sub-unit in VND, and floats accumulate
  -- rounding error once you start summing them.
  amount     INTEGER NOT NULL,
  category   TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  spent_on   TEXT NOT NULL,  -- YYYY-MM-DD in Asia/Ho_Chi_Minh
  created_at TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'chat'  -- 'chat' | 'manual'
);
CREATE INDEX IF NOT EXISTS idx_expenses_day ON expenses (spent_on DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_cat ON expenses (category, spent_on);
`;

/** Starter categories. Users add/remove their own on top of these. */
const DEFAULT_CATEGORIES: [string, string][] = [
  ["Ăn uống", "🍜"],
  ["Di chuyển", "🛵"],
  ["Nhà ở", "🏠"],
  ["Hóa đơn", "🧾"],
  ["Mua sắm", "🛍️"],
  ["Sức khoẻ", "💊"],
  ["Giải trí", "🎬"],
  ["Học tập", "📚"],
  ["Con cái", "🧒"],
  ["Khác", "📦"],
];

/**
 * Seed the starter categories once. `INSERT OR IGNORE` so a category the user
 * has since deleted does not come back on every boot... which it would if the
 * table were empty — hence the guard on the table being untouched.
 */
function seedExpenseCategories(db: DB): void {
  const seeded = db
    .prepare("SELECT 1 FROM settings WHERE key = 'expense_categories_seeded'")
    .get();
  if (seeded) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO expense_categories (name, emoji, sort, created_at)
     VALUES (?, ?, ?, ?)`
  );
  const now = new Date().toISOString();
  db.transaction(() => {
    DEFAULT_CATEGORIES.forEach(([name, emoji], i) => insert.run(name, emoji, i * 10, now));
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('expense_categories_seeded', '1')"
    ).run();
  })();
}

export function openDb(dbPath?: string): DB {
  const path = dbPath ?? process.env.DATABASE_PATH ?? "./dailytok.db";
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  // The web and crawler run as separate processes against the same DB file;
  // wait rather than fail if the other holds a write lock momentarily.
  db.pragma("busy_timeout = 5000");
  db.exec(MIGRATION);
  seedExpenseCategories(db);
  return db;
}
