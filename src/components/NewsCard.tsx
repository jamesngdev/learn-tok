"use client";
import type { NewsCard as NewsCardType } from "@/lib/types";
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
        <a className="btn link" href={card.source_url} target="_blank" rel="noreferrer">
          Read on VnExpress →
        </a>
      </div>
    </article>
  );
}
