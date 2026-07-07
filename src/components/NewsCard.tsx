"use client";
import { useState } from "react";
import type { NewsCard as NewsCardType } from "@/lib/types";
import { TappableText } from "./TappableText";
import { relativeTime, readTimeSeconds } from "@/utils/format";

export function NewsCard({
  card,
  onWord,
}: {
  card: NewsCardType;
  onWord: (word: string) => void;
}) {
  const [showVi, setShowVi] = useState(false);
  const readS = readTimeSeconds(card.summary_en);
  return (
    <article className="card" data-cat={card.category.toLowerCase()}>
      <div className="meta">
        <span className="tag">{card.category}</span>
        <span>· {relativeTime(card.published_at)} · {readS}s read</span>
        <span className="cefr">CEFR {card.cefr}</span>
      </div>
      <h1 className="headline">
        <TappableText text={card.title_en} onWord={onWord} />
      </h1>
      <div className="en-summary">
        <TappableText text={card.summary_en} onWord={onWord} />
      </div>
      <div className={`vi-block${showVi ? " open" : ""}`}>
        <p>{card.summary_vi}</p>
      </div>
      <div className="actions">
        <button
          type="button"
          className={`btn ghost${showVi ? " active" : ""}`}
          onClick={() => setShowVi((v) => !v)}
        >
          🇻🇳 {showVi ? "Ẩn tiếng Việt" : "Tiếng Việt"}
        </button>
        <a className="btn link" href={card.source_url} target="_blank" rel="noreferrer">
          Read on VnExpress →
        </a>
      </div>
    </article>
  );
}
