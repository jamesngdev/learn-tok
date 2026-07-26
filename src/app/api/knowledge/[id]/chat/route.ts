import { getServerDb } from "@/lib/server-db";
import { getKnowledgeDetail } from "@/lib/knowledge";
import { buildChatMessages, type ChatMessage } from "@/lib/chat";
import { deepseekChatStream } from "@/lib/deepseek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Ask DeepSeek about one knowledge lesson. Body: { messages: ChatMessage[] }
 * (the whole visible conversation; the lesson is added server-side).
 * Responds with a plain-text stream of the answer as it is generated.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const lesson = getKnowledgeDetail(getServerDb(), Number(id));
  if (!lesson) return json({ error: "not found" }, 404);

  let messages: ChatMessage[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.messages)) messages = body.messages;
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser || !lastUser.content?.trim()) {
    return json({ error: "missing question" }, 400);
  }

  const turns = buildChatMessages(lesson, messages);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of deepseekChatStream(turns)) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        console.error("knowledge chat failed:", err);
        // The status is already 200 by now, so surface the failure in-band.
        controller.enqueue(
          encoder.encode("\n\n_(Xin lỗi, mình đang không gọi được DeepSeek. Thử lại nhé.)_")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
