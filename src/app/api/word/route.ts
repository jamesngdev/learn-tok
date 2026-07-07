import { NextResponse } from "next/server";
import { getServerDb } from "@/lib/server-db";
import { lookupWord } from "@/lib/words";
import { lookupDictionary } from "@/lib/dictionary";
import { translateToVi } from "@/lib/translate";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const w = new URL(req.url).searchParams.get("w");
  if (!w) return NextResponse.json({ error: "missing w" }, { status: 400 });
  const entry = await lookupWord(getServerDb(), w, {
    lookupDictionary,
    translateToVi,
    now: () => new Date().toISOString(),
  });
  return NextResponse.json(entry);
}
