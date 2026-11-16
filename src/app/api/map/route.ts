import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const indicators = await prisma.indicator.findMany({
      where: { geographyLevel: "UF" },
      select: { id: true, slug: true, name: true, unit: true, periodicity: true, methodology: true, externalCode: true, source: { select: { name: true, url: true, consultedAt: true } } },
      orderBy: { name: "asc" },
    });

    if (!indicators.length) {
      return NextResponse.json({ indicators: [], selectedIndicator: null, observations: [], periods: [] });
    }

    const requestedSlug = request.nextUrl.searchParams.get("indicator");
    const selected = indicators.find((item) => item.slug === requestedSlug) ?? indicators[0];
    const observations = await prisma.observation.findMany({
      where: { indicatorId: selected.id, OR: [{ geographyLevel: "UF" }, { geographyCode: { not: null } }] },
      select: { region: true, geographyCode: true, geographyLevel: true, period: true, value: true, fetchedAt: true },
      orderBy: { period: "asc" },
    });
    const periods = [...new Set(observations.map((item) => item.period))].sort();

    return NextResponse.json({
      indicators,
      selectedIndicator: selected,
      observations,
      periods,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar os dados territoriais.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
