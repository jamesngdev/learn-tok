import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/server-db", () => ({ getServerDb: () => ({}) }));
const crawlNow = vi.fn();
vi.mock("@/lib/crawl-live", () => ({ crawlNow: () => crawlNow() }));

describe("POST /api/refresh", () => {
  it("returns the crawl result", async () => {
    crawlNow.mockResolvedValueOnce({ inserted: 2, skipped: 24, failed: 0 });
    const { POST } = await import("@/app/api/refresh/route");
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(2);
  });

  it("returns 502 when the crawl throws", async () => {
    crawlNow.mockRejectedValueOnce(new Error("network down"));
    const { POST } = await import("@/app/api/refresh/route");
    const res = await POST();
    expect(res.status).toBe(502);
  });
});
