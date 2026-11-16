import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86400;

const UF_CODES = new Set(["11","12","13","14","15","16","17","21","22","23","24","25","26","27","28","29","31","32","33","35","41","42","43","50","51","52","53"]);

export async function GET(request: NextRequest) {
  const uf = request.nextUrl.searchParams.get("uf") ?? "";
  if (!UF_CODES.has(uf)) return NextResponse.json({ error: "Informe um código IBGE válido de Unidade da Federação." }, { status: 400 });

  try {
    const base = "https://servicodados.ibge.gov.br/api";
    const [shapeResponse, placesResponse] = await Promise.all([
      fetch(`${base}/v3/malhas/estados/${uf}?formato=application/vnd.geo+json&intrarregiao=municipios&qualidade=minima`, { next: { revalidate: 86400 } }),
      fetch(`${base}/v1/localidades/estados/${uf}/municipios`, { next: { revalidate: 86400 } }),
    ]);
    if (!shapeResponse.ok) throw new Error(`IBGE respondeu HTTP ${shapeResponse.status} ao consultar as geometrias municipais da UF ${uf}.`);
    if (!placesResponse.ok) throw new Error(`IBGE respondeu HTTP ${placesResponse.status} ao consultar a lista de municípios da UF ${uf}.`);

    const geojson = await shapeResponse.json();
    const places = await placesResponse.json() as Array<{ id: number; nome: string; microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } } }>;
    const names = new Map(places.map((place) => [String(place.id), place.nome]));
    const features = Array.isArray(geojson.features) ? geojson.features.map((feature: any) => {
      const code = String(feature.properties?.codarea ?? feature.id ?? "");
      return { ...feature, id: code, properties: { ...feature.properties, codarea: code, name: names.get(code) ?? feature.properties?.name ?? code } };
    }) : [];

    return NextResponse.json({ type: "FeatureCollection", features, uf, municipalities: places.length }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar a malha municipal do IBGE.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
