import { describe, it, expect, vi, beforeEach } from "vitest";
import { openDb } from "@/lib/db";

const testDb = openDb(":memory:");
vi.mock("@/lib/server-db", () => ({ getServerDb: () => testDb }));

const DAY = "2026-07-27";

beforeEach(() => {
  testDb.exec("DELETE FROM expenses");
});

async function get(url: string) {
  const { GET } = await import("@/app/api/expenses/route");
  return GET(new Request(`http://t${url}`));
}

async function post(body: unknown) {
  const { POST } = await import("@/app/api/expenses/route");
  return POST(new Request("http://t/api/expenses", { method: "POST", body: JSON.stringify(body) }));
}

async function patch(id: number, body: unknown) {
  const { PATCH } = await import("@/app/api/expenses/[id]/route");
  return PATCH(
    new Request(`http://t/api/expenses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: String(id) }) }
  );
}

async function del(id: number) {
  const { DELETE } = await import("@/app/api/expenses/[id]/route");
  return DELETE(new Request(`http://t/api/expenses/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: String(id) }),
  });
}

describe("/api/expenses", () => {
  it("adds an expense by hand and returns the day it landed on", async () => {
    const res = await post({ amount: 45000, category: "Ăn uống", note: "Cơm trưa", spent_on: DAY });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ day: DAY, day_total: 45000, month_total: 45000 });
    expect(body.items[0]).toMatchObject({ note: "Cơm trưa", source: "manual" });
  });

  it("rejects an invalid amount", async () => {
    expect((await post({ amount: 0, category: "Khác" })).status).toBe(400);
    expect((await post({ amount: "nhiều", category: "Khác" })).status).toBe(400);
  });

  it("puts an unknown category in Khác instead of inventing one", async () => {
    const body = await (await post({ amount: 1000, category: "Crypto", spent_on: DAY })).json();
    expect(body.items[0].category).toBe("Khác");
  });

  it("reads one day, defaulting to today for a malformed day param", async () => {
    await post({ amount: 1000, category: "Khác", spent_on: DAY });
    const listed = await (await get(`/api/expenses?day=${DAY}`)).json();
    expect(listed.items).toHaveLength(1);
    const fallback = await (await get("/api/expenses?day=hôm-nay")).json();
    expect(fallback.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("edits an expense and recomputes the totals", async () => {
    const created = await (await post({ amount: 45000, category: "Khác", spent_on: DAY })).json();
    const id = created.items[0].id;
    const body = await (await patch(id, { amount: 60000, note: "sửa rồi" })).json();
    expect(body.updated).toMatchObject({ amount: 60000, note: "sửa rồi" });
    expect(body.day_total).toBe(60000);
  });

  it("returns the day an expense moved to when its date changes", async () => {
    const created = await (await post({ amount: 45000, category: "Khác", spent_on: DAY })).json();
    const body = await (await patch(created.items[0].id, { spent_on: "2026-07-20" })).json();
    expect(body.day).toBe("2026-07-20");
    expect(body.day_total).toBe(45000);
  });

  it("deletes an expense", async () => {
    const created = await (await post({ amount: 45000, category: "Khác", spent_on: DAY })).json();
    const body = await (await del(created.items[0].id)).json();
    expect(body.deleted).toMatchObject({ amount: 45000 });
    expect(body.items).toHaveLength(0);
  });

  it("404s on an unknown id", async () => {
    expect((await patch(4040, { amount: 1000 })).status).toBe(404);
    expect((await del(4040)).status).toBe(404);
  });
});

describe("/api/expenses/categories", () => {
  it("lists, adds, and deletes categories", async () => {
    const mod = await import("@/app/api/expenses/categories/route");

    const listed = await (await mod.GET()).json();
    expect(listed.categories.length).toBeGreaterThan(5);

    const added = await (
      await mod.POST(
        new Request("http://t/api/expenses/categories", {
          method: "POST",
          body: JSON.stringify({ name: "Thú cưng", emoji: "🐶" }),
        })
      )
    ).json();
    expect(added.categories.map((c: any) => c.name)).toContain("Thú cưng");

    const removed = await (
      await mod.DELETE(
        new Request("http://t/api/expenses/categories?name=" + encodeURIComponent("Thú cưng"), {
          method: "DELETE",
        })
      )
    ).json();
    expect(removed.categories.map((c: any) => c.name)).not.toContain("Thú cưng");
  });

  it("rejects an empty name", async () => {
    const mod = await import("@/app/api/expenses/categories/route");
    const res = await mod.POST(
      new Request("http://t/api/expenses/categories", {
        method: "POST",
        body: JSON.stringify({ name: "   " }),
      })
    );
    expect(res.status).toBe(400);
  });
});
