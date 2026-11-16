import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Retorna o catálogo estadual e as observações dos indicadores solicitados. */
export async function GET(request: NextRequest) {
  try {
    const slugs = (request.nextUrl.searchParams.get("indicators") ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean).slice(0, 12);

    const indicators = await prisma.indicator.findMany({
      where: { geographyLevel: "UF" },
      select: {
        id: true, slug: true, name: true, unit: true, periodicity: true,
        methodology: true, externalCode: true,
        category: { select: { name: true, slug: true } },
        source: { select: { name: true, url: true } },
      },
      orderBy: { name: "asc" },
    });

    const selected = slugs.length ? indicators.filter((item) => slugs.includes(item.slug)) : [];
    if (!selected.length) {
      return NextResponse.json({ indicators, selectedIndicators: [], observations: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const observations = await prisma.observation.findMany({
      where: {
        indicatorId: { in: selected.map((item) => item.id) },
        OR: [{ geographyLevel: "UF" }, { geographyCode: { not: null } }],
      },
      select: { indicatorId: true, region: true, geographyCode: true, geographyLevel: true, period: true, value: true },
      orderBy: { period: "asc" },
    });

    return NextResponse.json({ indicators, selectedIndicators: selected, observations }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar os indicadores combinados.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
