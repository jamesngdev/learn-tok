"use client";
import { useEffect, useState } from "react";
import type { WordEntry } from "@/lib/types";
import { useMyWords } from "./MyWordsContext";

export function WordSheet({
  word,
  onClose,
  fetchImpl = fetch,
}: {
  word: string | null;
  onClose: () => void;
  fetchImpl?: typeof fetch;
}) {
  const [entry, setEntry] = useState<WordEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const { save } = useMyWords();

  useEffect(() => {
    if (!word) return;
    setEntry(null);
    setSaved(false);
    setLoading(true);
    fetchImpl(`/api/word?w=${encodeURIComponent(word)}`)
      .then((r) => r.json())
      .then((e: WordEntry) => setEntry(e))
      .catch(() => setEntry(null))
      .finally(() => setLoading(false));
  }, [word, fetchImpl]);

  function speak() {
    if (entry?.audio_url) {
      new Audio(entry.audio_url).play().catch(() => {});
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(word ?? "");
      u.lang = "en-US";
      u.rate = 0.85;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* no speech support */
    }
  }

  async function onSave() {
    if (!word || saved) return;
    await save(word);
    setSaved(true);
  }

  return (
    <>
      <div className={`scrim${word ? " open" : ""}`} onClick={onClose} />
      <div className={`sheet${word ? " open" : ""}`} role="dialog" aria-label="Word details">
        <div className="grab" />
        <div className="top">
          <span className="word-h">{word ?? ""}</span>
          {entry?.ipa && <span className="ipa">{entry.ipa}</span>}
          <button type="button" className="say" aria-label="Pronounce" onClick={speak}>
            🔊
          </button>
          {entry?.pos && <span className="pos">{entry.pos}</span>}
        </div>
        <div className="vi">
          {loading ? "Looking up…" : entry?.meaning_vi ?? "No translation found"}
        </div>
        <div className="sheet-actions">
          <button type="button" className={`save${saved ? " done" : ""}`} onClick={onSave}>
            {saved ? "✓ Saved to My Words" : "＋ Add to My Words"}
          </button>
        </div>
      </div>
    </>
  );
}
