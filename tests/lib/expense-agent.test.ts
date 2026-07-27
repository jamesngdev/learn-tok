import { describe, it, expect, vi } from "vitest";
import {
  MAX_TOOL_ROUNDS,
  MAX_TURNS,
  TextGate,
  buildTurns,
  runExpenseAgent,
  type AgentEvent,
} from "@/lib/expense-agent";
import type { ToolStreamEvent } from "@/lib/deepseek";

const CATEGORIES = [
  { name: "Ăn uống", emoji: "🍜" },
  { name: "Khác", emoji: "📦" },
];
const TODAY = "2026-07-27";

/** A canned model: each entry is one turn's worth of stream events. */
function fakeStream(turnsToPlay: ToolStreamEvent[][]) {
  const seen: { messages: unknown[]; tools: unknown[] | undefined }[] = [];
  let turn = 0;
  const stream = async function* (messages: unknown[], tools?: unknown[]) {
    seen.push({ messages: JSON.parse(JSON.stringify(messages)), tools });
    const events = turnsToPlay[Math.min(turn, turnsToPlay.length - 1)] ?? [];
    turn++;
    for (const ev of events) {
      // No tools passed means no tool calls are possible — same as the real API.
      if (ev.type === "tool_calls" && !tools) continue;
      yield ev;
    }
  };
  return { stream: stream as any, seen };
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("TextGate", () => {
  it("passes ordinary text straight through", () => {
    const gate = new TextGate();
    expect(["Đã ghi ", "45.000đ."].map((d) => gate.push(d)).join("") + gate.flush()).toBe(
      "Đã ghi 45.000đ."
    );
  });

  it("cuts the answer off where leaked tool-call markup starts", () => {
    // Seen for real: after the tools were removed the model tried to express a
    // tool call in prose and the raw markup came through as text.
    const gate = new TextGate();
    const deltas = ["Để mình sửa lại nhé.", "<｜｜DSML｜｜tool_calls>", "<invoke ...>"];
    expect(deltas.map((d) => gate.push(d)).join("") + gate.flush()).toBe("Để mình sửa lại nhé.");
  });

  it("holds back a trailing '<' until it knows what follows", () => {
    const gate = new TextGate();
    expect(gate.push("a <")).toBe("a ");
    expect(gate.push("| oops")).toBe("");
    expect(gate.flush()).toBe("");

    const innocent = new TextGate();
    expect(innocent.push("2 <")).toBe("2 ");
    expect(innocent.push(" 3 nghìn")).toBe("< 3 nghìn");
  });
});

describe("buildTurns", () => {
  it("puts the categories and today's date in the system prompt", () => {
    const turns = buildTurns(CATEGORIES, TODAY, [{ role: "user", content: "cơm 45k" }]) as any[];
    expect(turns[0].role).toBe("system");
    expect(turns[0].content).toContain("Ăn uống");
    // Names only — listing them with emoji made the model echo the emoji back.
    expect(turns[0].content).not.toContain("🍜");
    expect(turns[0].content).toContain(TODAY);
    expect(turns[0].content).toContain("Thứ hai");
    expect(turns[1]).toEqual({ role: "user", content: "cơm 45k" });
  });

  it("keeps only the last MAX_TURNS messages and drops blanks", () => {
    const history = Array.from({ length: MAX_TURNS + 4 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `câu ${i}`,
    }));
    const turns = buildTurns(CATEGORIES, TODAY, [...history, { role: "user", content: "  " }]);
    expect(turns).toHaveLength(MAX_TURNS + 1); // + system
  });
});

describe("runExpenseAgent", () => {
  it("runs a tool, feeds the result back, then streams the answer", async () => {
    const { stream, seen } = fakeStream([
      [{ type: "tool_calls", calls: [{ id: "c1", name: "add_expenses", arguments: '{"items":[]}' }] }],
      [
        { type: "text", delta: "Đã ghi " },
        { type: "text", delta: "45.000đ." },
      ],
    ]);
    const runTool = vi.fn(() => ({ added: [{ id: 1, amount: 45000 }], today_total: 45000 }));

    const events = await collect(
      runExpenseAgent({ categories: CATEGORIES, today: TODAY, history: [{ role: "user", content: "cơm 45k" }], runTool, stream })
    );

    expect(runTool).toHaveBeenCalledWith("add_expenses", { items: [] });
    expect(events).toEqual([
      { t: "tool", name: "add_expenses", result: { added: [{ id: 1, amount: 45000 }], today_total: 45000 } },
      { t: "text", d: "Đã ghi " },
      { t: "text", d: "45.000đ." },
    ]);

    // Second call carries the assistant tool_calls message (with `content`,
    // which DeepSeek requires) followed by the tool result.
    const second = seen[1].messages as any[];
    expect(second[second.length - 2]).toMatchObject({ role: "assistant", content: "" });
    expect(second[second.length - 2].tool_calls[0].function.name).toBe("add_expenses");
    expect(second[second.length - 1]).toMatchObject({ role: "tool", tool_call_id: "c1" });
    expect(JSON.parse(second[second.length - 1].content).today_total).toBe(45000);
  });

  it("passes text through untouched when no tool is called", async () => {
    const { stream } = fakeStream([[{ type: "text", delta: "Chào bạn!" }]]);
    const events = await collect(
      runExpenseAgent({
        categories: CATEGORIES,
        today: TODAY,
        history: [{ role: "user", content: "hi" }],
        runTool: vi.fn(),
        stream,
      })
    );
    expect(events).toEqual([{ t: "text", d: "Chào bạn!" }]);
  });

  it("stops the tool loop by dropping the tools on the last round", async () => {
    // A model that would call a tool forever.
    const { stream, seen } = fakeStream([
      [{ type: "tool_calls", calls: [{ id: "c", name: "query_expenses", arguments: "{}" }] }],
    ]);
    const runTool = vi.fn(() => ({ total: 0 }));
    const events = await collect(
      runExpenseAgent({ categories: CATEGORIES, today: TODAY, history: [{ role: "user", content: "?" }], runTool, stream })
    );

    expect(seen).toHaveLength(MAX_TOOL_ROUNDS);
    expect(seen.slice(0, -1).every((s) => s.tools !== undefined)).toBe(true);
    expect(seen[seen.length - 1].tools).toBeUndefined();
    expect(runTool).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS - 1);
    // No text ever came back, so the user still gets something readable.
    expect(events[events.length - 1]).toEqual({ t: "text", d: "Đã cập nhật sổ chi tiêu." });
  });

  it("hands malformed tool arguments back to the model as an error", async () => {
    const { stream } = fakeStream([
      [{ type: "tool_calls", calls: [{ id: "c1", name: "add_expenses", arguments: "{items: oops" }] }],
      [{ type: "text", delta: "Xin lỗi, mình ghi lại nhé." }],
    ]);
    const runTool = vi.fn();
    const events = await collect(
      runExpenseAgent({ categories: CATEGORIES, today: TODAY, history: [{ role: "user", content: "x" }], runTool, stream })
    );

    expect(runTool).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ t: "tool", result: { error: expect.stringContaining("JSON") } });
  });

  it("separates text from two rounds instead of gluing the sentences together", async () => {
    const { stream } = fakeStream([
      [
        { type: "text", delta: "Tìm thấy rồi. Xoá ngay!" },
        { type: "tool_calls", calls: [{ id: "c1", name: "delete_expense", arguments: '{"id":2}' }] },
      ],
      [{ type: "text", delta: "Đã xoá." }],
    ]);
    const events = await collect(
      runExpenseAgent({
        categories: CATEGORIES,
        today: TODAY,
        history: [{ role: "user", content: "xoá gửi xe" }],
        runTool: vi.fn(() => ({ deleted: { id: 2 } })),
        stream,
      })
    );
    const said = events.filter((e) => e.t === "text").map((e: any) => e.d).join("");
    expect(said).toBe("Tìm thấy rồi. Xoá ngay!\n\nĐã xoá.");
  });

  it("keeps leaked tool markup out of both the stream and the next round's context", async () => {
    const { stream, seen } = fakeStream([
      [
        { type: "text", delta: "Để mình sửa lại." },
        { type: "text", delta: "<｜｜DSML｜｜tool_calls>bịa" },
        { type: "tool_calls", calls: [{ id: "c1", name: "query_expenses", arguments: "{}" }] },
      ],
      [{ type: "text", delta: "Xong rồi." }],
    ]);
    const events = await collect(
      runExpenseAgent({
        categories: CATEGORIES,
        today: TODAY,
        history: [{ role: "user", content: "x" }],
        runTool: vi.fn(() => ({ total: 0 })),
        stream,
      })
    );

    const said = events.filter((e) => e.t === "text").map((e: any) => e.d).join("");
    expect(said).not.toContain("DSML");
    expect(said).toContain("Để mình sửa lại.");

    const assistant = (seen[1].messages as any[]).find((m) => m.role === "assistant");
    expect(assistant.content).toBe("Để mình sửa lại.");
  });

  it("surfaces a DeepSeek failure as an error event", async () => {
    const stream = async function* () {
      throw new Error("502 bad gateway");
    };
    const events = await collect(
      runExpenseAgent({
        categories: CATEGORIES,
        today: TODAY,
        history: [{ role: "user", content: "cơm 45k" }],
        runTool: vi.fn(),
        stream: stream as any,
      })
    );
    expect(events).toEqual([{ t: "error", m: "Không gọi được DeepSeek. Thử lại nhé." }]);
  });
});
