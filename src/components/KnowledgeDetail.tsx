"use client";
import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import type { KnowledgeDetail as Detail } from "@/lib/types";
import { TappableText } from "./TappableText";
import { tokenize } from "@/utils/tokenize";

let diagramSeq = 0;

// Skip wrapping inside these so we don't break links/code or make code tappable.
const SKIP_TAGS = new Set(["CODE", "PRE", "A", "BUTTON"]);

/** Wrap every word in the rendered markdown in a tappable span. */
function enhanceWords(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !/[a-zA-Z]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      let p = node.parentElement;
      while (p && p !== root) {
        if (SKIP_TAGS.has(p.tagName) || (p as HTMLElement).dataset?.w) {
          return NodeFilter.FILTER_REJECT;
        }
        p = p.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const tn of textNodes) {
    const frag = document.createDocumentFragment();
    for (const t of tokenize(tn.nodeValue ?? "")) {
      if (t.word) {
        // A <button> (like the feed) taps cleanly on touch; a <span> would
        // trigger text selection / the magnifier instead of a click.
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "word";
        btn.dataset.w = t.word;
        btn.textContent = t.text;
        frag.appendChild(btn);
      } else {
        frag.appendChild(document.createTextNode(t.text));
      }
    }
    tn.parentNode?.replaceChild(frag, tn);
  }
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
  const mdRef = useRef<HTMLDivElement | null>(null);

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

  // After the markdown HTML is injected, make its words tappable.
  useEffect(() => {
    if (html && mdRef.current) enhanceWords(mdRef.current);
  }, [html]);

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
            <div
              className="markdown"
              ref={mdRef}
              onClick={(e) => {
                const el = (e.target as HTMLElement).closest<HTMLElement>(".word");
                if (el?.dataset.w) onWord(el.dataset.w);
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </>
        )}
      </div>
    </div>
  );
}
