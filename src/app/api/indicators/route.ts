import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { indicatorQuerySchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const parsed = indicatorQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parâmetros inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { q, category, region = "Brasil", from, to } = parsed.data;
  const where: any = {};
  if (q) where.OR = [
    { name: { contains: q, mode: "insensitive" } },
    { description: { contains: q, mode: "insensitive" } },
  ];
  if (category) where.category = { slug: category };

  const periodFilter = from || to
    ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
    : undefined;

  const indicators = await prisma.indicator.findMany({
    where,
    include: {
      category: true,
      source: true,
      observations: {
        where: { region, ...(periodFilter ? { period: periodFilter } : {}) },
        orderBy: { period: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ data: indicators, meta: { count: indicators.length, region, filters: { q, category, from, to } } });
}
