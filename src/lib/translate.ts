export async function translateToVi(
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
