"use client";
import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import type { ChatMessage } from "@/lib/expense-agent";
import type { ExpenseCategory } from "@/lib/expenses";
import { formatVnd } from "@/utils/format";

const SUGGESTIONS = [
  "trưa cơm 45k, gửi xe 5k",
  "tháng này tiêu bao nhiêu rồi?",
  "ăn uống tuần này thế nào?",
  "khoản nào lớn nhất tháng này?",
];

/** What one bubble in the transcript can be. */
type Item =
  | { kind: "user" | "bot"; content: string }
  | { kind: "tool"; name: string; result: any };

/** Tool calls that changed the ledger, so the parent should refetch. */
const MUTATING = new Set(["add_expenses", "update_expense", "delete_expense", "add_category"]);

/**
 * Bottom half of /chi-tieu. One input does both jobs: describe what you spent
 * and it gets written to the ledger; ask a question and DeepSeek answers from
 * numbers the server computed in SQL.
 */
export function ExpenseChat({
  categories,
  onLedgerChanged,
}: {
  categories: ExpenseCategory[];
  onLedgerChanged: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // Keep the newest text in view while it streams in.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    // Only the plain conversation goes to the model; tool cards are UI-only.
    const history: ChatMessage[] = [
      ...items
        .filter((i): i is { kind: "user" | "bot"; content: string } => i.kind !== "tool")
        .map((i) => ({ role: i.kind === "user" ? ("user" as const) : ("assistant" as const), content: i.content })),
      { role: "user", content: message },
    ];

    setItems((prev) => [...prev, { kind: "user", content: message }, { kind: "bot", content: "" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;

    const appendText = (chunk: string) =>
      setItems((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.kind === "bot") next[next.length - 1] = { ...last, content: last.content + chunk };
        else next.push({ kind: "bot", content: chunk });
        return next;
      });

    // A tool card is inserted before the answer bubble that is still filling in.
    const insertTool = (name: string, result: any) =>
      setItems((prev) => {
        const next = [...prev];
        const trailing = next[next.length - 1];
        if (trailing?.kind === "bot" && trailing.content === "") {
          next.splice(next.length - 1, 0, { kind: "tool", name, result });
        } else {
          next.push({ kind: "tool", name, result }, { kind: "bot", content: "" });
        }
        return next;
      });

    const handle = (event: any) => {
      if (event?.t === "text") appendText(event.d);
      else if (event?.t === "error") appendText(`_${event.m}_`);
      else if (event?.t === "tool") {
        insertTool(event.name, event.result);
        if (MUTATING.has(event.name)) onLedgerChanged();
      }
    };

    try {
      const res = await fetch("/api/expenses/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // NDJSON: everything up to the last newline is complete.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            handle(JSON.parse(line));
          } catch {
            // A malformed line is not worth breaking the stream over.
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        appendText("_(Không gửi được lúc này. Thử lại nhé.)_");
      }
    } finally {
      if (abort.current === ctrl) abort.current = null;
      setBusy(false);
    }
  }

  const emoji = (name: string) => categories.find((c) => c.name === name)?.emoji || "📦";

  return (
    <section className="xp-chat" aria-label="Chat chi tiêu">
      <div className="xp-chat-body" ref={scroller}>
        {items.length === 0 ? (
          <div className="xp-chat-empty">
            <p>Kể ra là mình ghi, hoặc hỏi bất cứ gì về chi tiêu của bạn.</p>
            <div className="kchat-sugs">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="kchat-sug" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          items.map((item, i) =>
            item.kind === "user" ? (
              <div key={i} className="kmsg user">
                {item.content}
              </div>
            ) : item.kind === "tool" ? (
              <ToolCard key={i} name={item.name} result={item.result} emoji={emoji} />
            ) : (
              <div key={i} className="kmsg bot">
                {item.content ? (
                  <div
                    className="kmd"
                    dangerouslySetInnerHTML={{ __html: marked.parse(item.content) as string }}
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
          placeholder="Ghi chi tiêu hoặc hỏi…"
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
    </section>
  );
}

/** What a tool call did, shown inline so you can see the ledger move. */
function ToolCard({
  name,
  result,
  emoji,
}: {
  name: string;
  result: any;
  emoji: (category: string) => string;
}) {
  if (result?.error) return <div className="xcard bad">⚠ {result.error}</div>;

  if (name === "add_expenses") {
    const added: any[] = result?.added ?? [];
    return (
      <div className="xcard">
        {added.map((e) => (
          <div key={e.id} className="xcard-row">
            <span>
              {emoji(e.category)} {e.note || e.category}
              <small>
                {e.category}
                {e.category_fallback ? " · chưa rõ danh mục" : ""}
                {e.low_amount ? " · số tiền nhỏ, kiểm tra lại?" : ""}
              </small>
            </span>
            <b>{formatVnd(e.amount)}</b>
          </div>
        ))}
        {result?.rejected?.length ? (
          <div className="xcard-note">Có {result.rejected.length} khoản không ghi được.</div>
        ) : null}
      </div>
    );
  }

  if (name === "update_expense" && result?.updated) {
    const e = result.updated;
    return (
      <div className="xcard">
        <div className="xcard-row">
          <span>
            ✏️ {e.note || e.category}
            <small>đã sửa · {e.category}</small>
          </span>
          <b>{formatVnd(e.amount)}</b>
        </div>
      </div>
    );
  }

  if (name === "delete_expense" && result?.deleted) {
    const e = result.deleted;
    return (
      <div className="xcard">
        <div className="xcard-row">
          <span>
            🗑 {e.note || e.category}
            <small>đã xoá</small>
          </span>
          <b>{formatVnd(e.amount)}</b>
        </div>
      </div>
    );
  }

  if (name === "add_category") return <div className="xcard mini">🏷 đã cập nhật danh mục</div>;
  if (name === "query_expenses") return <div className="xcard mini">🔍 đã tra sổ · {result?.period}</div>;
  return null;
}
