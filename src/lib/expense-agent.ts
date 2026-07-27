import { deepseekToolStream, type ToolStreamFn } from "./deepseek";
import { weekdayVN } from "./expense-date";
import { EXPENSE_TOOLS, type ToolRunner } from "./expense-tools";
import type { ExpenseCategory } from "./expenses";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Keep each request bounded: last N turns, each clipped. */
export const MAX_TURNS = 12;
export const MAX_MESSAGE_CHARS = 2000;
/**
 * Model calls per user message. The last one goes out without `tools`, so the
 * model has to answer in words — DeepSeek ignores `tool_choice`, so removing
 * the tools is the only way to end a tool loop. Five leaves room for a
 * multi-step fix-up (query → update → confirm) without running away.
 */
export const MAX_TOOL_ROUNDS = 5;

/** One line of the NDJSON stream the browser reads. */
export type AgentEvent =
  | { t: "text"; d: string }
  | { t: "tool"; name: string; result: unknown }
  | { t: "error"; m: string };

export function buildSystemPrompt(categories: ExpenseCategory[], today: string): string {
  // Names only, one per line. Listing them with their emoji made the model echo
  // the emoji back as part of the category name.
  const list = categories.map((c) => `- ${c.name}`).join("\n");
  return `Bạn là trợ lý chi tiêu của app DailyTok, nói chuyện với đúng một người dùng (chủ sổ).
Hôm nay là ${weekdayVN(today)}, ngày ${today} (giờ Việt Nam).

Danh mục hiện có. Chỉ được dùng ĐÚNG một tên trong danh sách này, sao y nguyên,
KHÔNG kèm emoji, KHÔNG tự đặt tên khác:
${list}

Nguyên tắc:
- Người dùng kể ra khoản đã chi ("trưa cơm 45k, gửi xe 5k") → gọi ngay add_expenses, KHÔNG hỏi lại
  để xác nhận. Một câu có thể chứa nhiều khoản: tách thành nhiều item.
- Quy đổi tiền về VND số nguyên: "45k"/"45 nghìn" = 45000, "1tr2"/"1.2 triệu" = 1200000,
  "2 củ" = 2000000. Nếu câu không nêu số tiền thì hãy hỏi lại, đừng đoán.
- Cần BẤT KỲ con số nào (tổng, so sánh, khoản lớn nhất) → phải gọi query_expenses.
  TUYỆT ĐỐI không tự cộng trừ và không tự tính khoảng ngày: dùng tham số period.
- Sau khi ghi xong, xác nhận thật ngắn (một câu) — giao diện đã hiện thẻ chi tiết rồi,
  không cần liệt kê lại từng khoản.
- Trả lời bằng tiếng Việt tự nhiên, ngắn gọn, đi thẳng vào việc. Số tiền viết dạng
  45.000đ hoặc 4,5tr cho dễ đọc. Dùng Markdown khi cần liệt kê.
- Người dùng nói chuyện ngoài chi tiêu thì cứ trả lời bình thường, không gọi tool.`;
}

/** Clip long text on a whitespace boundary when possible. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastBreak = cut.lastIndexOf("\n");
  return (lastBreak > max * 0.6 ? cut.slice(0, lastBreak) : cut) + "\n…(đã lược bớt)";
}

/** System prompt + the recent conversation, trimmed to a bounded size. */
export function buildTurns(
  categories: ExpenseCategory[],
  today: string,
  history: ChatMessage[]
): unknown[] {
  const turns = history
    .filter((m) => typeof m.content === "string" && m.content.trim() !== "")
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: clip(m.content.trim(), MAX_MESSAGE_CHARS) }));
  return [{ role: "system", content: buildSystemPrompt(categories, today) }, ...turns];
}

/**
 * DeepSeek sometimes writes a tool call out as *text* instead of making one —
 * typically on the final round, when the tools have been taken away and it
 * still wants one. That comes through as raw control markup
 * (`<｜｜DSML｜｜tool_calls>…`) and must never reach the screen.
 *
 * Streaming makes this a buffering problem: the marker arrives a character at a
 * time, so a trailing `<` has to be held back until the next delta decides
 * whether it starts a marker or is just a less-than sign.
 */
const LEAK_MARKERS = ["<｜", "<|"];

export class TextGate {
  private held = "";
  private closed = false;

  /** Feed one delta in, get back the text that is safe to show. */
  push(delta: string): string {
    if (this.closed) return "";
    this.held += delta;

    const hit = LEAK_MARKERS.map((m) => this.held.indexOf(m))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];
    if (hit !== undefined) {
      const out = this.held.slice(0, hit);
      this.held = "";
      this.closed = true;
      return out;
    }

    // Every marker is two characters, so only a trailing "<" is ambiguous.
    const keep = this.held.endsWith("<") ? 1 : 0;
    const out = this.held.slice(0, this.held.length - keep);
    this.held = this.held.slice(this.held.length - keep);
    return out;
  }

  /** Whatever is still held back at the end of the turn. */
  flush(): string {
    if (this.closed) return "";
    const out = this.held;
    this.held = "";
    return out;
  }
}

function parseArgs(raw: string): Record<string, unknown> | { __parseError: string } {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { __parseError: "arguments phải là một JSON object" };
  } catch {
    return { __parseError: "arguments không phải JSON hợp lệ" };
  }
}

/**
 * Run one user message to completion: stream the model, execute whatever tools
 * it asks for, feed the results back, repeat until it answers in words.
 *
 * `stream` and `runTool` are injected so the loop can be tested without a
 * network call or a real DB.
 */
export async function* runExpenseAgent({
  categories,
  today,
  history,
  runTool,
  stream = deepseekToolStream,
  tools = EXPENSE_TOOLS,
}: {
  categories: ExpenseCategory[];
  today: string;
  history: ChatMessage[];
  runTool: ToolRunner;
  stream?: ToolStreamFn;
  tools?: unknown[];
}): AsyncGenerator<AgentEvent> {
  const turns = buildTurns(categories, today, history);
  let sawText = false;
  let sawTool = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS - 1;
    let answer = "";
    let calls: { id: string; name: string; arguments: string }[] = [];
    const gate = new TextGate();

    try {
      for await (const ev of stream(turns, lastRound ? undefined : tools)) {
        if (ev.type === "text") {
          const safe = gate.push(ev.delta);
          if (safe) {
            // Only the gated text is kept: leaked markup must not be fed back
            // into the next round's context either.
            answer += safe;
            // A round that talks, runs a tool, then talks again would otherwise
            // read as one glued sentence ("Xoá ngay!Đã xoá khoản…").
            const out = sawText && answer === safe ? `\n\n${safe}` : safe;
            sawText = true;
            yield { t: "text", d: out };
          }
        } else {
          calls = ev.calls;
        }
      }
      const tail = gate.flush();
      if (tail) {
        answer += tail;
        sawText = true;
        yield { t: "text", d: tail };
      }
    } catch (err) {
      console.error("expense agent stream failed:", err);
      yield { t: "error", m: "Không gọi được DeepSeek. Thử lại nhé." };
      return;
    }

    if (calls.length === 0) break;

    // DeepSeek requires `content` on an assistant message carrying tool_calls.
    turns.push({
      role: "assistant",
      content: answer,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.arguments },
      })),
    });

    for (const call of calls) {
      const args = parseArgs(call.arguments);
      const result =
        "__parseError" in args
          ? { error: args.__parseError as string }
          : runTool(call.name, args);
      sawTool = true;
      yield { t: "tool", name: call.name, result };
      turns.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  // The model can run out of rounds, or answer with tool calls and nothing else.
  if (!sawText) {
    yield {
      t: "text",
      d: sawTool ? "Đã cập nhật sổ chi tiêu." : "Mình chưa hiểu ý bạn, nói lại giúp mình nhé.",
    };
  }
}
