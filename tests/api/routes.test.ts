import { describe, it, expect, vi, beforeEach } from "vitest";
import { openDb } from "@/lib/db";

// Route handlers use a shared server DB; point it at an in-memory DB for tests.
const testDb = openDb(":memory:");
vi.mock("@/lib/server-db", () => ({ getServerDb: () => testDb }));
// Avoid real network in word route.
vi.mock("@/lib/dictionary", () => ({
  lookupDictionary: async () => ({ ipa: "/x/", audio_url: null, pos: "noun" }),
}));
vi.mock("@/lib/translate", () => ({ translateToVi: async () => "nghĩa" }));

beforeEach(() => {
  testDb.exec("DELETE FROM articles; DELETE FROM words; DELETE FROM my_words; DELETE FROM seen;");
});

describe("GET /api/feed", () => {
  it("returns a feed page", async () => {
    testDb
      .prepare(
        `INSERT INTO articles (guid, source_url, title_en, summary_en, summary_vi, category, cefr, published_at, crawled_at)
         VALUES ('g','u','T','S','V','World','B1','2026-07-07T01:00:00Z','2026-07-07T01:00:00Z')`
      )
      .run();
    const { GET } = await import("@/app/api/feed/route");
    const res = await GET(new Request("http://t/api/feed?limit=5"));
    const body = await res.json();
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0].type).toBe("news");
  });
});

describe("GET /api/word", () => {
  it("400s without w", async () => {
    const { GET } = await import("@/app/api/word/route");
    const res = await GET(new Request("http://t/api/word"));
    expect(res.status).toBe(400);
  });
  it("returns a word entry", async () => {
    const { GET } = await import("@/app/api/word/route");
    const res = await GET(new Request("http://t/api/word?w=galaxy"));
    const body = await res.json();
    expect(body.word).toBe("galaxy");
    expect(body.meaning_vi).toBe("nghĩa");
  });
});

describe("my-words", () => {
  it("saves and lists", async () => {
    const wordRoute = await import("@/app/api/word/route");
    await wordRoute.GET(new Request("http://t/api/word?w=galaxy")); // seed words cache
    const mw = await import("@/app/api/my-words/route");
    const post = await mw.POST(
      new Request("http://t/api/my-words", {
        method: "POST",
        body: JSON.stringify({ word: "galaxy" }),
      })
    );
    expect(post.status).toBe(200);
    const get = await mw.GET();
    const body = await get.json();
    expect(body.words[0].word).toBe("galaxy");
  });
});

describe("POST /api/seen", () => {
  it("marks news as scrolled past so the feed drops it", async () => {
    testDb
      .prepare(
        `INSERT INTO articles (guid, source_url, title_en, summary_en, summary_vi, category, cefr, published_at, crawled_at)
         VALUES ('s1','u','T1','S','V','World','B1','2026-07-26T01:00:00Z','2026-07-26T01:00:00Z'),
                ('s2','u','T2','S','V','World','B1','2026-07-26T02:00:00Z','2026-07-26T02:00:00Z')`
      )
      .run();
    const ids = (
      testDb.prepare("SELECT id FROM articles ORDER BY id").all() as { id: number }[]
    ).map((r) => r.id);

    const { POST } = await import("@/app/api/seen/route");
    const res = await POST(
      new Request("http://t/api/seen", {
        method: "POST",
        body: JSON.stringify({ type: "news", ids: [ids[0]] }),
      })
    );
    expect(await res.json()).toEqual({ ok: true, added: 1 });

    const { GET } = await import("@/app/api/feed/route");
    const feed = await (await GET(new Request("http://t/api/feed"))).json();
    expect(feed.cards.map((c: { title_en: string }) => c.title_en)).toEqual(["T2"]);
  });

  it("400s on an unknown card type", async () => {
    const { POST } = await import("@/app/api/seen/route");
    const res = await POST(
      new Request("http://t/api/seen", { method: "POST", body: JSON.stringify({ type: "x", ids: [1] }) })
    );
    expect(res.status).toBe(400);
  });
});
