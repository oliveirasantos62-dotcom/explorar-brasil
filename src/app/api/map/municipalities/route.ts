import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const UF_CODES = new Set(["11","12","13","14","15","16","17","21","22","23","24","25","26","27","28","29","31","32","33","35","41","42","43","50","51","52","53"]);

export async function GET(request: NextRequest) {
  try {
    const uf = request.nextUrl.searchParams.get("uf") ?? "";
    if (!UF_CODES.has(uf)) return NextResponse.json({ error: "Código de UF inválido." }, { status: 400 });
    const indicators = await prisma.indicator.findMany({
      where: { geographyLevel: "Municipio" },
      select: { id: true, slug: true, name: true, unit: true, periodicity: true, methodology: true, externalCode: true, source: { select: { name: true, url: true, consultedAt: true } } },
      orderBy: { name: "asc" },
    });
    if (!indicators.length) return NextResponse.json({ indicators: [], selectedIndicator: null, observations: [], periods: [], uf });
    const slug = request.nextUrl.searchParams.get("indicator");
    const selected = indicators.find((item) => item.slug === slug) ?? indicators[0];
    const observations = await prisma.observation.findMany({
      where: { indicatorId: selected.id, geographyLevel: "Municipio", geographyCode: { startsWith: uf } },
      select: { region: true, geographyCode: true, geographyLevel: true, period: true, value: true, fetchedAt: true },
      orderBy: { period: "asc" },
    });
    return NextResponse.json({ indicators, selectedIndicator: selected, observations, periods: [...new Set(observations.map((item) => item.period))].sort(), uf }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar os dados municipais.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
