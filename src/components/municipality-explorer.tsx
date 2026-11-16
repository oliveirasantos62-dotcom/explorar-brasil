"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Download, MapPinned, X } from "lucide-react";
import { BRAZILIAN_STATES } from "@/lib/geography";

type Indicator = { id: string; slug: string; name: string; unit: string; periodicity: string; methodology: string | null; externalCode: string | null; source: { name: string; url: string; consultedAt: string | null } };
type Observation = { region: string; geographyCode: string | null; period: string; value: number; fetchedAt: string };
type Feature = { id?: string | number; properties?: Record<string, string | number | undefined>; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any } };
type Collection = { features: Feature[] };
type Payload = { indicators: Indicator[]; selectedIndicator: Indicator | null; observations: Observation[]; periods: string[]; error?: string };

const COLORS = ["#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"];
const LINES = ["#2457d6", "#0f9f79", "#d97706"];
const number = (value: number | null, unit: string) => value === null ? "Sem dado" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} ${unit}`;
const periodLabel = (period: string) => /^20\d{2}$/.test(period) ? period : period;

function positions(value: any, output: number[][]) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") { output.push(value); return; }
  value.forEach((item) => positions(item, output));
}
function pathFor(feature: Feature, project: (point: number[]) => [number, number]) {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return polygons.map((polygon: number[][][]) => polygon.map((ring) => ring.map((point, index) => {
    const [x, y] = project(point); return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ") + " Z").join(" ")).join(" ");
}
function exportCsv(rows: Array<{ code: string; name: string; value: number | null }>, indicator: Indicator | null, period: string, uf: string) {
  const state = BRAZILIAN_STATES.find((item) => item.code === uf);
  const data = [["codigo_ibge_municipio", "municipio", "uf", "indicador", "periodo", "valor", "unidade", "fonte"], ...rows.map((row) => [row.code, row.name, state?.abbreviation ?? uf, indicator?.name ?? "", period, row.value ?? "", indicator?.unit ?? "", indicator?.source.name ?? ""])];
  const csv = data.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `observatorio-municipios-${uf}-${period || "historico"}.csv`; anchor.click(); URL.revokeObjectURL(url);
}

export function MunicipalityExplorer({ uf, onClose }: { uf: string; onClose: () => void }) {
  const state = BRAZILIAN_STATES.find((item) => item.code === uf) ?? BRAZILIAN_STATES[0];
  const [geo, setGeo] = useState<Collection | null>(null);
  const [payload, setPayload] = useState<Payload>({ indicators: [], selectedIndicator: null, observations: [], periods: [] });
  const [indicatorSlug, setIndicatorSlug] = useState("");
  const [period, setPeriod] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [compareCodes, setCompareCodes] = useState<string[]>([]);
  const [descending, setDescending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [geoLoading, setGeoLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setGeoLoading(true);
    fetch(`/api/geography/municipalities?uf=${uf}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha ao carregar municípios."); return j as Collection; })
      .then((j) => { if (active) { setGeo(j); const first = j.features[0]; if (first) setSelectedCode(String(first.properties?.codarea ?? first.id ?? "")); } }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Falha na malha municipal."); })
      .finally(() => { if (active) setGeoLoading(false); });
    return () => { active = false; };
  }, [uf]);

  useEffect(() => {
    let active = true; setLoading(true);
    const query = new URLSearchParams({ uf }); if (indicatorSlug) query.set("indicator", indicatorSlug);
    fetch(`/api/map/municipalities?${query}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha ao consultar dados municipais."); return j as Payload; })
      .then((j) => { if (!active) return; setPayload(j); if (!indicatorSlug && j.selectedIndicator) setIndicatorSlug(j.selectedIndicator.slug); const latest = j.periods.at(-1) ?? ""; setPeriod((current) => j.periods.includes(current) ? current : latest); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Falha ao consultar dados."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uf, indicatorSlug]);

  const indicator = payload.selectedIndicator;
  const rows = useMemo(() => {
    const current = payload.observations.filter((item) => item.period === period);
    const currentByCode = new Map<string, Observation>();
    current.forEach((item) => { if (item.geographyCode) currentByCode.set(item.geographyCode, item); });
    const names = new Map<string, string>();
    geo?.features.forEach((feature) => { const code = String(feature.properties?.codarea ?? feature.id ?? ""); names.set(code, String(feature.properties?.name ?? code)); });
    const allCodes = new Set([...names.keys(), ...currentByCode.keys()]);
    return [...allCodes].map((code) => ({ code, name: names.get(code) ?? currentByCode.get(code)?.region ?? code, value: currentByCode.get(code)?.value ?? null }));
  }, [payload.observations, period, geo]);
  const ranking = useMemo(() => [...rows].sort((a, b) => {
    if (a.value === null) return 1; if (b.value === null) return -1;
    return descending ? b.value - a.value : a.value - b.value;
  }), [rows, descending]);
  const selected = rows.find((row) => row.code === selectedCode) ?? rows[0] ?? null;
  const selectedSeries = useMemo(() => payload.observations.filter((item) => item.geographyCode === selected?.code).sort((a, b) => a.period.localeCompare(b.period)), [payload.observations, selected?.code]);
  const chartCodes = useMemo(() => [...new Set([selected?.code ?? "", ...compareCodes])].filter(Boolean).slice(0, 3), [selected?.code, compareCodes]);
  const chartData = useMemo(() => {
    const periods = [...new Set(payload.observations.filter((item) => chartCodes.includes(item.geographyCode ?? "")).map((item) => item.period))].sort();
    return periods.map((p): Record<string, string | number | null> => { const row: Record<string, string | number | null> = { period: p }; chartCodes.forEach((code) => { row[code] = payload.observations.find((item) => item.geographyCode === code && item.period === p)?.value ?? null; }); return row; });
  }, [payload.observations, chartCodes]);
  const projection = useMemo(() => {
    const points: number[][] = []; geo?.features.forEach((feature) => positions(feature.geometry.coordinates, points));
    if (!points.length) return null;
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]); const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(680 / (maxX - minX), 620 / (maxY - minY)); const ox = (680 - (maxX - minX) * scale) / 2, oy = (620 - (maxY - minY) * scale) / 2;
    return (p: number[]): [number, number] => [ox + (p[0] - minX) * scale, 620 - oy - (p[1] - minY) * scale];
  }, [geo]);
  const valueRange = useMemo(() => { const values = rows.flatMap((row) => row.value === null ? [] : [row.value]); return values.length ? [Math.min(...values), Math.max(...values)] as const : null; }, [rows]);
  const color = (value: number | null) => { if (value === null || !valueRange) return "#e8edf4"; if (valueRange[0] === valueRange[1]) return COLORS[3]; return COLORS[Math.min(5, Math.floor(((value - valueRange[0]) / (valueRange[1] - valueRange[0])) * 6))]; };
  const rank = selected ? ranking.findIndex((row) => row.code === selected.code) + 1 : 0;

  return <section className="panel municipality-explorer" style={{ marginTop: 24, padding: 24, border: "1px solid #cbd8eb" }}>
    <div className="panel-heading" style={{ alignItems: "center" }}><div><span className="eyebrow">Exploração municipal · {state.abbreviation}</span><h2>Municípios de {state.name}</h2><p>Malha municipal oficial e indicadores disponíveis para comparação.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar exploração municipal"><X size={18}/></button></div>
    {error && <div className="map-inline-error">{error}</div>}
    <div className="map-toolbar" style={{ margin: "18px 0" }}>
      <label><span>Indicador municipal</span><select value={indicatorSlug} onChange={(e) => { setIndicatorSlug(e.target.value); setCompareCodes([]); }} disabled={!payload.indicators.length}><option value="">Sem indicador municipal</option>{payload.indicators.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label><span>Período</span><select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="">Último disponível</option>{payload.periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}</select></label>
      <button className="button button-light" onClick={() => exportCsv(ranking, indicator, period, uf)} disabled={!ranking.length}><Download size={15}/> Exportar CSV</button>
      <button className="button button-light" onClick={() => exportSvgPng("#municipal-map-svg", `mapa-municipios-${uf}.png`)} disabled={!geo?.features.length}><Download size={15}/> Mapa PNG</button>
      <button className="button button-light" onClick={() => exportSvgPng("#municipal-chart svg", `comparacao-municipios-${uf}.png`)} disabled={!chartData.length}><Download size={15}/> Gráfico PNG</button>
    </div>
    <div className="map-main-grid">
      <section className="panel map-panel"><div className="panel-heading"><div><h3>Mapa dos municípios</h3><p>{geo?.features.length ?? 0} geometrias · {indicator?.name ?? "Sem indicador municipal"}</p></div><span className="map-status">{geoLoading || loading ? "Carregando" : "Carregado"}</span></div>
        {geoLoading ? <div className="map-placeholder">Carregando malha municipal do IBGE…</div> : geo && projection ? <div className="map-svg-wrap"><svg id="municipal-map-svg" viewBox="0 0 680 620" role="img" aria-label={`Mapa dos municípios de ${state.name}`}>
          {geo.features.map((feature, index) => { const code = String(feature.properties?.codarea ?? feature.id ?? ""); const row = rows.find((item) => item.code === code); return <path key={`${code}-${index}`} d={pathFor(feature, projection)} fill={color(row?.value ?? null)} stroke={selectedCode === code ? "#102a56" : "#fff"} strokeWidth={selectedCode === code ? 2 : 0.7} className="map-state-shape" onClick={() => setSelectedCode(code)} tabIndex={0} role="button" aria-label={`${row?.name ?? code}: ${number(row?.value ?? null, indicator?.unit ?? "")}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedCode(code); }}><title>{row?.name ?? code} · {number(row?.value ?? null, indicator?.unit ?? "")}</title></path>; })}
        </svg><div className="map-legend"><span>Menor</span><div className="legend-swatches">{COLORS.map((c) => <i key={c} style={{ background: c }}/>)}</div><span>Maior</span><small>Sem dado: cinza</small></div></div> : <div className="map-placeholder">Não foi possível desenhar a malha municipal.</div>}
      </section>
      <aside className="panel state-detail-panel"><div className="panel-heading"><div><span className="eyebrow">Município selecionado</span><h2>{selected?.name ?? "Selecione no mapa"}</h2></div></div>
        <div className="state-primary-metric"><span>Valor no período</span><strong>{number(selected?.value ?? null, indicator?.unit ?? "")}</strong><small>{period || "Período mais recente"}</small></div>
        <div className="state-detail-stats"><div><span>Posição no ranking</span><strong>{rank || "—"}º / {rows.filter((row) => row.value !== null).length}</strong></div><div><span>Código IBGE</span><strong>{selected?.code ?? "—"}</strong></div><div><span>Histórico</span><strong>{selectedSeries.length} pontos</strong></div></div>
        <div className="state-detail-chart"><div className="mini-section-title"><h3>Evolução histórica</h3></div>{selectedSeries.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={selectedSeries.map((item) => ({ period: item.period, value: item.value }))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="period" tick={{ fontSize: 10 }}/><YAxis tick={{ fontSize: 10 }}/><Tooltip/><Line dataKey="value" name={indicator?.unit ?? "Valor"} stroke="#2457d6" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div> : <div className="empty-chart">Sem série histórica para este município.</div>}</div>
        <div className="state-source"><span>Fonte</span><strong>{indicator?.source.name ?? "—"}</strong>{indicator?.source.url && <a href={indicator.source.url} target="_blank" rel="noreferrer">Consultar fonte original ↗</a>}</div>
        <button className="button button-primary button-full" disabled={!selected || (!compareCodes.includes(selected.code) && compareCodes.length >= 2)} onClick={() => setCompareCodes((list) => list.includes(selected!.code) ? list.filter((code) => code !== selected!.code) : [...list, selected!.code])}>{selected && compareCodes.includes(selected.code) ? "Remover da comparação" : "Adicionar à comparação"}</button>
      </aside>
    </div>
    <div className="map-lower-grid"><section className="panel ranking-panel"><div className="panel-heading"><div><h3>Ranking dos municípios</h3><p>{period || "Período mais recente"}</p></div><button className="icon-button" onClick={() => setDescending((value) => !value)} title="Alterar ordenação">{descending ? <ArrowDownWideNarrow size={17}/> : <ArrowUpWideNarrow size={17}/>}</button></div>
      <div className="ranking-list">{ranking.map((row, index) => <button key={row.code} className={`ranking-row ${row.code === selected?.code ? "active" : ""}`} onClick={() => setSelectedCode(row.code)}><span className="ranking-position">{row.value === null ? "—" : index + 1}</span><span className="ranking-name"><b>{row.name}</b><small>{row.code}</small></span><span className="ranking-value">{row.value === null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(row.value)}</span></button>)}{!ranking.length && <div className="empty">Sem malha ou observações municipais disponíveis.</div>}</div>
    </section><section className="panel comparison-panel"><div className="panel-heading"><div><h3>Comparação municipal</h3><p>Até três municípios do mesmo estado.</p></div></div>
      <div className="comparison-chips">{chartCodes.map((code, index) => <span key={code} style={{ borderColor: LINES[index] }}><i style={{ background: LINES[index] }}/>{rows.find((row) => row.code === code)?.name ?? code}{code !== selected?.code && <button onClick={() => setCompareCodes((list) => list.filter((item) => item !== code))}><X size={12}/></button>}</span>)}</div>
      <div id="municipal-chart" className="comparison-chart">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="period" tick={{ fontSize: 10 }}/><YAxis tick={{ fontSize: 10 }}/><Tooltip/>{chartCodes.map((code, index) => <Line key={code} dataKey={code} name={rows.find((row) => row.code === code)?.name ?? code} stroke={LINES[index]} strokeWidth={2.5} dot={false}/> )}</LineChart></ResponsiveContainer> : <div className="empty">Selecione municípios com histórico para comparar.</div>}</div>
    </section></div>
    <div className="map-data-note"><MapPinned size={16}/><div><b>Limites e cobertura dos dados</b><p>{indicator?.methodology ?? "A malha é disponibilizada pelo IBGE. Os indicadores municipais são exibidos apenas quando a fonte publica dados nesse nível territorial."}</p><small>Não são estimados valores municipais a partir de médias estaduais ou nacionais. Municípios sem observação permanecem sem dado.</small></div></div>
  </section>;
}
