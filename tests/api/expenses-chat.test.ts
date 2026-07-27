import { describe, it, expect, vi, beforeEach } from "vitest";
import { openDb } from "@/lib/db";

const testDb = openDb(":memory:");
vi.mock("@/lib/server-db", () => ({ getServerDb: () => testDb }));

/** What the canned model will do on each successive call. */
const script: any[][] = [];
const seen: { messages: any[]; tools: any }[] = [];

vi.mock("@/lib/deepseek", () => ({
  deepseekToolStream: vi.fn(async function* (messages: any[], tools?: any[]) {
    seen.push({ messages: JSON.parse(JSON.stringify(messages)), tools });
    for (const ev of script.shift() ?? []) yield ev;
  }),
}));

beforeEach(() => {
  testDb.exec("DELETE FROM expenses");
  script.length = 0;
  seen.length = 0;
});

async function post(body: unknown) {
  const { POST } = await import("@/app/api/expenses/chat/route");
  return POST(
    new Request("http://t/api/expenses/chat", { method: "POST", body: JSON.stringify(body) })
  );
}

/** Read the NDJSON body back into events. */
async function events(res: Response) {
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

describe("POST /api/expenses/chat", () => {
  it("rejects a body with no user message", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ messages: [{ role: "user", content: "  " }] })).status).toBe(400);
  });

  it("writes the expenses the model extracts and streams NDJSON back", async () => {
    script.push([
      {
        type: "tool_calls",
        calls: [
          {
            id: "c1",
            name: "add_expenses",
            arguments: JSON.stringify({
              items: [
                { amount: 45000, category: "Ăn uống", note: "Cơm trưa" },
                { amount: 5000, category: "Di chuyển", note: "Gửi xe" },
              ],
            }),
          },
        ],
      },
    ]);
    script.push([{ type: "text", delta: "Đã ghi 2 khoản." }]);

    const res = await post({ messages: [{ role: "user", content: "trưa cơm 45k, gửi xe 5k" }] });
    expect(res.headers.get("content-type")).toContain("ndjson");

    const out = await events(res);
    expect(out[0].t).toBe("tool");
    expect(out[0].result.added).toHaveLength(2);
    expect(out[0].result.today_total).toBe(50000);
    expect(out[out.length - 1]).toEqual({ t: "text", d: "Đã ghi 2 khoản." });

    // The rows really are in the DB, not just echoed back.
    const rows = testDb.prepare("SELECT amount, category, note FROM expenses ORDER BY id").all();
    expect(rows).toEqual([
      { amount: 45000, category: "Ăn uống", note: "Cơm trưa" },
      { amount: 5000, category: "Di chuyển", note: "Gửi xe" },
    ]);
  });

  it("answers a question from SQL-computed numbers", async () => {
    testDb
      .prepare(
        `INSERT INTO expenses (amount, category, note, spent_on, created_at, source)
         VALUES (200000, 'Ăn uống', 'Lẩu', date('now'), '2026-07-27T00:00:00Z', 'manual')`
      )
      .run();

    script.push([
      {
        type: "tool_calls",
        calls: [
          {
            id: "q1",
            name: "query_expenses",
            arguments: JSON.stringify({ period: "this_month", group_by: "category" }),
          },
        ],
      },
    ]);
    script.push([{ type: "text", delta: "Ăn uống 200.000đ." }]);

    const out = await events(await post({ messages: [{ role: "user", content: "tháng này ăn bao nhiêu?" }] }));
    expect(out[0].result.total).toBe(200000);
    expect(out[0].result.rows[0]).toEqual({ key: "Ăn uống", total: 200000, count: 1 });

    // The tool result was handed back to the model before it answered.
    const second = seen[1].messages;
    expect(second[second.length - 1].role).toBe("tool");
  });

  it("sends the category list and today's date in the system prompt", async () => {
    script.push([{ type: "text", delta: "ok" }]);
    await post({ messages: [{ role: "user", content: "hi" }] });
    expect(seen[0].messages[0].content).toContain("Ăn uống");
    expect(seen[0].messages[0].content).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("reports a DeepSeek failure in-band, after the 200 has gone out", async () => {
    const { deepseekToolStream } = await import("@/lib/deepseek");
    vi.mocked(deepseekToolStream).mockImplementationOnce(async function* () {
      throw new Error("502");
    } as any);

    const res = await post({ messages: [{ role: "user", content: "cơm 45k" }] });
    expect(res.status).toBe(200);
    expect(await events(res)).toEqual([{ t: "error", m: "Không gọi được DeepSeek. Thử lại nhé." }]);
  });
});
