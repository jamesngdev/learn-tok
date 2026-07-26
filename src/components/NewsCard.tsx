"use client";
import { useMemo } from "react";
import type { NewsCard as NewsCardType } from "@/lib/types";
import { splitSentences } from "@/lib/speech-text";
import { useTtsPlayer } from "@/lib/use-tts-player";
import { TappableText } from "./TappableText";
import { relativeTime, readTimeSeconds } from "@/utils/format";

export function NewsCard({
  card,
  onWord,
  onIgnore,
}: {
  card: NewsCardType;
  onWord: (word: string) => void;
  onIgnore: () => void;
}) {
  const readS = readTimeSeconds(card.summary_en);
  // Same split as the pre-generation worker so the clips are already cached.
  const sentences = useMemo(
    () => splitSentences(`${card.title_en}. ${card.summary_en}`),
    [card.title_en, card.summary_en]
  );
  const player = useTtsPlayer(sentences);
  return (
    <article className="card" data-cat={card.category.toLowerCase()}>
      <div className="meta">
        <span className="tag">{card.category}</span>
        <span>· {relativeTime(card.published_at)} · {readS}s read</span>
        <button
          type="button"
          className="ignore"
          onClick={onIgnore}
          aria-label="Ignore this story"
          title="Ignore — don't show again"
        >
          ✕
        </button>
      </div>
      <h1 className="headline">
        <TappableText text={card.title_en} onWord={onWord} />
      </h1>
      <div className="en-summary">
        <TappableText text={card.summary_en} onWord={onWord} />
      </div>
      <div className="actions">
        <button
          type="button"
          className={`btn ghost${player.playing ? " active" : ""}`}
          onClick={player.toggle}
          aria-label={player.playing ? "Tạm dừng" : "Nghe tin này"}
        >
          {player.loading ? "🎙️ Đang tạo…" : player.playing ? "⏸ Dừng" : "🔊 Nghe"}
        </button>
        <a className="btn link" href={card.source_url} target="_blank" rel="noreferrer">
          Read on VnExpress →
        </a>
      </div>
    </article>
  );
}
