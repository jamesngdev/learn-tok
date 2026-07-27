import { getServerDb } from "@/lib/server-db";
import { todayInVN } from "@/lib/expense-date";
import { makeToolRunner } from "@/lib/expense-tools";
import { listCategories } from "@/lib/expenses";
import { runExpenseAgent, type ChatMessage } from "@/lib/expense-agent";

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
 * The expense chat. Body: { messages: ChatMessage[] } (the whole visible
 * conversation). Responds with NDJSON — one JSON object per line:
 *
 *   {"t":"text","d":"…"}                     answer text, as it is generated
 *   {"t":"tool","name":"add_expenses",…}     a tool ran; the client refetches
 *   {"t":"error","m":"…"}                    failure after the 200 was sent
 */
export async function POST(req: Request) {
  let messages: ChatMessage[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.messages)) messages = body.messages;
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.content?.trim()) return json({ error: "missing message" }, 400);

  const db = getServerDb();
  // One "today" for the whole request, so a message sent at midnight cannot be
  // written to one day and summed against another.
  const today = todayInVN();
  const agent = runExpenseAgent({
    categories: listCategories(db),
    today,
    history: messages,
    runTool: makeToolRunner(db, today),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of agent) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        console.error("expense chat failed:", err);
        // Status is already 200 by now, so the failure has to go in-band.
        controller.enqueue(
          encoder.encode(JSON.stringify({ t: "error", m: "Có lỗi, thử lại nhé." }) + "\n")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
