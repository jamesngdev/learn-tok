import { getServerDb } from "@/lib/server-db";
import { addCategory, deleteCategory, listCategories } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function GET() {
  return json({ categories: listCategories(getServerDb()) });
}

/** POST /api/expenses/categories — body { name, emoji? } */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return json({ error: "name rỗng" }, 400);
  const emoji = typeof body?.emoji === "string" ? body.emoji : "";
  return json({ categories: addCategory(getServerDb(), name, emoji) }, 201);
}

/**
 * DELETE /api/expenses/categories?name=… — the category goes, its expenses
 * move to "Khác" so no spending history is ever lost.
 */
export async function DELETE(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim();
  if (!name) return json({ error: "name rỗng" }, 400);
  return json({ categories: deleteCategory(getServerDb(), name) });
}
