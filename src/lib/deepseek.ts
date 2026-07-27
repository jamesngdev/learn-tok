import OpenAI from "openai";
import type { Cefr, Summary } from "./types";

export interface CompleteOpts {
  /** Output cap — raise it for long generations (a full lesson needs ~4-6k). */
  maxTokens?: number;
  /**
   * Ask for a JSON object (default). Long Markdown answers should use `false`:
   * in JSON mode the model regularly forgets to escape quotes inside a
   * multi-thousand-word string, and the whole response is then unparseable.
   */
  json?: boolean;
}

export type CompleteFn = (
  systemPrompt: string,
  userPrompt: string,
  opts?: CompleteOpts
) => Promise<string>;

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

const MODEL = () => process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

function client(): OpenAI {
  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
}

// Cards are Vietnamese now, so CEFR (an English reading level) no longer means
// anything. The column stays for schema compatibility with a fixed value.
const DEFAULT_CEFR: Cefr = "B1";

const SYSTEM_PROMPT = `Bạn là biên tập viên của một app đọc tin dạng thẻ (mỗi thẻ vừa một màn hình điện thoại).
Cho một bài báo tiếng Việt, trả về DUY NHẤT một JSON object với các key:
"title" (tiêu đề ngắn, gãy gọn, TIẾNG VIỆT),
"summary" (tóm tắt 2-3 câu bằng TIẾNG VIỆT — cụ thể, đủ ý, vừa một thẻ điện thoại),
"category" (một trong: World, Business, Science, Life, Sports, Tech, Vietnam).
Viết bằng tiếng Việt tự nhiên. Giữ nguyên tiếng Anh các thuật ngữ kỹ thuật, tên riêng,
tên sản phẩm và từ viết tắt quen dùng (API, CPU, AI...) thay vì dịch máy móc.`;

export const deepseekComplete: CompleteFn = async (system, user, opts) => {
  const r = await client().chat.completions.create({
    // `deepseek-chat` was retired; the API now serves deepseek-v4-{pro,flash}.
    model: MODEL(),
    response_format: opts?.json === false ? undefined : { type: "json_object" },
    max_tokens: opts?.maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return r.choices[0]?.message?.content ?? "";
};

/**
 * Stream a plain-text (non-JSON) chat completion, yielding content deltas.
 * Used by the "ask about this lesson" chat so answers appear as they are typed.
 */
export async function* deepseekChatStream(
  messages: ChatTurn[],
  opts: CompleteOpts = {}
): AsyncGenerator<string> {
  const stream = await client().chat.completions.create({
    model: MODEL(),
    stream: true,
    max_tokens: opts.maxTokens ?? 1600,
    messages,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON string as produced by the model — parse defensively. */
  arguments: string;
}

export type ToolStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_calls"; calls: ToolCall[] };

/** Injectable shape of `deepseekToolStream`, so agent loops can be tested offline. */
export type ToolStreamFn = (
  messages: unknown[],
  tools?: unknown[],
  opts?: CompleteOpts
) => AsyncGenerator<ToolStreamEvent>;

/**
 * Stream a tool-enabled chat completion. Text deltas are yielded as they
 * arrive; tool calls are yielded once, at the end of the turn.
 *
 * A streamed tool call arrives spread over many chunks — the name in the first
 * one, `arguments` a few characters at a time after that — keyed by `index`,
 * so they have to be reassembled before they can be run. Pass `tools`
 * undefined to force a plain text answer (DeepSeek does not honour
 * `tool_choice`, so dropping the tools is how you stop a tool loop).
 */
export async function* deepseekToolStream(
  messages: unknown[],
  tools?: unknown[],
  opts: CompleteOpts = {}
): AsyncGenerator<ToolStreamEvent> {
  const stream = await client().chat.completions.create({
    model: MODEL(),
    stream: true,
    max_tokens: opts.maxTokens ?? 1600,
    messages: messages as any,
    ...(tools && tools.length ? { tools: tools as any } : {}),
  });

  const partial = new Map<number, { id: string; name: string; args: string }>();
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta as
      | { content?: string | null; tool_calls?: any[] }
      | undefined;
    if (delta?.content) yield { type: "text", delta: delta.content };
    for (const tc of delta?.tool_calls ?? []) {
      const slot = partial.get(tc.index) ?? { id: "", name: "", args: "" };
      if (tc.id) slot.id = tc.id;
      if (tc.function?.name) slot.name += tc.function.name;
      if (tc.function?.arguments) slot.args += tc.function.arguments;
      partial.set(tc.index, slot);
    }
  }

  const calls = [...partial.entries()]
    .sort(([a], [b]) => a - b)
    .map(([i, s]) => ({ id: s.id || `call_${i}`, name: s.name, arguments: s.args }))
    .filter((c) => c.name);
  if (calls.length) yield { type: "tool_calls", calls };
}

const TRANSLATE_SYSTEM = `You are a professional English-to-Vietnamese translator for a learning app.
Translate the user's text into natural, fluent Vietnamese (faithful and idiomatic).
Keep widely-used technical terms, product names, acronyms, and jargon in English
(e.g. "connection pooling", "cache", "API", "index") instead of translating them literally.
If the input is a single word or short phrase, give its concise Vietnamese meaning.
Respond with ONLY a JSON object: {"vi": "<the Vietnamese translation>"}.`;

/** High-quality EN→VI translation via DeepSeek. Returns null on any failure. */
export async function translateToViDeepSeek(
  text: string,
  complete: CompleteFn = deepseekComplete
): Promise<string | null> {
  try {
    const raw = await complete(TRANSLATE_SYSTEM, text);
    const obj = JSON.parse(raw);
    const vi = typeof obj.vi === "string" ? obj.vi.trim() : "";
    return vi || null;
  } catch {
    return null;
  }
}

export async function summarize(
  input: { title: string; body: string },
  complete: CompleteFn = deepseekComplete
): Promise<Summary> {
  const raw = await complete(
    SYSTEM_PROMPT,
    `Tiêu đề: ${input.title}\n\nNội dung:\n${input.body}`
  );
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("DeepSeek returned non-JSON output");
  }
  for (const key of ["title", "summary", "category"] as const) {
    if (typeof obj[key] !== "string" || obj[key].trim() === "") {
      throw new Error(`DeepSeek response missing field: ${key}`);
    }
  }
  const summary = obj.summary.trim();
  // The `*_en` / `summary_vi` names are legacy column names — everything the
  // model writes is Vietnamese now, so both summary columns hold the same text.
  return {
    title_en: obj.title.trim(),
    summary_en: summary,
    summary_vi: summary,
    category: obj.category.trim(),
    cefr: DEFAULT_CEFR,
  };
}
