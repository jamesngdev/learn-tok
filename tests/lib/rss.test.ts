import { describe, it, expect } from "vitest";
import { fetchFrontPage } from "@/lib/rss";
import { FRONTPAGE_RSS } from "../fixtures/frontpage.rss";

function fakeFetch(): typeof fetch {
  return (async () =>
    new Response(FRONTPAGE_RSS, {
      headers: { "content-type": "application/rss+xml" },
    })) as unknown as typeof fetch;
}

describe("fetchFrontPage", () => {
  it("parses items into RssItem[]", async () => {
    const items = await fetchFrontPage(fakeFetch());
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Tin tức số một");
    expect(items[0].guid).toBe("https://vnexpress.net/tin-so-1-4700001.html");
    expect(items[0].isoDate).toMatch(/^2026-07-06T20:00:00/); // +07 -> UTC
  });
});
