"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowDownWideNarrow, ArrowUpWideNarrow, Download, Info, MapPinned,
  Plus, TrendingUp, X,
} from "lucide-react";
import { BRAZILIAN_STATES, STATE_BY_CODE } from "@/lib/geography";

type Indicator = {
  id: string; slug: string; name: string; unit: string; periodicity: string;
  methodology: string | null; externalCode: string | null;
  source: { name: string; url: string; consultedAt: string | null };
};
type Observation = {
  region: string; geographyCode: string | null; geographyLevel: string | null;
  period: string; value: number; fetchedAt: string;
};
type GeoFeature = {
  type: "Feature"; id?: string | number; properties?: Record<string, string | number | undefined>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any };
};
type GeoCollection = { type: "FeatureCollection"; features: GeoFeature[] };
type MapPayload = { indicators: Indicator[]; selectedIndicator: Indicator | null; observations: Observation[]; periods: string[]; error?: string };
type StateRow = (typeof BRAZILIAN_STATES)[number] & { value: number | null; rank: number | null };

const COLORS = ["#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"];
const LINE_COLORS = ["#2457d6", "#0f9f79", "#d97706"];

function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function stateCodeForObservation(item: Observation): string | null {
  if (item.geographyCode) {
    const rawCode = item.geographyCode.padStart(2, "0");
    const ufCode = rawCode.length === 7 ? rawCode.slice(0, 2) : rawCode;
    if (STATE_BY_CODE.has(ufCode)) return ufCode;
  }
  const normalized = normalizeName(item.region);
  return BRAZILIAN_STATES.find((state) => normalizeName(state.name) === normalized)?.code ?? null;
}

function collectPositions(value: any, output: number[][]) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    output.push(value as number[]);
    return;
  }
  value.forEach((child) => collectPositions(child, output));
}

function geometryPath(feature: GeoFeature, project: (point: number[]) => [number, number]) {
  const polygons = feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
  return polygons.map((polygon: number[][][]) => polygon.map((ring) => ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ") + " Z").join(" ")).join(" ");
}

function formatValue(value: number | null, unit: string) {
  if (value === null || !Number.isFinite(value)) return "Sem dado";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} ${unit}`;
}

function formatPeriod(period: string) {
  const quarter = period.match(/^(\d{4})-T([1-4])$/);
  if (quarter) return `${quarter[2]}º trimestre de ${quarter[1]}`;
  const month = period.match(/^(\d{4})-(\d{2})$/);
  if (month) return `${month[2]}/${month[1]}`;
  return period;
}

function downloadCsv(rows: StateRow[], indicator: Indicator | null, period: string) {
  const header = ["codigo_ibge_uf", "uf", "estado", "regiao", "indicador", "periodo", "valor", "unidade", "fonte"];
  const body = rows.map((row) => [row.code, row.abbreviation, row.name, row.region, indicator?.name ?? "", period, row.value ?? "", indicator?.unit ?? "", indicator?.source.name ?? ""]);
  const csv = [header, ...body].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `observatorio-${indicator?.slug ?? "brasil"}-${period || "sem-periodo"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadSvgAsPng(svg: SVGSVGElement | null, filename: string) {
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const viewBox = clone.viewBox.baseVal;
  const width = viewBox.width || Number(clone.getAttribute("width")) || 1000;
  const height = viewBox.height || Number(clone.getAttribute("height")) || 700;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const source = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Não foi possível preparar a imagem.")); });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * 2);
    canvas.height = Math.round(height * 2);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponível.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Falha ao gerar PNG.");
    const pngUrl = URL.createObjectURL(png);
    const anchor = document.createElement("a");
    anchor.href = pngUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(pngUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function BrazilExplorer() {
  const [payload, setPayload] = useState<MapPayload>({ indicators: [], selectedIndicator: null, observations: [], periods: [] });
  const [selectedIndicator, setSelectedIndicator] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [selectedState, setSelectedState] = useState("23");
  const [comparisonCodes, setComparisonCodes] = useState<string[]>([]);
  const [comparisonCandidate, setComparisonCandidate] = useState("31");
  const [regionFilter, setRegionFilter] = useState("Todas as regiões");
  const [descending, setDescending] = useState(true);
  const [geo, setGeo] = useState<GeoCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [geoLoading, setGeoLoading] = useState(true);
  const [error, setError] = useState("");
  const [geoError, setGeoError] = useState("");

  useEffect(() => {
    let active = true;
    setGeoLoading(true);
    fetch("/api/geography/states")
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Falha ao carregar o mapa do IBGE.");
        return json as GeoCollection;
      })
      .then((data) => { if (active) { setGeo(data); setGeoError(""); } })
      .catch((cause) => { if (active) setGeoError(cause instanceof Error ? cause.message : "Falha ao carregar a malha territorial."); })
      .finally(() => { if (active) setGeoLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const query = selectedIndicator ? `?indicator=${encodeURIComponent(selectedIndicator)}` : "";
    fetch(`/api/map${query}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Falha ao consultar os dados do mapa.");
        return json as MapPayload;
      })
      .then((data) => {
        if (!active) return;
        setPayload(data);
        if (!selectedIndicator && data.selectedIndicator) setSelectedIndicator(data.selectedIndicator.slug);
        const nextPeriod = data.periods[data.periods.length - 1] ?? "";
        setSelectedPeriod((current) => data.periods.includes(current) ? current : nextPeriod);
        if (data.observations.length) {
          const firstCode = stateCodeForObservation(data.observations[data.observations.length - 1]);
          if (firstCode) setSelectedState((current) => current || firstCode);
        }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao carregar os dados."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedIndicator]);

  const indicator = payload.selectedIndicator;
  const observationsByState = useMemo(() => {
    const map = new Map<string, Observation[]>();
    for (const item of payload.observations) {
      const code = stateCodeForObservation(item);
      if (!code) continue;
      const list = map.get(code) ?? [];
      list.push(item);
      map.set(code, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.period.localeCompare(b.period));
    return map;
  }, [payload.observations]);

  const currentRows = useMemo(() => {
    const rows = BRAZILIAN_STATES.map((state) => {
      const list = observationsByState.get(state.code) ?? [];
      const match = selectedPeriod ? list.find((item) => item.period === selectedPeriod) : list[list.length - 1];
      return { ...state, value: match?.value ?? null, rank: null as number | null };
    });
    const ranked = rows.filter((row) => row.value !== null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    ranked.forEach((row, index) => { const target = rows.find((item) => item.code === row.code); if (target) target.rank = index + 1; });
    return rows;
  }, [observationsByState, selectedPeriod]);

  const ranking = useMemo(() => currentRows
    .filter((row) => regionFilter === "Todas as regiões" || row.region === regionFilter)
    .sort((a, b) => {
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return descending ? b.value - a.value : a.value - b.value;
    }), [currentRows, descending, regionFilter]);

  const selected = BRAZILIAN_STATES.find((state) => state.code === selectedState) ?? BRAZILIAN_STATES[0];
  const selectedRow = currentRows.find((row) => row.code === selected.code);
  const selectedSeries = observationsByState.get(selected.code) ?? [];
  const selectedValue = selectedSeries.find((item) => item.period === selectedPeriod)?.value ?? null;
  const selectedRankIndex = ranking.findIndex((row) => row.code === selected.code);
  const selectedRank = selectedRow?.value === null || selectedRow?.value === undefined || selectedRankIndex < 0 ? null : selectedRankIndex + 1;
  const chartCodes = useMemo(() => [...new Set([selectedState, ...comparisonCodes])].slice(0, 3), [selectedState, comparisonCodes]);
  const chartData = useMemo(() => {
    const periods = [...new Set(chartCodes.flatMap((code) => (observationsByState.get(code) ?? []).map((item) => item.period)))].sort();
    return periods.map((period) => {
      const row: Record<string, string | number | null> = { period: formatPeriod(period) };
      chartCodes.forEach((code) => { row[code] = observationsByState.get(code)?.find((item) => item.period === period)?.value ?? null; });
      return row;
    });
  }, [chartCodes, observationsByState]);

  const mapProjection = useMemo(() => {
    const positions: number[][] = [];
    geo?.features?.forEach((feature) => collectPositions(feature.geometry.coordinates, positions));
    if (!positions.length) return null;
    const minX = Math.min(...positions.map((point) => point[0]));
    const maxX = Math.max(...positions.map((point) => point[0]));
    const minY = Math.min(...positions.map((point) => point[1]));
    const maxY = Math.max(...positions.map((point) => point[1]));
    const width = 680; const height = 620; const padding = 18;
    const scale = Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxY - minY));
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    return (point: number[]): [number, number] => [offsetX + (point[0] - minX) * scale, height - offsetY - (point[1] - minY) * scale];
  }, [geo]);

  const valueRange = useMemo(() => {
    const values = currentRows.map((row) => row.value).filter((value): value is number => value !== null);
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
  }, [currentRows]);

  const colorFor = useCallback((value: number | null) => {
    if (value === null || !valueRange) return "#e8edf4";
    if (valueRange.max === valueRange.min) return COLORS[3];
    const bucket = Math.min(COLORS.length - 1, Math.floor(((value - valueRange.min) / (valueRange.max - valueRange.min)) * COLORS.length));
    return COLORS[bucket];
  }, [valueRange]);

  const exportCsv = () => downloadCsv(ranking, indicator, selectedPeriod);
  const exportMap = () => downloadSvgAsPng(document.querySelector<SVGSVGElement>("#brazil-map-svg"), "observatorio-mapa-brasil.png");
  const exportChart = () => downloadSvgAsPng(document.querySelector<SVGSVGElement>("#state-chart svg"), "observatorio-comparacao-estados.png");

  function addComparison() {
    if (!comparisonCandidate || comparisonCodes.includes(comparisonCandidate) || comparisonCandidate === selectedState) return;
    if (comparisonCodes.length >= 2) return;
    setComparisonCodes((items) => [...items, comparisonCandidate]);
  }

  function featureCode(feature: GeoFeature) {
    const raw = feature.properties?.codarea ?? feature.properties?.CD_UF ?? feature.properties?.CD_GEOCUF ?? feature.id ?? "";
    return String(raw).padStart(2, "0").slice(-2);
  }

  return <div className="brazil-explorer">
    <section className="map-intro">
      <div><div className="eyebrow">Inteligência territorial</div><h1>Explore o Brasil pelos dados.</h1><p>Compare indicadores entre as Unidades da Federação, acompanhe sua evolução e investigue diferenças regionais com dados e fontes identificadas.</p></div>
      <div className="map-intro-badge"><MapPinned size={18}/><span>27 unidades federativas</span></div>
    </section>

    <section className="map-toolbar panel">
      <label><span>Indicador</span><select value={selectedIndicator} onChange={(event) => { setSelectedIndicator(event.target.value); setComparisonCodes([]); }} disabled={!payload.indicators.length}>
        {payload.indicators.length === 0 && <option value="">Nenhum indicador territorial</option>}
        {payload.indicators.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}
      </select></label>
      <label><span>Período</span><select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)} disabled={!payload.periods.length}>
        {payload.periods.map((period) => <option value={period} key={period}>{formatPeriod(period)}</option>)}
      </select></label>
      <label><span>Região no ranking</span><select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
        {["Todas as regiões", "Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"].map((region) => <option key={region}>{region}</option>)}
      </select></label>
      <div className="map-export-actions"><button className="button button-light" onClick={exportCsv}><Download size={15}/> CSV</button><button className="button button-light" onClick={exportMap}><Download size={15}/> Mapa PNG</button></div>
    </section>

    {error && <div className="notice"><b>Erro ao consultar os dados:</b> {error}</div>}
    {!error && payload.indicators.length === 0 && !loading && <div className="notice"><b>Ainda não há indicador estadual cadastrado.</b> Execute <code>npm run ingest:ibge</code> para importar a taxa de desocupação por UF (SIDRA 4099, variável 4099). O mapa territorial continuará disponível, mas sem valores até a importação.</div>}

    <div className="map-main-grid">
      <section className="panel map-panel">
        <div className="panel-heading"><div><h2>Mapa por Unidade da Federação</h2><p>{indicator ? `${indicator.name} · ${selectedPeriod ? formatPeriod(selectedPeriod) : "sem período"}` : "Malha territorial oficial do IBGE"}</p></div><span className="map-status"><span className="status-dot"/>{loading || geoLoading ? "Carregando" : "Carregado"}</span></div>
        {geoError && <div className="map-inline-error">{geoError}</div>}
        {geoLoading ? <div className="map-placeholder">Carregando malha territorial do IBGE…</div> : geo && mapProjection ? <div className="map-svg-wrap"><svg id="brazil-map-svg" viewBox="0 0 680 620" role="img" aria-label="Mapa interativo dos estados brasileiros">
          {geo.features.map((feature, index) => {
            const code = featureCode(feature);
            const state = STATE_BY_CODE.get(code);
            if (!state || !mapProjection) return null;
            const row = currentRows.find((item) => item.code === code);
            const isOutsideRegion = regionFilter !== "Todas as regiões" && state.region !== regionFilter;
            const selectedFeature = selectedState === code;
            return <path key={`${code}-${index}`} d={geometryPath(feature, mapProjection)} fill={isOutsideRegion ? "#eef1f5" : colorFor(row?.value ?? null)} stroke={selectedFeature ? "#102a56" : "#ffffff"} strokeWidth={selectedFeature ? 2.8 : 1.5} opacity={isOutsideRegion ? 0.42 : 1} className="map-state-shape" onClick={() => setSelectedState(code)} tabIndex={0} role="button" aria-label={`${state.name}: ${formatValue(row?.value ?? null, indicator?.unit ?? "")}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedState(code); }}><title>{state.name} · {formatValue(row?.value ?? null, indicator?.unit ?? "")}</title></path>;
          })}
        </svg><div className="map-legend"><span>Menor valor</span><div className="legend-swatches">{COLORS.map((color) => <i key={color} style={{ background: color }}/>)}</div><span>Maior valor</span><small>Sem dado: cinza</small></div></div> : <div className="map-placeholder">Não foi possível desenhar o mapa. Tente atualizar a página.</div>}
        <div className="map-footnote"><Info size={14}/> Se um estado estiver cinza, significa que não há observação disponível para o indicador e período selecionados.</div>
      </section>

      <aside className="panel state-detail-panel">
        <div className="panel-heading"><div><span className="eyebrow">Estado selecionado</span><h2>{selected.name}</h2></div><span className="state-abbr">{selected.abbreviation}</span></div>
        <div className="state-primary-metric"><span>Valor no período</span><strong>{formatValue(selectedValue, indicator?.unit ?? "")}</strong><small>{selectedPeriod ? formatPeriod(selectedPeriod) : "Selecione um indicador com dados"}</small></div>
        <div className="state-detail-stats"><div><span>Posição no ranking</span><strong>{selectedRank ? `${selectedRank}º de ${currentRows.filter((row) => row.value !== null).length}` : "—"}</strong></div><div><span>Região</span><strong>{selected.region}</strong></div><div><span>Observações históricas</span><strong>{selectedSeries.length}</strong></div></div>
        <div className="state-detail-chart"><div className="mini-section-title"><h3>Evolução histórica</h3><TrendingUp size={16}/></div>
          {selectedSeries.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={selectedSeries.map((item) => ({ period: formatPeriod(item.period), value: item.value }))} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#edf0f5"/><XAxis dataKey="period" tick={{ fontSize: 9, fill: "#778398" }} minTickGap={28}/><YAxis tick={{ fontSize: 9, fill: "#778398" }} width={38}/><Tooltip/><Line type="monotone" dataKey="value" name={indicator?.unit ?? "Valor"} stroke="#2457d6" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div> : <div className="empty-chart">Ainda não há histórico para esta UF.</div>}
        </div>
        <div className="state-source"><span>Fonte</span><strong>{indicator?.source.name ?? "—"}</strong>{indicator?.source.url && <a href={indicator.source.url} target="_blank" rel="noreferrer">Consultar fonte original ↗</a>}</div>
        <button className="button button-primary button-full" onClick={() => { if (comparisonCodes.includes(selectedState)) setComparisonCodes((items) => items.filter((code) => code !== selectedState)); else if (comparisonCodes.length < 2) setComparisonCodes((items) => [...items, selectedState]); }} disabled={!selectedSeries.length || (!comparisonCodes.includes(selectedState) && comparisonCodes.length >= 2)}>{comparisonCodes.includes(selectedState) ? <><X size={15}/> Remover da comparação</> : <><Plus size={15}/> Adicionar à comparação</>}</button>
      </aside>
    </div>

    <div className="map-lower-grid">
      <section className="panel ranking-panel">
        <div className="panel-heading"><div><h2>Ranking das unidades federativas</h2><p>{selectedPeriod ? formatPeriod(selectedPeriod) : "Período não selecionado"}</p></div><button className="icon-button" onClick={() => setDescending((value) => !value)} title={descending ? "Ordenar do menor para o maior" : "Ordenar do maior para o menor"}>{descending ? <ArrowDownWideNarrow size={17}/> : <ArrowUpWideNarrow size={17}/>}</button></div>
        <div className="ranking-list">{ranking.map((row, index) => <button key={row.code} className={`ranking-row ${row.code === selectedState ? "active" : ""}`} onClick={() => setSelectedState(row.code)}><span className="ranking-position">{row.value === null ? "—" : index + 1}</span><span className="ranking-name"><b>{row.abbreviation}</b><small>{row.name}</small></span><span className="ranking-value">{row.value === null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(row.value)}</span><span className="ranking-bar"><i style={{ width: row.value === null || !valueRange || valueRange.max === 0 ? "0%" : `${Math.max(4, (row.value / valueRange.max) * 100)}%` }}/></span></button>)}{ranking.every((row) => row.value === null) && <div className="empty">Sem observações para este período. Importe a série estadual do IBGE para preencher o ranking.</div>}</div>
      </section>

      <section className="panel comparison-panel">
        <div className="panel-heading"><div><h2>Comparar estados</h2><p>Compare até três UFs ao longo do tempo.</p></div><TrendingUp size={19} color="#2457d6"/></div>
        <div className="comparison-controls"><select value={comparisonCandidate} onChange={(event) => setComparisonCandidate(event.target.value)}><option value="">Selecionar estado</option>{BRAZILIAN_STATES.filter((state) => state.code !== selectedState && !comparisonCodes.includes(state.code)).map((state) => <option value={state.code} key={state.code}>{state.name} ({state.abbreviation})</option>)}</select><button className="button button-light" onClick={addComparison} disabled={!comparisonCandidate || comparisonCodes.length >= 2}><Plus size={15}/> Adicionar</button></div>
        <div className="comparison-chips">{chartCodes.map((code, index) => { const state = STATE_BY_CODE.get(code)!; return <span key={code} style={{ borderColor: LINE_COLORS[index] }}><i style={{ background: LINE_COLORS[index] }}/>{state.abbreviation}{code !== selectedState && <button onClick={() => setComparisonCodes((items) => items.filter((item) => item !== code))} aria-label={`Remover ${state.name}`}><X size={12}/></button>}</span>; })}</div>
        <div id="state-chart" className="comparison-chart">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 12, right: 14, left: -18, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#edf0f5"/><XAxis dataKey="period" tick={{ fontSize: 10, fill: "#778398" }} minTickGap={24}/><YAxis tick={{ fontSize: 10, fill: "#778398" }} width={42}/><Tooltip/><Line type="monotone" dataKey={selectedState} name={selected.abbreviation} stroke={LINE_COLORS[0]} strokeWidth={2.5} dot={false} connectNulls={false}/>{comparisonCodes.map((code, index) => <Line key={code} type="monotone" dataKey={code} name={STATE_BY_CODE.get(code)?.abbreviation ?? code} stroke={LINE_COLORS[index + 1]} strokeWidth={2.5} dot={false} connectNulls={false}/> )}</LineChart></ResponsiveContainer> : <div className="empty">Selecione um estado com observações para visualizar a série histórica.</div>}</div>
        <button className="button button-light export-chart-button" onClick={exportChart} disabled={!chartData.length}><Download size={15}/> Exportar gráfico PNG</button>
      </section>
    </div>

    <section className="map-data-note"><Info size={16}/><div><b>Sobre os dados e a cobertura territorial</b><p>{indicator?.methodology ?? "O mapa utiliza a malha territorial oficial do IBGE. Os valores são apresentados somente quando há observações estaduais importadas."} {indicator?.externalCode ? `Identificador: ${indicator.externalCode}.` : ""}</p><small>As áreas sem valor não são estimadas nem preenchidas artificialmente. Consulte sempre a fonte e o período antes de comparar estados.</small></div></section>
  </div>;
}
