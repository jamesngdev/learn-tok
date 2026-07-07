import { getServerDb } from "@/lib/server-db";
import { listMyWords } from "@/lib/words";

export const dynamic = "force-dynamic";

export default function MyWordsPage() {
  const words = listMyWords(getServerDb());
  return (
    <main className="phone">
      <div className="appbar">
        <a className="logo" href="/">← Feed</a>
        <div className="stats">My Words</div>
      </div>
      <div className="mywords">
        {words.length === 0 && (
          <p className="empty">Tap words in the feed to collect them here.</p>
        )}
        {words.map((w) => (
          <div key={w.word} className="myword">
            <div className="top">
              <span className="word-h">{w.word}</span>
              {w.ipa && <span className="ipa">{w.ipa}</span>}
            </div>
            <div className="vi">{w.meaning_vi ?? "—"}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
