import { NextResponse } from "next/server";
import { getServerDb } from "@/lib/server-db";
import { crawlNow } from "@/lib/crawl-live";

export const dynamic = "force-dynamic";
// A manual crawl can take a while when there are many new stories.
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await crawlNow(getServerDb());
    return NextResponse.json(result);
  } catch (err) {
    console.error("manual refresh failed:", err);
    return NextResponse.json(
      { error: "refresh failed", inserted: 0, skipped: 0, failed: 0 },
      { status: 502 }
    );
  }
}
