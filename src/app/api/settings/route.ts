import { NextResponse } from "next/server";
import { getServerDb } from "@/lib/server-db";
import { getInterests, setInterests } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ interests: getInterests(getServerDb()) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const interests = Array.isArray(body?.interests) ? body.interests.map(String) : [];
  setInterests(getServerDb(), interests);
  return NextResponse.json({ ok: true, interests: getInterests(getServerDb()) });
}
