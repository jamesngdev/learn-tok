import OpenAI from "openai";
import type { Cefr, Summary } from "./types";

export type CompleteFn = (systemPrompt: string, userPrompt: string) => Promise<string>;

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

export const deepseekComplete: CompleteFn = async (system, user) => {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
  const r = await client.chat.completions.create({
    // `deepseek-chat` was retired; the API now serves deepseek-v4-{pro,flash}.
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return r.choices[0]?.message?.content ?? "";
};

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
