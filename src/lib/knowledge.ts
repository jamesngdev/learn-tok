import type { DB } from "./db";
import type { Cefr, KnowledgeGenerated, KnowledgeDetail } from "./types";
import { deepseekComplete, type CompleteFn } from "./deepseek";

// Lessons are Vietnamese now, so CEFR (an English reading level) no longer
// means anything. The column stays for schema compatibility with a fixed value.
const DEFAULT_CEFR: Cefr = "B1";

const SYSTEM_PROMPT = `Bạn là một người thầy giỏi, dạy được sâu và rõ ràng bất kỳ chủ đề nào — từ backend
engineering tới nuôi con, sức khoẻ, tài chính, nấu ăn hay bất cứ thứ gì khác. Nội dung phải thực sự
hữu ích và thực tế, không chung chung.

QUY TẮC NGÔN NGỮ (BẮT BUỘC): viết TOÀN BỘ bằng TIẾNG VIỆT tự nhiên, dễ đọc — "topic", "category",
"title", "summary" và "detail_md" đều là tiếng Việt. Chỉ giữ nguyên tiếng Anh các thuật ngữ
chuyên ngành đã quen dùng (connection pooling, cache, index, API, deadlock...), tên riêng, tên sản
phẩm và từ viết tắt; đừng dịch máy móc những thuật ngữ đó.

Trả về DUY NHẤT một JSON object với các key:
"topic" (tên ngắn, duy nhất của đúng thứ được dạy, ví dụ "Luyện ngủ cho trẻ 1-3 tuổi"),
"category" (nhãn ngắn của lĩnh vực, ví dụ "Nuôi con", "Sức khoẻ", "Backend", "Tài chính"),
"title" (tiêu đề thẻ ngắn, gãy gọn),
"summary" (2-3 câu nói vì sao chuyện này quan trọng — vừa một thẻ điện thoại),
"detail_md" (bài viết ĐẦY ĐỦ dạng Markdown, ĐỘ DÀI BẮT BUỘC 1300-1900 từ — viết như một bài
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
   Tuyệt đối cụ thể: ví dụ thật, con số thật, tên công cụ/sản phẩm thật — không nói chung chung),
"diagram" (một sơ đồ Mermaid nếu nó thực sự giúp hiểu, ví dụ "flowchart LR\\n A-->B" hoặc "mindmap",
   nếu không thì ""; nhãn tiếng Việt phải đặt trong ngoặc kép, ví dụ A["Người dùng"]-->B["Cache"]).`;

function focusClause(focusArea: string | null): string {
  return focusArea
    ? `\n\nChủ đề người đọc đã chọn: "${focusArea}". Hãy chọn một khía cạnh cụ thể, hữu ích trong đó và viết toàn bộ bài học bằng tiếng Việt.`
    : `\n\nHãy tự chọn một chủ đề thực sự hữu ích, thú vị để dạy hôm nay, và viết toàn bộ bằng tiếng Việt.`;
}

function parseKnowledge(raw: string): KnowledgeGenerated {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("DeepSeek returned non-JSON output");
  }
  for (const key of ["topic", "category", "title", "summary", "detail_md"] as const) {
    if (typeof obj[key] !== "string" || obj[key].trim() === "") {
      throw new Error(`knowledge response missing field: ${key}`);
    }
  }
  const summary = obj.summary.trim();
  // The `*_en` / `summary_vi` names are legacy column names — the whole lesson
  // is Vietnamese now, so both summary columns hold the same text.
  return {
    topic: obj.topic.trim(),
    category: obj.category.trim(),
    title_en: obj.title.trim(),
    summary_en: summary,
    summary_vi: summary,
    detail_md: obj.detail_md.trim(),
    diagram: typeof obj.diagram === "string" ? obj.diagram.trim() : "",
    cefr: DEFAULT_CEFR,
  };
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
  // A 1300-1900 word Vietnamese lesson plus JSON scaffolding needs a high cap;
  // the default would truncate the JSON and fail to parse.
  const raw = await complete(SYSTEM_PROMPT, avoid + focusClause(focusArea), { maxTokens: 8000 });
  return parseKnowledge(raw);
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
