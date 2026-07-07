"use client";
import { useState } from "react";
import type { KnowledgeCard as KnowledgeCardType } from "@/lib/types";
import { TappableText } from "./TappableText";

export function KnowledgeCard({
  card,
  onWord,
  onDetail,
  onIgnore,
}: {
  card: KnowledgeCardType;
  onWord: (word: string) => void;
  onDetail: () => void;
  onIgnore: () => void;
}) {
  const [showVi, setShowVi] = useState(false);
  return (
    <article className="card knowledge" data-cat={card.category.toLowerCase()}>
      <div className="meta">
        <span className="kbadge">🧠 {card.category}</span>
        <button
          type="button"
          className="ignore"
          onClick={onIgnore}
          aria-label="Ignore this card"
          title="Ignore — don't show again"
        >
          ✕
        </button>
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
        <button type="button" className="btn primary" onClick={onDetail}>
          Chi tiết & giải pháp →
        </button>
        <button
          type="button"
          className={`btn ghost${showVi ? " active" : ""}`}
          onClick={() => setShowVi((v) => !v)}
        >
          🇻🇳
        </button>
      </div>
    </article>
  );
}
