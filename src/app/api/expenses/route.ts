import { getServerDb } from "@/lib/server-db";
import { isValidDay, todayInVN } from "@/lib/expense-date";
import { addExpense, getDayView, resolveCategory } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** GET /api/expenses?day=YYYY-MM-DD — one day's items plus the running totals. */
export async function GET(req: Request) {
  const param = new URL(req.url).searchParams.get("day");
  const day = isValidDay(param) ? param : todayInVN();
  return json(getDayView(getServerDb(), day));
}

/** POST /api/expenses — add one expense by hand (the always-available fallback). */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }

  const amount = Math.round(Number(body?.amount));
  if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000_000) {
    return json({ error: "amount không hợp lệ" }, 400);
  }
  const db = getServerDb();
  const day = isValidDay(body?.spent_on) ? body.spent_on : todayInVN();
  addExpense(db, {
    amount,
    category: resolveCategory(db, body?.category).category,
    note: typeof body?.note === "string" ? body.note : "",
    spent_on: day,
    source: "manual",
  });
  return json(getDayView(db, day), 201);
}
