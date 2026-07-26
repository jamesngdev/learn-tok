import { describe, it, expect, vi, beforeEach } from "vitest";
import { openDb } from "@/lib/db";

const testDb = openDb(":memory:");
vi.mock("@/lib/server-db", () => ({ getServerDb: () => testDb }));

// Capture what the route sends to DeepSeek and stream a canned answer back.
const seen: { turns: any[] } = { turns: [] };
vi.mock("@/lib/deepseek", () => ({
  deepseekChatStream: async function* (turns: any[]) {
    seen.turns = turns;
    yield "Vì mỗi kết nối ";
    yield "tốn TCP handshake.";
  },
}));

function insertLesson(): number {
  const info = testDb
    .prepare(
      `INSERT INTO knowledge (topic, category, title_en, summary_en, summary_vi, detail_md, diagram, cefr, created_at)
       VALUES ('t','Backend','Tiêu đề bài','Tóm tắt bài','Tóm tắt bài','## Tổng quan\nMở kết nối rất đắt.','','B1','2026-07-26T00:00:00Z')`
    )
    .run();
  return Number(info.lastInsertRowid);
}

async function post(id: number, body: unknown) {
  const { POST } = await import("@/app/api/knowledge/[id]/chat/route");
  return POST(new Request(`http://t/api/knowledge/${id}/chat`, { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: String(id) }),
  });
}

beforeEach(() => {
  testDb.exec("DELETE FROM knowledge;");
  seen.turns = [];
});

describe("POST /api/knowledge/[id]/chat", () => {
  it("streams the answer and passes the lesson as context", async () => {
    const id = insertLesson();
    const res = await post(id, { messages: [{ role: "user", content: "Vì sao mở kết nối đắt?" }] });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("Vì mỗi kết nối tốn TCP handshake.");
    expect(seen.turns[1].content).toContain("Mở kết nối rất đắt.");
    expect(seen.turns.at(-1)).toEqual({ role: "user", content: "Vì sao mở kết nối đắt?" });
  });

  it("404s for an unknown lesson", async () => {
    const res = await post(99999, { messages: [{ role: "user", content: "hỏi" }] });
    expect(res.status).toBe(404);
  });

  it("400s when there is no user question", async () => {
    const id = insertLesson();
    const res = await post(id, { messages: [{ role: "assistant", content: "hi" }] });
    expect(res.status).toBe(400);
  });
});
