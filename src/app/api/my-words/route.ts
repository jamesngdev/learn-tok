import { NextResponse } from "next/server";
import { getServerDb } from "@/lib/server-db";
import { saveMyWord, listMyWords } from "@/lib/words";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ words: listMyWords(getServerDb()) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body?.word) {
    return NextResponse.json({ error: "missing word" }, { status: 400 });
  }
  saveMyWord(getServerDb(), body.word, new Date().toISOString(), body.articleId);
  return NextResponse.json({ ok: true });
}
