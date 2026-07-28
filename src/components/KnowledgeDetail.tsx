"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import type { KnowledgeDetail as Detail } from "@/lib/types";
import { markdownToSpeech, splitSentences } from "@/lib/speech-text";
import { useTtsPlayer } from "@/lib/use-tts-player";
import { TappableText } from "./TappableText";
import { KnowledgeChat } from "./KnowledgeChat";

const NO_SENTENCES: string[] = [];

let diagramSeq = 0;

// Any letter (Vietnamese included) so a tapped word is captured whole; only
// pure-English words are then looked up (see ENGLISH_WORD).
const WORD_CHAR = /[\p{L}'-]/u;
const ENGLISH_WORD = /^[A-Za-z][A-Za-z'-]*$/;

// Find the whole word under a screen point (for a plain tap).
function wordAtPoint(x: number, y: number): string | null {
  let node: Node | null = null;
  let offset = 0;
  const doc = document as any;
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  } else if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) {
      node = p.offsetNode;
      offset = p.offset;
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? "";
  let start = offset;
  let end = offset;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  const w = text.slice(start, end).trim();
  return ENGLISH_WORD.test(w) ? w : null;
}

export function KnowledgeDetail({
  knowledgeId,
  onClose,
  onWord,
}: {
  knowledgeId: number | null;
  onClose: () => void;
  onWord: (word: string) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [html, setHtml] = useState("");
  const [diagramSvg, setDiagramSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const suppressMouse = useRef(false);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  // Read the lesson aloud without going into driving mode. The sentence split
  // matches the pre-generation worker's, so warmed clips are served instantly.
  const sentences = useMemo(
    () =>
      detail
        ? splitSentences(
            `${detail.title_en}. ${detail.summary_en}. ${markdownToSpeech(detail.detail_md)}`
          )
        : NO_SENTENCES,
    [detail]
  );
  const player = useTtsPlayer(sentences);
  const stopPlayer = player.stop;

  useEffect(() => {
    if (knowledgeId == null) return;
    setDetail(null);
    setHtml("");
    setDiagramSvg(null);
    setLoading(true);
    let cancelled = false;
    fetch(`/api/knowledge/${knowledgeId}`)
      .then((r) => r.json())
      .then(async (d: Detail) => {
        if (cancelled) return;
        setDetail(d);
        setHtml(await marked.parse(d.detail_md || ""));
        if (d.diagram && d.diagram.trim()) {
          try {
            const mermaid = (await import("mermaid")).default;
            mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
            const { svg } = await mermaid.render(`kdiag-${diagramSeq++}`, d.diagram);
            if (!cancelled) setDiagramSvg(svg);
          } catch {
            if (!cancelled) setDiagramSvg(null);
          }
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [knowledgeId]);

  // Open the single word (from a word-selection or the point under the cursor).
  function openWordAt(x: number | null, y: number | null) {
    const sel = window.getSelection();
    const s = sel && !sel.isCollapsed ? sel.toString().trim() : "";
    const w = s && !/\s/.test(s) ? s : x != null && y != null ? wordAtPoint(x, y) : null;
    // A single Vietnamese word has nothing to look up — only English terms do.
    if (w && ENGLISH_WORD.test(w)) onWord(w);
  }

  const open = knowledgeId != null;

  // Closing the panel must not leave audio playing behind it.
  useEffect(() => {
    if (!open) stopPlayer();
  }, [open, stopPlayer]);

  const playerOn = player.playing || player.loading || player.index > 0;
  return (
    <div className={`detail${open ? " open" : ""}`} role="dialog" aria-label="Knowledge detail">
      {/* The article column. On desktop the chat sits beside it, not under it. */}
      <div className="detail-main">
        <div className="detail-bar">
          <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
            ← Đóng
          </button>
          {detail && (
            <button
              type="button"
              className={`detail-play${player.playing ? " on" : ""}`}
              onClick={player.toggle}
              aria-label={player.playing ? "Tạm dừng" : "Nghe bài viết"}
            >
              {player.playing ? "⏸ Dừng" : "🔊 Nghe"}
            </button>
          )}
          {detail && <span className="detail-cat">🧠 {detail.category}</span>}
        </div>
        {detail && playerOn && (
          <div className="play-bar">
            <button type="button" onClick={() => player.skip(-1)} aria-label="Câu trước">
              ⏮
            </button>
            <div className="play-mid">
              <div className="play-progress">
                <span style={{ width: `${((player.index + 1) / Math.max(player.total, 1)) * 100}%` }} />
              </div>
              <div className="play-cur">
                {player.loading ? "🎙️ Đang tạo giọng…" : player.sentence}
              </div>
            </div>
            <button type="button" onClick={() => player.skip(1)} aria-label="Câu sau">
              ⏭
            </button>
            <span className="play-count">
              {player.index + 1}/{player.total}
            </span>
          </div>
        )}
        <div className="detail-body">
          {loading && <p className="loading">Đang tải…</p>}
          {detail && (
            <>
              <h1 className="detail-title">
                <TappableText text={detail.title_en} onWord={onWord} />
              </h1>
              <p className="detail-lede">{detail.summary_en}</p>
              {diagramSvg && (
                <div className="diagram" dangerouslySetInnerHTML={{ __html: diagramSvg }} />
              )}
              <p className="tap-hint">Nhấp đúp (double-tap) 1 thuật ngữ tiếng Anh để tra nghĩa</p>
              <div
                className="markdown"
                onTouchEnd={(e) => {
                  // Suppress the synthetic mouse/dblclick events that follow a touch.
                  suppressMouse.current = true;
                  setTimeout(() => (suppressMouse.current = false), 700);
                  const t = e.changedTouches[0];
                  if (!t) return;
                  // Detect a double-tap on the same spot -> open that word.
                  const now = e.timeStamp;
                  const prev = lastTap.current;
                  const near = Math.abs(t.clientX - prev.x) < 30 && Math.abs(t.clientY - prev.y) < 30;
                  if (now - prev.t < 320 && near) {
                    lastTap.current = { t: 0, x: 0, y: 0 };
                    openWordAt(t.clientX, t.clientY);
                  } else {
                    lastTap.current = { t: now, x: t.clientX, y: t.clientY };
                  }
                }}
                onDoubleClick={(e) => {
                  // Desktop: double-click a word -> translate that word.
                  if (suppressMouse.current) return;
                  openWordAt(e.clientX, e.clientY);
                }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </>
          )}
        </div>
      </div>
      <KnowledgeChat knowledgeId={knowledgeId} open={open && detail != null} />
    </div>
  );
}
