import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB } from "@/lib/db";
import { makeToolRunner } from "@/lib/expense-tools";
import { addExpense, listByDay } from "@/lib/expenses";

const TODAY = "2026-07-27";
let db: DB;
let run: ReturnType<typeof makeToolRunner>;

beforeEach(() => {
  db = openDb(":memory:");
  run = makeToolRunner(db, TODAY);
});

describe("add_expenses", () => {
  it("writes every item and reports the fresh totals", () => {
    const res: any = run("add_expenses", {
      items: [
        { amount: 45000, category: "Ăn uống", note: "Cơm trưa" },
        { amount: 5000, category: "Di chuyển", note: "Gửi xe" },
      ],
    });
    expect(res.added).toHaveLength(2);
    expect(res.today_total).toBe(50000);
    expect(res.month_total).toBe(50000);
    expect(listByDay(db, TODAY)).toHaveLength(2);
  });

  it("defaults the day to today and honours an explicit one", () => {
    run("add_expenses", {
      items: [
        { amount: 10000, category: "Khác", note: "hôm nay" },
        { amount: 20000, category: "Khác", note: "hôm qua", spent_on: "2026-07-26" },
      ],
    });
    expect(listByDay(db, TODAY).map((e) => e.note)).toEqual(["hôm nay"]);
    expect(listByDay(db, "2026-07-26").map((e) => e.note)).toEqual(["hôm qua"]);
  });

  it("flags an invented category instead of creating it", () => {
    const res: any = run("add_expenses", {
      items: [{ amount: 30000, category: "Crypto", note: "mua coin" }],
    });
    expect(res.added[0]).toMatchObject({ category: "Khác", category_fallback: true });
    expect(res.note_for_model).toBeTruthy();
  });

  it("flags a suspiciously small amount rather than silently trusting it", () => {
    const res: any = run("add_expenses", {
      items: [{ amount: 45, category: "Ăn uống", note: "Cơm trưa" }],
    });
    expect(res.added[0]).toMatchObject({ amount: 45, low_amount: true });
  });

  it("rejects bad amounts without writing them", () => {
    const res: any = run("add_expenses", {
      items: [
        { amount: 0, category: "Khác", note: "không" },
        { amount: "nhiều", category: "Khác", note: "không phải số" },
        { amount: 5_000_000_000, category: "Khác", note: "quá lớn" },
        { amount: 12000, category: "Khác", note: "ok" },
      ],
    });
    expect(res.added).toHaveLength(1);
    expect(res.rejected).toHaveLength(3);
    expect(listByDay(db, TODAY)).toHaveLength(1);
  });

  it("complains about an empty or oversized batch", () => {
    expect(run("add_expenses", { items: [] })).toHaveProperty("error");
    const many = Array.from({ length: 21 }, () => ({ amount: 1000, category: "Khác", note: "x" }));
    expect(run("add_expenses", { items: many })).toHaveProperty("error");
  });
});

describe("query_expenses", () => {
  beforeEach(() => {
    addExpense(db, { amount: 45000, category: "Ăn uống", note: "Cơm", spent_on: TODAY });
    addExpense(db, { amount: 70000, category: "Di chuyển", note: "Xăng", spent_on: "2026-07-26" });
    addExpense(db, { amount: 900000, category: "Nhà ở", note: "Điện", spent_on: "2026-06-10" });
  });

  it("resolves a named period server-side and sums in SQL", () => {
    const res: any = run("query_expenses", { period: "this_month", group_by: "category" });
    expect(res).toMatchObject({ from: "2026-07-01", to: "2026-07-31", total: 115000, count: 2 });
    expect(res.rows[0]).toEqual({ key: "Di chuyển", total: 70000, count: 1 });
  });

  it("honours an explicit from/to over the period", () => {
    const res: any = run("query_expenses", {
      period: "this_month",
      from: "2026-06-01",
      to: "2026-06-30",
      group_by: "none",
    });
    expect(res.total).toBe(900000);
    expect(res.rows[0]).toMatchObject({ note: "Điện" });
  });

  it("returns ids with group_by=none so rows can be edited afterwards", () => {
    const res: any = run("query_expenses", { period: "this_month", group_by: "none" });
    expect(res.rows[0]).toHaveProperty("id");
    // Biggest first, so "khoản nào lớn nhất" needs no model arithmetic.
    expect(res.rows.map((r: any) => r.amount)).toEqual([70000, 45000]);
  });

  it("filters by category, falling back to Khác for an unknown one", () => {
    expect(run("query_expenses", { period: "this_month", group_by: "none", category: "ăn uống" }))
      .toMatchObject({ category: "Ăn uống", total: 45000 });
    expect(run("query_expenses", { period: "this_month", group_by: "none", category: "Crypto" }))
      .toMatchObject({ category: "Khác", total: 0 });
  });
});

describe("update / delete / add_category", () => {
  it("updates an existing row and reports new totals", () => {
    const saved = addExpense(db, { amount: 45000, category: "Ăn uống", note: "Cơm", spent_on: TODAY });
    const res: any = run("update_expense", { id: saved.id, amount: 60000 });
    expect(res.updated).toMatchObject({ amount: 60000, note: "Cơm" });
    expect(res.today_total).toBe(60000);
  });

  it("reports a missing id instead of throwing", () => {
    expect(run("update_expense", { id: 404, amount: 1000 })).toHaveProperty("error");
    expect(run("delete_expense", { id: 404 })).toHaveProperty("error");
    expect(run("update_expense", { id: "abc" })).toHaveProperty("error");
  });

  it("deletes a row", () => {
    const saved = addExpense(db, { amount: 45000, category: "Khác", note: "Cơm", spent_on: TODAY });
    const res: any = run("delete_expense", { id: saved.id });
    expect(res.deleted).toMatchObject({ id: saved.id });
    expect(listByDay(db, TODAY)).toHaveLength(0);
  });

  it("adds a category and rejects an empty name", () => {
    const res: any = run("add_category", { name: "Thú cưng", emoji: "🐶" });
    expect(res.categories.map((c: any) => c.name)).toContain("Thú cưng");
    expect(run("add_category", { name: "  " })).toHaveProperty("error");
  });

  it("reports an unknown tool name", () => {
    expect(run("drop_database", {})).toHaveProperty("error");
  });
});
