import Parser from "rss-parser";

export interface RssItem {
  guid: string;
  link: string;
  title: string;
  isoDate: string;
}

// VnExpress front-page "featured" feed. Note: the older `trang-chu.rss` now
// 302-redirects to the homepage, and the CDN redirects non-browser user-agents,
// so a browser-like UA + an XML Accept header are required.
const FRONT_PAGE_URL = "https://vnexpress.net/rss/tin-noi-bat.rss";

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
};

export async function fetchFrontPage(
  fetchImpl: typeof fetch = fetch
): Promise<RssItem[]> {
  const res = await fetchImpl(FRONT_PAGE_URL, { headers: BROWSER_HEADERS });
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
