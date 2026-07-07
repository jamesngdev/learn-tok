import { NextResponse } from "next/server";
import { getServerDb } from "@/lib/server-db";
import { getKnowledgeDetail } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const detail = getKnowledgeDetail(getServerDb(), Number(id));
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail);
}
