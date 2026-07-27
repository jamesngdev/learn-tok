import type { DB } from "./db";
import { monthEnd, monthStart, todayInVN } from "./expense-date";

export interface Expense {
  id: number;
  amount: number;
  category: string;
  note: string;
  spent_on: string;
  created_at: string;
  source: string;
}

export interface ExpenseCategory {
  name: string;
  emoji: string;
}

export interface NewExpense {
  amount: number;
  category: string;
  note?: string;
  spent_on?: string;
  source?: "chat" | "manual";
}

export interface ExpenseEdit {
  amount?: number;
  category?: string;
  note?: string;
  spent_on?: string;
}

/** Where an unrecognised category ends up. Always present after seeding. */
export const FALLBACK_CATEGORY = "Khác";

export function listCategories(db: DB): ExpenseCategory[] {
  return db
    .prepare("SELECT name, emoji FROM expense_categories ORDER BY sort ASC, name ASC")
    .all() as ExpenseCategory[];
}

export function addCategory(db: DB, name: string, emoji = ""): ExpenseCategory[] {
  const clean = name.trim().slice(0, 40);
  if (clean) {
    db.prepare(
      `INSERT OR IGNORE INTO expense_categories (name, emoji, sort, created_at)
       VALUES (?, ?, 900, ?)`
    ).run(clean, emoji.trim().slice(0, 8), new Date().toISOString());
  }
  return listCategories(db);
}

/**
 * Delete a category and move its expenses to "Khác" — the history stays, only
 * the label changes. Deleting "Khác" itself is a no-op, since it is where
 * everything else lands.
 */
export function deleteCategory(db: DB, name: string): ExpenseCategory[] {
  if (name !== FALLBACK_CATEGORY) {
    db.transaction(() => {
      db.prepare("UPDATE expenses SET category = ? WHERE category = ?").run(
        FALLBACK_CATEGORY,
        name
      );
      db.prepare("DELETE FROM expense_categories WHERE name = ?").run(name);
    })();
  }
  return listCategories(db);
}

/**
 * Loosen a category name for matching: drop emoji, fold case, collapse spaces.
 * The model reads the category list off a prompt, and it will sometimes echo a
 * name back with the emoji still attached ("🧾 Hóa đơn") — that has to match.
 */
function normalizeName(name: string): string {
  return name
    .replace(/[\p{Extended_Pictographic}‍️]/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match a model-supplied category against the real list. Anything unknown
 * becomes "Khác" rather than silently creating a near-duplicate category.
 */
export function resolveCategory(db: DB, raw: unknown): { category: string; matched: boolean } {
  const want = typeof raw === "string" ? normalizeName(raw) : "";
  if (!want) return { category: FALLBACK_CATEGORY, matched: false };
  const hit = listCategories(db).find((c) => normalizeName(c.name) === want);
  return hit ? { category: hit.name, matched: true } : { category: FALLBACK_CATEGORY, matched: false };
}

export function addExpense(db: DB, e: NewExpense): Expense {
  const info = db
    .prepare(
      `INSERT INTO expenses (amount, category, note, spent_on, created_at, source)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      Math.round(e.amount),
      e.category,
      (e.note ?? "").trim().slice(0, 200),
      e.spent_on ?? todayInVN(),
      new Date().toISOString(),
      e.source ?? "chat"
    );
  return getExpense(db, Number(info.lastInsertRowid))!;
}

export function getExpense(db: DB, id: number): Expense | null {
  const row = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id) as Expense | undefined;
  return row ?? null;
}

export function updateExpense(db: DB, id: number, patch: ExpenseEdit): Expense | null {
  const current = getExpense(db, id);
  if (!current) return null;
  db.prepare(
    `UPDATE expenses SET amount = ?, category = ?, note = ?, spent_on = ? WHERE id = ?`
  ).run(
    patch.amount === undefined ? current.amount : Math.round(patch.amount),
    patch.category ?? current.category,
    patch.note === undefined ? current.note : patch.note.trim().slice(0, 200),
    patch.spent_on ?? current.spent_on,
    id
  );
  return getExpense(db, id);
}

export function deleteExpense(db: DB, id: number): Expense | null {
  const doomed = getExpense(db, id);
  if (!doomed) return null;
  db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  return doomed;
}

export function listByDay(db: DB, day: string): Expense[] {
  return db
    .prepare("SELECT * FROM expenses WHERE spent_on = ? ORDER BY id DESC")
    .all(day) as Expense[];
}

export function listRange(db: DB, from: string, to: string, limit = 200): Expense[] {
  return db
    .prepare(
      `SELECT * FROM expenses WHERE spent_on BETWEEN ? AND ?
       ORDER BY amount DESC, id DESC LIMIT ?`
    )
    .all(from, to, limit) as Expense[];
}

/** Every total the app shows comes from here — SQL sums, never model arithmetic. */
export function totalRange(db: DB, from: string, to: string, category?: string): number {
  const row = category
    ? (db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS t FROM expenses
           WHERE spent_on BETWEEN ? AND ? AND category = ?`
        )
        .get(from, to, category) as { t: number })
    : (db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE spent_on BETWEEN ? AND ?`
        )
        .get(from, to) as { t: number });
  return row.t;
}

export function countRange(db: DB, from: string, to: string, category?: string): number {
  const row = category
    ? (db
        .prepare(
          `SELECT COUNT(*) AS c FROM expenses
           WHERE spent_on BETWEEN ? AND ? AND category = ?`
        )
        .get(from, to, category) as { c: number })
    : (db
        .prepare(`SELECT COUNT(*) AS c FROM expenses WHERE spent_on BETWEEN ? AND ?`)
        .get(from, to) as { c: number });
  return row.c;
}

export interface Bucket {
  key: string;
  total: number;
  count: number;
}

export function sumByCategory(db: DB, from: string, to: string): Bucket[] {
  return db
    .prepare(
      `SELECT category AS key, SUM(amount) AS total, COUNT(*) AS count
       FROM expenses WHERE spent_on BETWEEN ? AND ?
       GROUP BY category ORDER BY total DESC`
    )
    .all(from, to) as Bucket[];
}

export function sumByDay(db: DB, from: string, to: string): Bucket[] {
  return db
    .prepare(
      `SELECT spent_on AS key, SUM(amount) AS total, COUNT(*) AS count
       FROM expenses WHERE spent_on BETWEEN ? AND ?
       GROUP BY spent_on ORDER BY key DESC`
    )
    .all(from, to) as Bucket[];
}

export interface DayView {
  day: string;
  items: Expense[];
  day_total: number;
  month_total: number;
  categories: ExpenseCategory[];
}

/** Everything the expense screen needs for one day, in a single read. */
export function getDayView(db: DB, day: string): DayView {
  return {
    day,
    items: listByDay(db, day),
    day_total: totalRange(db, day, day),
    month_total: totalRange(db, monthStart(day), monthEnd(day)),
    categories: listCategories(db),
  };
}

/** Today's + this month's totals — the pair shown in the header. */
export function currentTotals(db: DB, today: string = todayInVN()): {
  today_total: number;
  month_total: number;
} {
  return {
    today_total: totalRange(db, today, today),
    month_total: totalRange(db, monthStart(today), monthEnd(today)),
  };
}
