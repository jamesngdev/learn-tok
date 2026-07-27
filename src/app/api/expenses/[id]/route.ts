import { getServerDb } from "@/lib/server-db";
import { isValidDay } from "@/lib/expense-date";
import { deleteExpense, getDayView, getExpense, resolveCategory, updateExpense } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** PATCH /api/expenses/[id] — edit one expense; responds with the day it now sits on. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = getServerDb();
  if (!Number.isInteger(id) || !getExpense(db, id)) return json({ error: "not found" }, 404);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }

  const patch: Parameters<typeof updateExpense>[2] = {};
  if (body?.amount !== undefined) {
    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000_000) {
      return json({ error: "amount không hợp lệ" }, 400);
    }
    patch.amount = amount;
  }
  if (typeof body?.category === "string") patch.category = resolveCategory(db, body.category).category;
  if (typeof body?.note === "string") patch.note = body.note;
  if (isValidDay(body?.spent_on)) patch.spent_on = body.spent_on;

  const updated = updateExpense(db, id, patch);
  return json({ updated, ...getDayView(db, updated!.spent_on) });
}

/** DELETE /api/expenses/[id] */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = getServerDb();
  const gone = Number.isInteger(id) ? deleteExpense(db, id) : null;
  if (!gone) return json({ error: "not found" }, 404);
  return json({ deleted: gone, ...getDayView(db, gone.spent_on) });
}
