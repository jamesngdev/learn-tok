import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB } from "@/lib/db";
import {
  addCategory,
  addExpense,
  deleteCategory,
  deleteExpense,
  getDayView,
  listByDay,
  listCategories,
  resolveCategory,
  sumByCategory,
  sumByDay,
  totalRange,
  updateExpense,
} from "@/lib/expenses";

let db: DB;

beforeEach(() => {
  db = openDb(":memory:");
});

function seed() {
  addExpense(db, { amount: 45000, category: "Ăn uống", note: "Cơm trưa", spent_on: "2026-07-27" });
  addExpense(db, { amount: 5000, category: "Di chuyển", note: "Gửi xe", spent_on: "2026-07-27" });
  addExpense(db, { amount: 70000, category: "Di chuyển", note: "Đổ xăng", spent_on: "2026-07-26" });
  addExpense(db, { amount: 2_000_000, category: "Nhà ở", note: "Tiền nhà", spent_on: "2026-06-01" });
}

describe("categories", () => {
  it("seeds the starter list once", () => {
    const names = listCategories(db).map((c) => c.name);
    expect(names).toContain("Ăn uống");
    expect(names).toContain("Khác");
    expect(names).toHaveLength(10);
  });

  it("matches a category ignoring case, and falls back to Khác", () => {
    expect(resolveCategory(db, "ăn UỐNG")).toEqual({ category: "Ăn uống", matched: true });
    expect(resolveCategory(db, "Crypto")).toEqual({ category: "Khác", matched: false });
    expect(resolveCategory(db, "")).toEqual({ category: "Khác", matched: false });
  });

  it("matches even when the model echoes the emoji back with the name", () => {
    // Seen for real: the model answered with "🧾 Hóa đơn" and the expense
    // silently landed in "Khác".
    expect(resolveCategory(db, "🧾 Hóa đơn")).toEqual({ category: "Hóa đơn", matched: true });
    expect(resolveCategory(db, "🛍️  Mua  sắm")).toEqual({ category: "Mua sắm", matched: true });
  });

  it("adds a category without duplicating an existing one", () => {
    addCategory(db, "Thú cưng", "🐶");
    addCategory(db, "Thú cưng", "🐱");
    expect(listCategories(db).filter((c) => c.name === "Thú cưng")).toHaveLength(1);
  });

  it("moves expenses to Khác when their category is deleted", () => {
    seed();
    deleteCategory(db, "Di chuyển");
    expect(listCategories(db).map((c) => c.name)).not.toContain("Di chuyển");
    // The spending itself survives — only the label changed.
    expect(new Set(listByDay(db, "2026-07-27").map((e) => e.category))).toEqual(
      new Set(["Ăn uống", "Khác"])
    );
    expect(totalRange(db, "2026-07-26", "2026-07-27")).toBe(120000);
  });

  it("refuses to delete the fallback category", () => {
    expect(deleteCategory(db, "Khác").map((c) => c.name)).toContain("Khác");
  });
});

describe("expenses", () => {
  it("lists a day newest-first and totals the day and the month in SQL", () => {
    seed();
    const view = getDayView(db, "2026-07-27");
    expect(view.items.map((e) => e.note)).toEqual(["Gửi xe", "Cơm trưa"]);
    expect(view.day_total).toBe(50000);
    expect(view.month_total).toBe(120000); // July only — June's rent excluded
  });

  it("rounds amounts to whole VND and clips the note", () => {
    const saved = addExpense(db, {
      amount: 45000.6,
      category: "Khác",
      note: "x".repeat(400),
      spent_on: "2026-07-27",
    });
    expect(saved.amount).toBe(45001);
    expect(saved.note).toHaveLength(200);
  });

  it("updates only the fields given", () => {
    const saved = addExpense(db, {
      amount: 45000,
      category: "Ăn uống",
      note: "Cơm trưa",
      spent_on: "2026-07-27",
    });
    const updated = updateExpense(db, saved.id, { amount: 50000 });
    expect(updated).toMatchObject({ amount: 50000, note: "Cơm trưa", category: "Ăn uống" });
  });

  it("returns null when updating or deleting an unknown id", () => {
    expect(updateExpense(db, 999, { amount: 1000 })).toBeNull();
    expect(deleteExpense(db, 999)).toBeNull();
  });

  it("groups totals by category and by day, biggest first", () => {
    seed();
    expect(sumByCategory(db, "2026-07-01", "2026-07-31")).toEqual([
      { key: "Di chuyển", total: 75000, count: 2 },
      { key: "Ăn uống", total: 45000, count: 1 },
    ]);
    expect(sumByDay(db, "2026-07-01", "2026-07-31")).toEqual([
      { key: "2026-07-27", total: 50000, count: 2 },
      { key: "2026-07-26", total: 70000, count: 1 },
    ]);
  });

  it("totals a single category over a range", () => {
    seed();
    expect(totalRange(db, "2026-07-01", "2026-07-31", "Di chuyển")).toBe(75000);
    expect(totalRange(db, "2026-07-01", "2026-07-31", "Giải trí")).toBe(0);
  });
});
