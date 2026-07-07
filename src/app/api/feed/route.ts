import { NextResponse } from "next/server";
import { getServerDb } from "@/lib/server-db";
import { getFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Number(url.searchParams.get("limit") ?? "10");
  const page = getFeed(getServerDb(), cursor, Number.isFinite(limit) ? limit : 10);
  return NextResponse.json(page);
}
