import { translateToViDeepSeek } from "./deepseek";

/** MyMemory free translation — used as a fallback when DeepSeek is unavailable. */
export async function translateMyMemory(
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text
    )}&langpair=en|vi`;
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    const t = data?.responseData?.translatedText;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Translate English text to Vietnamese. Prefers DeepSeek (natural, context-aware)
 * and falls back to MyMemory if DeepSeek is unavailable.
 */
export async function translateToVi(
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const ds = await translateToViDeepSeek(text);
  if (ds) return ds;
  return translateMyMemory(text, fetchImpl);
}
