import { NextResponse } from "next/server";
import { getServerDb } from "@/lib/server-db";
import { translatePhrase } from "@/lib/words";
import { translateToVi } from "@/lib/translate";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const text = new URL(req.url).searchParams.get("text");
  if (!text || !text.trim()) {
    return NextResponse.json({ error: "missing text" }, { status: 400 });
  }
  const vi = await translatePhrase(getServerDb(), text, {
    translateToVi,
    now: () => new Date().toISOString(),
  });
  return NextResponse.json({ vi });
}
