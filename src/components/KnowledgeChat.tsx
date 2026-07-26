"use client";
import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import type { ChatMessage } from "@/lib/chat";

const SUGGESTIONS = [
  "Giải thích đơn giản hơn giúp mình",
  "Cho mình một ví dụ thực tế khác",
  "Mình nên bắt đầu từ đâu?",
  "Sai lầm nào dễ mắc nhất?",
];

/**
 * Floating "ask DeepSeek about this lesson" chat, mounted inside the knowledge
 * detail panel. The whole visible conversation is sent each turn; the server
 * attaches the lesson as context and streams the answer back.
 */
export function KnowledgeChat({
  knowledgeId,
  open,
}: {
  knowledgeId: number | null;
  open: boolean;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  // A different lesson (or a closed detail) starts a fresh conversation.
  useEffect(() => {
    abort.current?.abort();
    abort.current = null;
    setPanelOpen(false);
    setMessages([]);
    setInput("");
    setBusy(false);
  }, [knowledgeId, open]);

  useEffect(() => () => abort.current?.abort(), []);

  // Keep the newest text in view while it streams in.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, panelOpen]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || knowledgeId == null) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;

    const appendToAnswer = (chunk: string) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") next[next.length - 1] = { ...last, content: last.content + chunk };
        return next;
      });

    try {
      const res = await fetch(`/api/knowledge/${knowledgeId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        appendToAnswer(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        appendToAnswer("_(Không hỏi được lúc này. Thử lại nhé.)_");
      }
    } finally {
      if (abort.current === ctrl) abort.current = null;
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {!panelOpen && (
        <button
          type="button"
          className="kchat-fab"
          onClick={() => setPanelOpen(true)}
          aria-label="Hỏi thêm về bài này"
        >
          💬 Hỏi thêm
        </button>
      )}

      <div className={`kchat${panelOpen ? " open" : ""}`} role="dialog" aria-label="Hỏi về bài học">
        <div className="kchat-bar">
          <span className="kchat-h">💬 Hỏi về bài này</span>
          {messages.length > 0 && (
            <button
              type="button"
              className="kchat-clear"
              onClick={() => {
                abort.current?.abort();
                setMessages([]);
                setBusy(false);
              }}
            >
              Xoá
            </button>
          )}
          <button
            type="button"
            className="kchat-x"
            onClick={() => {
              abort.current?.abort();
              setPanelOpen(false);
            }}
            aria-label="Đóng chat"
          >
            ✕
          </button>
        </div>

        <div className="kchat-body" ref={scroller}>
          {messages.length === 0 ? (
            <div className="kchat-empty">
              <p>Hỏi bất cứ điều gì về bài học này — DeepSeek trả lời dựa trên chính nội dung bài.</p>
              <div className="kchat-sugs">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="kchat-sug" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="kmsg user">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="kmsg bot">
                  {m.content ? (
                    <div
                      className="kmd"
                      dangerouslySetInnerHTML={{ __html: marked.parse(m.content) as string }}
                    />
                  ) : (
                    <span className="kdots">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </div>
              )
            )
          )}
        </div>

        <form
          className="kchat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            className="kchat-input"
            rows={1}
            placeholder="Hỏi về bài học này…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button
            type="submit"
            className="kchat-send"
            disabled={busy || input.trim() === ""}
            aria-label="Gửi"
          >
            {busy ? "…" : "↑"}
          </button>
        </form>
      </div>
    </>
  );
}
