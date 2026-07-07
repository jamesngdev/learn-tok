import { NextResponse } from "next/server";
import { getServerDb } from "@/lib/server-db";
import { ignoreCard, type CardType } from "@/lib/ignore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const type = body?.type as CardType;
  const id = Number(body?.id);
  if ((type !== "news" && type !== "knowledge") || !Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid type or id" }, { status: 400 });
  }
  ignoreCard(getServerDb(), type, id, new Date().toISOString());
  return NextResponse.json({ ok: true });
}
