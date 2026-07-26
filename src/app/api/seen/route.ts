import { NextResponse } from "next/server";
import { getServerDb } from "@/lib/server-db";
import { markSeen } from "@/lib/seen";
import type { CardType } from "@/lib/ignore";

export const dynamic = "force-dynamic";

/** Body: { type: "news" | "knowledge", ids: number[] } — cards scrolled past. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const type = body?.type as CardType;
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
  if (type !== "news" && type !== "knowledge") {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }
  const added = markSeen(getServerDb(), type, ids, new Date().toISOString());
  return NextResponse.json({ ok: true, added });
}
