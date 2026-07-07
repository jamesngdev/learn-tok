import * as cheerio from "cheerio";

export function extractArticleBody(html: string): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];
  const desc = $("p.description").first().text().trim();
  if (desc) parts.push(desc);
  $("article.fck_detail p.Normal").each((_, el) => {
    const t = $(el).text().trim();
    if (t) parts.push(t);
  });
  return parts.join("\n\n");
}

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export async function fetchArticleBody(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const res = await fetchImpl(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`Article fetch failed: ${res.status}`);
  const html = await res.text();
  return extractArticleBody(html);
}
