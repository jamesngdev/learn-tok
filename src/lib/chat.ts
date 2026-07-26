import type { ChatTurn } from "./deepseek";
import type { KnowledgeDetail } from "./types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Keep the request bounded: last N turns, each clipped, lesson clipped. */
export const MAX_TURNS = 12;
export const MAX_MESSAGE_CHARS = 2000;
const MAX_LESSON_CHARS = 12000;

const SYSTEM = `Bạn là trợ giảng của app DailyTok, đang trả lời câu hỏi của người đọc về ĐÚNG bài học
bên dưới. Nguyên tắc:
- Trả lời bằng TIẾNG VIỆT tự nhiên, giữ nguyên tiếng Anh các thuật ngữ chuyên ngành và tên riêng.
- Ưu tiên dựa vào nội dung bài học; được bổ sung kiến thức ngoài bài khi cần, nhưng phải nói rõ
  phần nào là mở rộng ngoài bài.
- Nếu người đọc hỏi thứ bài học không đề cập và bạn không chắc, hãy nói thẳng là không chắc.
- Ngắn gọn, đi thẳng vào việc: 2-6 câu hoặc vài gạch đầu dòng. Chỉ viết dài khi người đọc yêu cầu
  giải thích sâu. Dùng Markdown (bullet, **in đậm**, code block) cho dễ đọc.
- Có ví dụ/con số cụ thể khi giúp người đọc hiểu nhanh hơn.`;

/** Clip long text on a whitespace boundary when possible. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastBreak = cut.lastIndexOf("\n");
  return (lastBreak > max * 0.6 ? cut.slice(0, lastBreak) : cut) + "\n…(đã lược bớt)";
}

/**
 * Build the DeepSeek message list for the "ask about this lesson" chat: the
 * lesson itself as context, then the recent conversation.
 */
export function buildChatMessages(
  lesson: Pick<KnowledgeDetail, "title_en" | "category" | "summary_en" | "detail_md">,
  history: ChatMessage[]
): ChatTurn[] {
  const context = `Bài học người đọc đang xem:

# ${lesson.title_en}
Lĩnh vực: ${lesson.category}
Tóm tắt: ${lesson.summary_en}

${clip(lesson.detail_md, MAX_LESSON_CHARS)}`;

  const turns = history
    .filter((m) => typeof m.content === "string" && m.content.trim() !== "")
    .slice(-MAX_TURNS)
    .map((m) => ({
      role: m.role,
      content: clip(m.content.trim(), MAX_MESSAGE_CHARS),
    }));

  return [
    { role: "system", content: SYSTEM },
    { role: "system", content: context },
    ...turns,
  ];
}
