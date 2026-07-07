"use client";
import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import type { KnowledgeDetail as Detail } from "@/lib/types";
import { TappableText } from "./TappableText";

let diagramSeq = 0;

const WORD_CHAR = /[A-Za-z'-]/;

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
  return /[A-Za-z]/.test(w) ? w : null;
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

  // Translate the current multi-word selection, if any. Returns true if handled.
  function openSelectionPhrase(): boolean {
    const sel = window.getSelection();
    const s = sel && !sel.isCollapsed ? sel.toString().trim() : "";
    if (s && /\s/.test(s)) {
      onWord(s.length > 200 ? s.slice(0, 200) : s);
      return true;
    }
    return false;
  }

  // Open the single word (from a word-selection or the point under the cursor).
  function openWordAt(x: number | null, y: number | null) {
    const sel = window.getSelection();
    const s = sel && !sel.isCollapsed ? sel.toString().trim() : "";
    const w = s && !/\s/.test(s) ? s : x != null && y != null ? wordAtPoint(x, y) : null;
    if (w) onWord(w);
  }

  const open = knowledgeId != null;
  return (
    <div className={`detail${open ? " open" : ""}`} role="dialog" aria-label="Knowledge detail">
      <div className="detail-bar">
        <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
          ← Đóng
        </button>
        {detail && <span className="detail-cat">🧠 {detail.category}</span>}
      </div>
      <div className="detail-body">
        {loading && <p className="loading">Đang tải…</p>}
        {detail && (
          <>
            <h1 className="detail-title">
              <TappableText text={detail.title_en} onWord={onWord} />
            </h1>
            <p className="detail-lede">{detail.summary_vi}</p>
            {diagramSvg && (
              <div className="diagram" dangerouslySetInnerHTML={{ __html: diagramSvg }} />
            )}
            <p className="tap-hint">
              Chạm (mobile) / nhấp đúp (desktop) 1 từ để tra · bôi đen 1 cụm để dịch cả cụm
            </p>
            <div
              className="markdown"
              onTouchEnd={(e) => {
                // Mobile: single tap -> word; selection -> phrase.
                suppressMouse.current = true;
                setTimeout(() => (suppressMouse.current = false), 600);
                if (openSelectionPhrase()) return;
                const t = e.changedTouches[0];
                if (t) openWordAt(t.clientX, t.clientY);
              }}
              onMouseUp={() => {
                // Desktop: a deliberate multi-word drag-select -> phrase.
                if (suppressMouse.current) return;
                openSelectionPhrase();
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
  );
}
