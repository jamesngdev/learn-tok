import OpenAI from "openai";
import type { Cefr, Summary } from "./types";

export type CompleteFn = (systemPrompt: string, userPrompt: string) => Promise<string>;

const VALID_CEFR: Cefr[] = ["A2", "B1", "B2", "C1"];

const SYSTEM_PROMPT = `You are an editor for a Vietnamese learner of English.
Given a Vietnamese news article, respond with ONLY a JSON object with keys:
"title_en" (an English headline),
"summary_en" (2-3 sentence English summary),
"summary_vi" (a Vietnamese summary of the same meaning),
"category" (one of: World, Business, Science, Life, Sports, Tech, Vietnam),
"cefr" (reading difficulty of summary_en: one of A2, B1, B2, C1).
Keep it concise enough to fit one phone card.`;

export const deepseekComplete: CompleteFn = async (system, user) => {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
  const r = await client.chat.completions.create({
    model: "deepseek-chat",
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
  for (const key of ["title_en", "summary_en", "summary_vi", "category"] as const) {
    if (typeof obj[key] !== "string" || obj[key].trim() === "") {
      throw new Error(`DeepSeek response missing field: ${key}`);
    }
  }
  const cefr: Cefr = VALID_CEFR.includes(obj.cefr) ? obj.cefr : "B1";
  return {
    title_en: obj.title_en.trim(),
    summary_en: obj.summary_en.trim(),
    summary_vi: obj.summary_vi.trim(),
    category: obj.category.trim(),
    cefr,
  };
}
