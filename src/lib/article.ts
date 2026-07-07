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

export async function fetchArticleBody(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const res = await fetchImpl(url, { headers: { "user-agent": "DailyTok/0.1" } });
  if (!res.ok) throw new Error(`Article fetch failed: ${res.status}`);
  const html = await res.text();
  return extractArticleBody(html);
}
