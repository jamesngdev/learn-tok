"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/types";
import type { FeedPage } from "@/lib/feed";
import { renderCard } from "@/components/cardRegistry";
import { WordSheet } from "@/components/WordSheet";
import { MyWordsProvider, useMyWords } from "@/components/MyWordsContext";

function AppBar({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { savedTodayCount } = useMyWords();
  return (
    <div className="appbar">
      <div className="logo">
        Daily<i>Tok</i>
      </div>
      <div className="stats">
        <a className="chip" href="/my-words">
          <span className="n">{savedTodayCount}</span>&nbsp;words today
        </a>
        <button
          type="button"
          className={`refresh${refreshing ? " spinning" : ""}`}
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh news"
          title="Fetch the latest news now"
        >
          ↻
        </button>
      </div>
    </div>
  );
}

function FeedInner({ initial }: { initial: FeedPage }) {
  const [cards, setCards] = useState<Card[]>(initial.cards);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [word, setWord] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setToast(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const result = await res.json();
      // Reload the newest page regardless, so any new stories appear.
      const page: FeedPage = await fetch("/api/feed").then((r) => r.json());
      setCards(page.cards);
      setCursor(page.nextCursor);
      feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      setToast(
        res.ok
          ? result.inserted > 0
            ? `${result.inserted} new ${result.inserted === 1 ? "story" : "stories"}`
            : "You're all caught up"
          : "Refresh failed — try again"
      );
    } catch {
      setToast("Refresh failed — try again");
    } finally {
      setRefreshing(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, [refreshing]);

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
      <AppBar onRefresh={refresh} refreshing={refreshing} />
      {toast && <div className="toast">{toast}</div>}
      <div className="feed" ref={feedRef}>
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
