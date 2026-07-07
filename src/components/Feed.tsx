"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/types";
import type { FeedPage } from "@/lib/feed";
import { renderCard } from "@/components/cardRegistry";
import { WordSheet } from "@/components/WordSheet";
import { MyWordsProvider, useMyWords } from "@/components/MyWordsContext";

function AppBar() {
  const { savedTodayCount } = useMyWords();
  return (
    <div className="appbar">
      <div className="logo">
        Daily<i>Tok</i>
      </div>
      <div className="stats">
        <span className="chip">🔥 5</span>
        <a className="chip" href="/my-words">
          <span className="n">{savedTodayCount}</span>&nbsp;words today
        </a>
      </div>
    </div>
  );
}

function FeedInner({ initial }: { initial: FeedPage }) {
  const [cards, setCards] = useState<Card[]>(initial.cards);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [word, setWord] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?cursor=${encodeURIComponent(cursor)}`);
      const page: FeedPage = await res.json();
      setCards((prev) => [...prev, ...page.cards]);
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(),
      { threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <>
      <AppBar />
      <div className="feed">
        {cards.length === 0 && (
          <div className="card">
            <div className="en-summary">
              No stories yet. Run the crawler (<code>npm run crawl</code>) to fill your feed.
            </div>
          </div>
        )}
        {cards.map((c) => (
          <div key={`${c.type}-${c.id}`} className="card-slot">
            {renderCard(c, setWord)}
          </div>
        ))}
        <div ref={sentinel} className="sentinel" />
      </div>
      <WordSheet word={word} onClose={() => setWord(null)} />
    </>
  );
}

export function Feed({ initial }: { initial: FeedPage }) {
  return (
    <MyWordsProvider>
      <FeedInner initial={initial} />
    </MyWordsProvider>
  );
}
