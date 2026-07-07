"use client";
import { useEffect, useState } from "react";
import { marked } from "marked";
import type { KnowledgeDetail as Detail } from "@/lib/types";

let diagramSeq = 0;

export function KnowledgeDetail({
  knowledgeId,
  onClose,
}: {
  knowledgeId: number | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [html, setHtml] = useState("");
  const [diagramSvg, setDiagramSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
            <h1 className="detail-title">{detail.title_en}</h1>
            <p className="detail-lede">{detail.summary_vi}</p>
            {diagramSvg && (
              <div className="diagram" dangerouslySetInnerHTML={{ __html: diagramSvg }} />
            )}
            <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
          </>
        )}
      </div>
    </div>
  );
}
