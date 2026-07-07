import { NextResponse } from "next/server";
import { getServerDb } from "@/lib/server-db";
import { topUpKnowledge } from "@/lib/knowledge-live";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await topUpKnowledge(getServerDb(), 10, 4);
    return NextResponse.json(result);
  } catch (err) {
    console.error("knowledge topup failed:", err);
    return NextResponse.json(
      { error: "topup failed", generated: 0, active: 0 },
      { status: 502 }
    );
  }
}
