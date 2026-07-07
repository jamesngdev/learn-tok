"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/types";
import type { FeedPage, FeedMode } from "@/lib/feed";
import { renderCard } from "@/components/cardRegistry";
import { WordSheet } from "@/components/WordSheet";
import { KnowledgeDetail } from "@/components/KnowledgeDetail";
import { SettingsSheet } from "@/components/SettingsSheet";
import { MyWordsProvider, useMyWords } from "@/components/MyWordsContext";

function AppBar({
  mode,
  onMode,
  onRefresh,
  refreshing,
  onSettings,
}: {
  mode: FeedMode;
  onMode: (m: FeedMode) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onSettings: () => void;
}) {
  const { savedTodayCount } = useMyWords();
  return (
    <div className="appbar">
      <div className="segmented" role="tablist" aria-label="Feed mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "news"}
          className={mode === "news" ? "seg on" : "seg"}
          onClick={() => onMode("news")}
        >
          📰 Tin tức
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "knowledge"}
          className={mode === "knowledge" ? "seg on" : "seg"}
          onClick={() => onMode("knowledge")}
        >
          🧠 Kiến thức
        </button>
      </div>
      <div className="stats">
        <a className="chip mini" href="/my-words" title="My Words">
          <span className="n">{savedTodayCount}</span>
        </a>
        <button
          type="button"
          className="iconbtn"
          onClick={onSettings}
          aria-label="Settings — topics of interest"
          title="Chủ đề quan tâm"
        >
          ⚙
        </button>
        <button
          type="button"
          className={`iconbtn${refreshing ? " spinning" : ""}`}
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh"
          title={mode === "news" ? "Lấy tin mới" : "Sinh thẻ kiến thức mới"}
        >
          ↻
        </button>
      </div>
    </div>
  );
}

function FeedInner({ initial }: { initial: FeedPage }) {
  const [mode, setMode] = useState<FeedMode>("news");
  const [cards, setCards] = useState<Card[]>(initial.cards);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [word, setWord] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const topupBusy = useRef(false);
  const modeRef = useRef<FeedMode>(mode);
  modeRef.current = mode;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const switchMode = useCallback(
    async (m: FeedMode) => {
      if (m === modeRef.current) return;
      setMode(m);
      setCards([]);
      setCursor(null);
      setLoading(true);
      try {
        const page: FeedPage = await fetch(`/api/feed?mode=${m}`).then((r) => r.json());
        setCards(page.cards);
        setCursor(page.nextCursor);
        feedRef.current?.scrollTo({ top: 0 });
        if (m === "knowledge" && page.cards.length === 0) {
          flash("Đang tạo thẻ kiến thức đầu tiên…");
        }
      } finally {
        setLoading(false);
      }
    },
    [flash]
  );

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/feed?mode=${modeRef.current}&cursor=${encodeURIComponent(cursor)}`
      );
      const page: FeedPage = await res.json();
      setCards((prev) => [...prev, ...page.cards]);
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading]);

  // In knowledge mode, keep the pool stocked as the user nears the end.
  const maybeTopup = useCallback(async () => {
    if (modeRef.current !== "knowledge" || topupBusy.current) return;
    topupBusy.current = true;
    try {
      await fetch("/api/knowledge/topup", { method: "POST" });
    } catch {
      /* ignore */
    } finally {
      setTimeout(() => (topupBusy.current = false), 15000);
    }
  }, []);

  const reload = useCallback(async (m: FeedMode) => {
    const page: FeedPage = await fetch(`/api/feed?mode=${m}`).then((r) => r.json());
    setCards(page.cards);
    setCursor(page.nextCursor);
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    const m = modeRef.current;
    setRefreshing(true);
    try {
      if (m === "news") {
        const res = await fetch("/api/refresh", { method: "POST" });
        const result = await res.json();
        await reload("news");
        flash(
          res.ok
            ? result.inserted > 0
              ? `${result.inserted} tin mới`
              : "Đã cập nhật mới nhất"
            : "Làm mới thất bại"
        );
      } else {
        const res = await fetch("/api/knowledge/topup", { method: "POST" });
        const result = await res.json();
        await reload("knowledge");
        flash(res.ok ? `+${result.generated ?? 0} thẻ kiến thức` : "Sinh thẻ thất bại");
      }
    } catch {
      flash("Có lỗi — thử lại");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, reload, flash]);

  const ignore = useCallback((type: "news" | "knowledge", id: number) => {
    setCards((prev) => prev.filter((c) => !(c.type === type && c.id === id)));
    fetch("/api/ignore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, id }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
          maybeTopup();
        }
      },
      { threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, maybeTopup]);

  const emptyMsg =
    mode === "knowledge"
      ? "Chưa có thẻ kiến thức. Mở ⚙ để nhập chủ đề, hoặc bấm ↻ để sinh."
      : "Chưa có tin. Chạy crawler (npm run crawl) hoặc bấm ↻.";

  return (
    <>
      <AppBar
        mode={mode}
        onMode={switchMode}
        onRefresh={refresh}
        refreshing={refreshing}
        onSettings={() => setSettingsOpen(true)}
      />
      {toast && <div className="toast">{toast}</div>}
      <div className="feed" ref={feedRef}>
        {cards.length === 0 && !loading && (
          <div className="card">
            <div className="en-summary">{emptyMsg}</div>
          </div>
        )}
        {cards.map((c) => (
          <div key={`${c.type}-${c.id}`} className="card-slot">
            {renderCard(c, { onWord: setWord, onIgnore: ignore, onDetail: setDetailId })}
          </div>
        ))}
        <div ref={sentinel} className="sentinel" />
      </div>
      <WordSheet word={word} onClose={() => setWord(null)} />
      <KnowledgeDetail knowledgeId={detailId} onClose={() => setDetailId(null)} onWord={setWord} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
