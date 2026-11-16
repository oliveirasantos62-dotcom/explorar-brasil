import { NextResponse } from "next/server";

export const revalidate = 86400;

export async function GET() {
  try {
    const url = "https://servicodados.ibge.gov.br/api/v3/malhas/estados?formato=application/vnd.geo+json&qualidade=intermediaria";
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error(`IBGE respondeu com HTTP ${response.status}.`);
    const geojson = await response.json();
    return NextResponse.json(geojson, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar a malha territorial do IBGE.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
