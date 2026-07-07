import { NextResponse } from "next/server";
import { getServerDb } from "@/lib/server-db";
import { getFeed, type FeedMode } from "@/lib/feed";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const mode: FeedMode = url.searchParams.get("mode") === "knowledge" ? "knowledge" : "news";
  const limit = Number(url.searchParams.get("limit") ?? "10");
  const page = getFeed(getServerDb(), mode, cursor, Number.isFinite(limit) ? limit : 10);
  return NextResponse.json(page);
}
