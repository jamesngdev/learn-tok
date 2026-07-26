import type { DB } from "./db";
import type { Cefr, KnowledgeGenerated, KnowledgeDetail } from "./types";
import { deepseekComplete, type CompleteFn } from "./deepseek";

// Lessons are Vietnamese now, so CEFR (an English reading level) no longer
// means anything. The column stays for schema compatibility with a fixed value.
const DEFAULT_CEFR: Cefr = "B1";

const SYSTEM_PROMPT = `Bạn là một người thầy giỏi, dạy được sâu và rõ ràng bất kỳ chủ đề nào — từ backend
engineering tới nuôi con, sức khoẻ, tài chính, nấu ăn hay bất cứ thứ gì khác. Nội dung phải thực sự
hữu ích và thực tế, không chung chung.

QUY TẮC NGÔN NGỮ (BẮT BUỘC): viết TOÀN BỘ bằng TIẾNG VIỆT tự nhiên, dễ đọc. Chỉ giữ nguyên tiếng
Anh các thuật ngữ chuyên ngành đã quen dùng (connection pooling, cache, index, API, deadlock...),
tên riêng, tên sản phẩm và từ viết tắt; đừng dịch máy móc những thuật ngữ đó.

ĐỊNH DẠNG TRẢ VỀ (BẮT BUỘC, không thêm gì khác): 6 khối, mỗi khối bắt đầu bằng một dòng nhãn
riêng viết y hệt như dưới đây, nội dung nằm ở các dòng tiếp theo. KHÔNG bọc câu trả lời trong
JSON, KHÔNG bọc trong dấu ngoặc kép, KHÔNG bọc cả bài trong \`\`\`.

===TOPIC===
tên ngắn, duy nhất của đúng thứ được dạy, ví dụ: Luyện ngủ cho trẻ 1-3 tuổi
===CATEGORY===
nhãn ngắn của lĩnh vực, ví dụ: Nuôi con / Sức khoẻ / Backend / Tài chính
===TITLE===
tiêu đề thẻ ngắn, gãy gọn
===SUMMARY===
2-3 câu nói vì sao chuyện này quan trọng — vừa một thẻ điện thoại
===DIAGRAM===
một sơ đồ Mermaid nếu nó thực sự giúp hiểu (ví dụ: flowchart LR rồi các dòng A-->B, hoặc mindmap),
nếu không cần thì để trống khối này. Nhãn tiếng Việt phải đặt trong ngoặc kép, ví dụ
A["Người dùng"]-->B["Cache"]. Không bọc sơ đồ trong \`\`\`.
===DETAIL===
   bài viết ĐẦY ĐỦ dạng Markdown, ĐỘ DÀI BẮT BUỘC 1300-1900 từ — viết như một bài
   hướng dẫn hoàn chỉnh, KHÔNG được viết sơ sài hay chỉ gạch đầu dòng chung chung. Mỗi mục phải
   có ít nhất 2-3 đoạn văn hoặc 4-6 bullet CÓ NỘI DUNG THẬT. Dùng ĐÚNG dàn ý sau, đúng thứ tự
   và đúng tên mục:
   "## Dàn ý" — danh sách gạch đầu dòng liệt kê các mục bên dưới, mỗi dòng kèm 5-12 từ nói mục
      đó trả lời câu hỏi gì (đây là dàn ý để người đọc biết bài này đi tới đâu),
   "## Tổng quan" — đây là gì, đặt trong tình huống thực tế nào, ai cần quan tâm,
   "## Vì sao quan trọng" — lợi ích cụ thể và hậu quả nếu làm sai (kèm con số khi có),
   "## Kiến thức cốt lõi" — 3-5 tiểu mục "###", mỗi tiểu mục giải thích một khái niệm/cơ chế và
      LUÔN kèm một ví dụ cụ thể; chèn code trong fenced block nếu chủ đề kỹ thuật,
   "## Hướng dẫn từng bước" — danh sách ĐÁNH SỐ các bước làm được ngay, mỗi bước nói rõ làm gì,
      làm thế nào và dấu hiệu biết là đã đúng,
   "## Ví dụ thực tế" — một tình huống cụ thể chạy xuyên suốt: bối cảnh, cách xử lý, kết quả kèm
      số liệu (code/bảng nếu phù hợp),
   "## Sai lầm thường gặp" — bảng Markdown 3 cột "Sai lầm | Vì sao sai | Sửa thế nào", 4-6 dòng,
   "## Checklist áp dụng" — danh sách "- [ ] ..." 5-8 việc kiểm được,
   "## Câu hỏi thường gặp" — 3-5 câu hỏi thật người học hay hỏi, mỗi câu in đậm rồi trả lời 2-4 câu,
   "## Chốt lại" — 3-5 gạch đầu dòng đúc kết, mỗi dòng một hành động cụ thể.
   Tuyệt đối cụ thể: ví dụ thật, con số thật, tên công cụ/sản phẩm thật — không nói chung chung.`;

function focusClause(focusArea: string | null): string {
  return focusArea
    ? `\n\nChủ đề người đọc đã chọn: "${focusArea}". Hãy chọn một khía cạnh cụ thể, hữu ích trong đó và viết toàn bộ bài học bằng tiếng Việt.`
    : `\n\nHãy tự chọn một chủ đề thực sự hữu ích, thú vị để dạy hôm nay, và viết toàn bộ bằng tiếng Việt.`;
}

const SECTION_RE = /^[ \t]*={2,}\s*(TOPIC|CATEGORY|TITLE|SUMMARY|DIAGRAM|DETAIL)\s*={2,}[ \t]*$/gim;

/** Split the `===LABEL===` blocks of a lesson response into a map. */
export function splitSections(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const marks = [...raw.matchAll(SECTION_RE)];
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const start = m.index! + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index! : raw.length;
    out[m[1].toUpperCase()] = raw.slice(start, end).trim();
  }
  return out;
}

/** Models like to wrap blocks in ``` even when told not to. */
function stripFence(text: string): string {
  const m = text.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/);
  return (m ? m[1] : text).trim();
}

/**
 * A lesson comes back as `===LABEL===` blocks, not JSON: the Markdown body is
 * thousands of words long and in JSON mode the model regularly leaves a quote
 * unescaped, which makes the entire response unparseable.
 */
function parseKnowledge(raw: string): KnowledgeGenerated {
  const s = splitSections(raw);
  for (const key of ["TOPIC", "CATEGORY", "TITLE", "SUMMARY", "DETAIL"] as const) {
    if (!s[key]) throw new Error(`knowledge response missing section: ${key}`);
  }
  const summary = s.SUMMARY;
  // The `*_en` / `summary_vi` names are legacy column names — the whole lesson
  // is Vietnamese now, so both summary columns hold the same text.
  return {
    topic: s.TOPIC.replace(/^#+\s*/, ""),
    category: s.CATEGORY,
    title_en: s.TITLE.replace(/^#+\s*/, ""),
    summary_en: summary,
    summary_vi: summary,
    detail_md: stripFence(s.DETAIL),
    diagram: stripFence(s.DIAGRAM ?? ""),
    cefr: DEFAULT_CEFR,
  };
}

const REQUIRED_HEADINGS = [
  "## Dàn ý",
  "## Tổng quan",
  "## Vì sao quan trọng",
  "## Kiến thức cốt lõi",
  "## Hướng dẫn từng bước",
  "## Ví dụ thực tế",
  "## Sai lầm thường gặp",
  "## Checklist áp dụng",
  "## Câu hỏi thường gặp",
  "## Chốt lại",
];
const MIN_WORDS = 1100;

/**
 * What a generated lesson is missing versus the required outline, in Vietnamese
 * (the list is fed back to the model on the retry). Empty means good enough.
 */
export function lessonShortcomings(lesson: KnowledgeGenerated): string[] {
  const md = lesson.detail_md;
  const problems: string[] = [];
  const missing = REQUIRED_HEADINGS.filter((h) => !md.includes(h));
  if (missing.length > 0) problems.push(`thiếu hẳn các mục: ${missing.join(", ")}`);
  const words = md.split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS) problems.push(`bài chỉ dài ${words} từ, cần tối thiểu ${MIN_WORDS} từ`);
  return problems;
}

export async function generateKnowledge(
  existingTopics: string[],
  focusArea: string | null = null,
  complete: CompleteFn = deepseekComplete
): Promise<KnowledgeGenerated> {
  const avoid =
    existingTopics.length > 0
      ? `KHÔNG được lặp lại bất kỳ chủ đề đã dạy sau đây:\n- ${existingTopics.join("\n- ")}`
      : "Đây là chủ đề đầu tiên.";
  const user = avoid + focusClause(focusArea);
  // A 1300-1900 word Vietnamese lesson needs a high cap, and plain text (not
  // JSON mode) so quotes inside the Markdown can't break the response.
  const opts = { maxTokens: 8000, json: false };

  const first = parseKnowledge(await complete(SYSTEM_PROMPT, user, opts));
  const problems = lessonShortcomings(first);
  if (problems.length === 0) return first;

  // The model sometimes skips half the outline; tell it exactly what was wrong
  // and take the better of the two attempts.
  try {
    const retryUser = `${user}\n\nBÀI VIẾT LẦN TRƯỚC BỊ LOẠI vì ${problems.join("; ")}. Hãy viết lại từ đầu cho ĐẦY ĐỦ tất cả các mục bắt buộc, đủ độ dài, nội dung thật chi tiết.`;
    const second = parseKnowledge(await complete(SYSTEM_PROMPT, retryUser, opts));
    return lessonShortcomings(second).length < problems.length ? second : first;
  } catch (err) {
    console.error("knowledge retry failed, keeping first attempt:", err);
    return first;
  }
}

export function listKnowledgeTopics(db: DB): string[] {
  return (db.prepare("SELECT topic FROM knowledge").all() as { topic: string }[]).map(
    (r) => r.topic
  );
}

/** Insert a generated card. Returns false if the topic already exists. */
export function insertKnowledge(db: DB, k: KnowledgeGenerated, now: string): boolean {
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO knowledge
         (topic, category, title_en, summary_en, summary_vi, detail_md, diagram, cefr, created_at)
       VALUES (@topic, @category, @title_en, @summary_en, @summary_vi, @detail_md, @diagram, @cefr, @created_at)`
    )
    .run({ ...k, created_at: now });
  return info.changes > 0;
}

/** Number of knowledge cards not ignored by the user. */
export function countActiveKnowledge(db: DB): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) c FROM knowledge k
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='knowledge' AND i.card_id=k.id)`
    )
    .get() as { c: number };
  return row.c;
}

export function getKnowledgeDetail(db: DB, id: number): KnowledgeDetail | null {
  const row = db
    .prepare(
      `SELECT id, category, title_en, summary_en, summary_vi, detail_md, diagram
       FROM knowledge WHERE id = ?`
    )
    .get(id) as KnowledgeDetail | undefined;
  return row ?? null;
}

export interface KnowledgeDeps {
  generate: (existingTopics: string[]) => Promise<KnowledgeGenerated>;
  now: () => string;
}

/**
 * Generate up to `count` new, non-duplicate knowledge cards.
 * Returns how many were actually inserted.
 */
export async function generateKnowledgeBatch(
  db: DB,
  count: number,
  deps: KnowledgeDeps
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < count; i++) {
    try {
      const topics = listKnowledgeTopics(db);
      const k = await deps.generate(topics);
      if (insertKnowledge(db, k, deps.now())) inserted++;
    } catch (err) {
      console.error("knowledge generation failed:", err);
    }
  }
  return inserted;
}
