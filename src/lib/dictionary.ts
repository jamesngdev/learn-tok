export interface DictResult {
  ipa: string | null;
  audio_url: string | null;
  pos: string | null;
}

const EMPTY: DictResult = { ipa: null, audio_url: null, pos: null };

export async function lookupDictionary(
  word: string,
  fetchImpl: typeof fetch = fetch
): Promise<DictResult> {
  try {
    const res = await fetchImpl(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    if (!res.ok) return EMPTY;
    const data: any = await res.json();
    const entry = Array.isArray(data) ? data[0] : null;
    if (!entry) return EMPTY;
    const withAudio = (entry.phonetics ?? []).find((p: any) => p.audio);
    const ipa =
      entry.phonetic ??
      (entry.phonetics ?? []).find((p: any) => p.text)?.text ??
      null;
    return {
      ipa,
      audio_url: withAudio?.audio ?? null,
      pos: entry.meanings?.[0]?.partOfSpeech ?? null,
    };
  } catch {
    return EMPTY;
  }
}
