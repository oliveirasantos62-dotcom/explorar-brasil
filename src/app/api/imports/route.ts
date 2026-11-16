import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET() {
  const data = await prisma.importLog.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
  return NextResponse.json({ data });
}
