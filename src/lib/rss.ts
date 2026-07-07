import Parser from "rss-parser";

export interface RssItem {
  guid: string;
  link: string;
  title: string;
  isoDate: string;
}

const FRONT_PAGE_URL = "https://vnexpress.net/rss/trang-chu.rss";

export async function fetchFrontPage(
  fetchImpl: typeof fetch = fetch
): Promise<RssItem[]> {
  const res = await fetchImpl(FRONT_PAGE_URL, {
    headers: { "user-agent": "DailyTok/0.1" },
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();
  const parser = new Parser();
  const feed = await parser.parseString(xml);
  const items: RssItem[] = [];
  for (const it of feed.items) {
    const link = it.link ?? "";
    if (!link) continue;
    items.push({
      guid: it.guid ?? link,
      link,
      title: (it.title ?? "").trim(),
      isoDate: it.isoDate ?? new Date(it.pubDate ?? 0).toISOString(),
    });
  }
  return items;
}
