"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Save, Trash2, Info, SlidersHorizontal, Layers3 } from "lucide-react";
import { BRAZILIAN_STATES, STATE_BY_CODE } from "@/lib/geography";

type Indicator = {
  id: string; slug: string; name: string; unit: string; periodicity: string;
  methodology: string | null; externalCode: string | null;
  category: { name: string; slug: string }; source: { name: string; url: string };
};
type Observation = { indicatorId: string; region: string; geographyCode: string | null; geographyLevel: string | null; period: string; value: number };
type GeoFeature = { type: "Feature"; id?: string | number; properties?: Record<string, string | number | undefined>; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any } };
type GeoCollection = { type: "FeatureCollection"; features: GeoFeature[] };
type Config = { slug: string; weight: number; direction: "higher" | "lower" };
type SavedIndex = { name: string; configs: Config[] };
function yearOf(period: string) { return period.match(/20\d{2}/)?.[0] ?? period; }
type StateResult = (typeof BRAZILIAN_STATES)[number] & { score: number | null; values: Record<string, number | null>; rank: number | null };

const PALETTE = ["#f1f5f9", "#dbeafe", "#93c5fd", "#60a5fa", "#2563eb", "#1e3a8a"];
const PRESETS = [
  { name: "Desenvolvimento equilibrado", terms: ["renda", "educa", "saúde", "saneamento"], directions: ["higher", "higher", "higher", "higher"] as const },
  { name: "Mercado de trabalho", terms: ["desocupa", "desemprego", "ocupação", "rendimento"], directions: ["lower", "lower", "higher", "higher"] as const },
  { name: "Condições econômicas", terms: ["pib per capita", "renda", "pobreza", "desemprego"], directions: ["higher", "higher", "lower", "lower"] as const },
];

function norm(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function codeFor(item: Observation) {
  if (item.geographyCode) {
    const raw = item.geographyCode.padStart(2, "0");
    const code = raw.length === 7 ? raw.slice(0, 2) : raw;
    if (STATE_BY_CODE.has(code)) return code;
  }
  return BRAZILIAN_STATES.find((state) => norm(state.name) === norm(item.region))?.code ?? null;
}
function positions(value: any, output: number[][]) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") { output.push(value as number[]); return; }
  value.forEach((child) => positions(child, output));
}
function pathFor(feature: GeoFeature, project: (point: number[]) => [number, number]) {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return polygons.map((polygon: number[][][]) => polygon.map((ring) => ring.map((point, index) => {
    const [x, y] = project(point); return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ") + " Z").join(" ")).join(" ");
}
function periodLabel(period: string) {
  const q = period.match(/^(\d{4})-T([1-4])$/); if (q) return `${q[2]}º tri/${q[1]}`;
  const m = period.match(/^(\d{4})-(\d{2})$/); if (m) return `${m[2]}/${m[1]}`;
  return period;
}
function fmt(value: number | null) { return value === null ? "Sem dado" : `${value.toFixed(1).replace(".", ",")}/100`; }

export function CompositeIndexExplorer() {
  const [catalog, setCatalog] = useState<Indicator[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [period, setPeriod] = useState("");
  const [geo, setGeo] = useState<GeoCollection | null>(null);
  const [selectedState, setSelectedState] = useState("23");
  const [saved, setSaved] = useState<SavedIndex[]>([]);
  const [indexName, setIndexName] = useState("Meu índice personalizado");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMethodology, setShowMethodology] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/map/multi").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha ao carregar indicadores."); return j; }),
      fetch("/api/geography/states").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha ao carregar mapa."); return j as GeoCollection; }),
    ]).then(([data, geometry]) => {
      if (!active) return;
      setCatalog(data.indicators ?? []); setGeo(geometry);
      const first = (data.indicators ?? [])[0];
      if (first) setConfigs([{ slug: first.slug, weight: 100, direction: "higher" }]);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao carregar o índice."); })
      .finally(() => { if (active) setLoading(false); });
    try { const raw = localStorage.getItem("observatorio-composite-indexes-v1"); if (raw) setSaved(JSON.parse(raw)); } catch { /* armazenamento opcional */ }
    return () => { active = false; };
  }, []);

  const queryKey = configs.map((item) => item.slug).sort().join(",");
  useEffect(() => {
    if (!queryKey) { setObservations([]); return; }
    let active = true;
    fetch(`/api/map/multi?indicators=${encodeURIComponent(queryKey)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha ao consultar indicadores."); return j; })
      .then((data) => { if (active) setObservations(data.observations ?? []); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao consultar os dados."); });
    return () => { active = false; };
  }, [queryKey]);

  const selectedIndicators = useMemo(() => configs.map((config) => ({ config, indicator: catalog.find((item) => item.slug === config.slug) })).filter((item): item is { config: Config; indicator: Indicator } => Boolean(item.indicator)), [catalog, configs]);
  const periods = useMemo(() => {
    if (!configs.length) return [];
    const yearsByIndicator = configs.map((config) => new Set(observations.filter((item) => item.indicatorId === catalog.find((indicator) => indicator.slug === config.slug)?.id).map((item) => yearOf(item.period))));
    if (yearsByIndicator.some((set) => set.size === 0)) return [];
    return [...yearsByIndicator[0]].filter((year) => yearsByIndicator.every((set) => set.has(year))).sort();
  }, [observations, configs, catalog]);
  useEffect(() => { if (periods.length && !periods.includes(period)) setPeriod(periods[periods.length - 1]); }, [periods, period]);

  const observationsMap = useMemo(() => {
    const map = new Map<string, { period: string; value: number }>();
    observations.slice().sort((a, b) => a.period.localeCompare(b.period)).forEach((item) => {
      const code = codeFor(item); if (!code) return;
      const key = `${item.indicatorId}|${code}|${yearOf(item.period)}`;
      const current = map.get(key);
      if (!current || item.period >= current.period) map.set(key, { period: item.period, value: item.value });
    });
    const values = new Map<string, number>();
    map.forEach((item, key) => values.set(key, item.value));
    return values;
  }, [observations]);

  const results = useMemo(() => {
    const raw = BRAZILIAN_STATES.map((state) => {
      const values: Record<string, number | null> = {};
      selectedIndicators.forEach(({ indicator }) => { values[indicator.slug] = observationsMap.get(`${indicator.id}|${state.code}|${period}`) ?? null; });
      return { ...state, values, score: null as number | null, rank: null as number | null };
    });
    const normalized = new Map<string, Map<string, number>>();
    selectedIndicators.forEach(({ config, indicator }) => {
      const available = raw.map((row) => row.values[indicator.slug]).filter((value): value is number => value !== null && Number.isFinite(value));
      if (!available.length) { normalized.set(indicator.slug, new Map()); return; }
      const min = Math.min(...available), max = Math.max(...available);
      const values = new Map<string, number>();
      raw.forEach((row) => {
        const value = row.values[indicator.slug]; if (value === null) return;
        const score = max === min ? 50 : ((value - min) / (max - min)) * 100;
        values.set(row.code, config.direction === "higher" ? score : 100 - score);
      });
      normalized.set(indicator.slug, values);
    });
    const totalWeight = selectedIndicators.reduce((sum, item) => sum + item.config.weight, 0);
    raw.forEach((row) => {
      // Índice estrito: só calcula quando todos os indicadores escolhidos possuem dado para a UF.
      if (!selectedIndicators.length || selectedIndicators.some(({ indicator }) => !normalized.get(indicator.slug)?.has(row.code)) || totalWeight <= 0) return;
      const score = selectedIndicators.reduce((sum, { config, indicator }) => sum + (normalized.get(indicator.slug)!.get(row.code)! * config.weight), 0) / totalWeight;
      row.score = score;
    });
    raw.filter((row) => row.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).forEach((row, index) => { const target = raw.find((item) => item.code === row.code); if (target) target.rank = index + 1; });
    return raw;
  }, [selectedIndicators, observationsMap, period]);

  const ranked = useMemo(() => [...results].sort((a, b) => {
    if (a.score === null) return 1; if (b.score === null) return -1; return b.score - a.score;
  }), [results]);
  const selected = results.find((row) => row.code === selectedState) ?? results[0];
  const availableCount = results.filter((row) => row.score !== null).length;
  const weightTotal = configs.reduce((sum, item) => sum + item.weight, 0);
  const projection = useMemo(() => {
    const points: number[][] = []; geo?.features.forEach((feature) => positions(feature.geometry.coordinates, points));
    if (!points.length) return null;
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = 680, height = 620, padding = 18;
    const scale = Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxY - minY));
    const ox = (width - (maxX - minX) * scale) / 2, oy = (height - (maxY - minY) * scale) / 2;
    return (point: number[]): [number, number] => [ox + (point[0] - minX) * scale, height - oy - (point[1] - minY) * scale];
  }, [geo]);
  const scoreRange = useMemo(() => { const values = results.flatMap((row) => row.score === null ? [] : [row.score]); return values.length ? [Math.min(...values), Math.max(...values)] as const : null; }, [results]);
  const color = (value: number | null) => {
    if (value === null || !scoreRange) return "#e8edf4";
    const bucket = scoreRange[0] === scoreRange[1] ? 3 : Math.min(5, Math.floor(((value - scoreRange[0]) / (scoreRange[1] - scoreRange[0])) * 6));
    return PALETTE[bucket];
  };

  function updateConfig(slug: string, patch: Partial<Config>) { setConfigs((items) => items.map((item) => item.slug === slug ? { ...item, ...patch } : item)); }
  function addIndicator(slug: string) {
    if (!slug || configs.some((item) => item.slug === slug) || configs.length >= 8) return;
    setConfigs((items) => [...items, { slug, weight: 0, direction: "higher" }]);
  }
  function applyPreset(index: number) {
    const preset = PRESETS[index];
    const matches = preset.terms.map((term, i) => {
      const indicator = catalog.find((item) => norm(`${item.name} ${item.category.name}`).includes(norm(term)));
      return indicator ? { slug: indicator.slug, weight: [30, 25, 25, 20][i], direction: preset.directions[i] } as Config : null;
    }).filter((item): item is Config => Boolean(item));
    if (matches.length) setConfigs(matches);
  }
  function saveIndex() {
    if (!configs.length || weightTotal <= 0) return;
    const next = [...saved.filter((item) => item.name !== indexName.trim()), { name: indexName.trim() || "Índice personalizado", configs: configs.map((item) => ({ ...item })) }];
    setSaved(next); localStorage.setItem("observatorio-composite-indexes-v1", JSON.stringify(next));
  }
  function loadIndex(name: string) { const item = saved.find((entry) => entry.name === name); if (item) { setIndexName(item.name); setConfigs(item.configs); } }
  function deleteIndex(name: string) { const next = saved.filter((item) => item.name !== name); setSaved(next); localStorage.setItem("observatorio-composite-indexes-v1", JSON.stringify(next)); }
  function exportCsv() {
    const rows = [["codigo_uf", "estado", "regiao", "periodo", "indice_0_100", "posicao", ...selectedIndicators.map(({ indicator }) => indicator.name)]];
    ranked.forEach((row) => rows.push([row.code, row.name, row.region, period, row.score?.toFixed(2) ?? "", row.rank?.toString() ?? "", ...selectedIndicators.map(({ indicator }) => row.values[indicator.slug]?.toString() ?? "")]));
    const csv = rows.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `indice-personalizado-${period || "sem-periodo"}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <section className="panel composite-index-panel" style={{ marginTop: 28, padding: 24, border: "1px solid #cbd8eb" }}>
    <div className="panel-heading" style={{ alignItems: "flex-start" }}><div><span className="eyebrow"><Layers3 size={13} style={{ display: "inline", verticalAlign: "-2px" }}/> Análise multidimensional</span><h2>Construa seu próprio índice</h2><p>Combine indicadores, atribua pesos e compare o desempenho relativo das Unidades da Federação.</p></div><button className="button button-light" onClick={() => setShowMethodology((value) => !value)}><Info size={15}/> Metodologia</button></div>
    {error && <div className="notice">{error}</div>}
    <div className="map-toolbar" style={{ margin: "18px 0", alignItems: "end" }}>
      <label style={{ flex: 1, minWidth: 220 }}><span>Índices de referência</span><select defaultValue="" onChange={(event) => { if (event.target.value) applyPreset(Number(event.target.value)); event.target.value = ""; }}><option value="">Escolha um modelo para preencher</option>{PRESETS.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select></label>
      <label style={{ flex: 1, minWidth: 220 }}><span>Período de análise</span><select value={period} onChange={(event) => setPeriod(event.target.value)} disabled={!periods.length}><option value="">Sem período disponível</option>{periods.map((item) => <option key={item} value={item}>{periodLabel(item)}</option>)}</select></label>
      <button className="button button-light" onClick={exportCsv} disabled={!availableCount}><Download size={15}/> Exportar CSV</button>
    </div>

    <div className="composite-builder" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(280px,.9fr)", gap: 20 }}>
      <div className="composite-config" style={{ minWidth: 0 }}>
        <div className="mini-section-title"><h3><SlidersHorizontal size={15} style={{ display: "inline", verticalAlign: "-2px" }}/> Indicadores e pesos</h3><span style={{ fontSize: 12, color: weightTotal === 100 ? "#15803d" : "#b45309", fontWeight: 700 }}>Peso total: {weightTotal}%</span></div>
        {selectedIndicators.map(({ config, indicator }) => <div key={config.slug} className="composite-indicator-row" style={{ display: "grid", gridTemplateColumns: "minmax(130px,1fr) 92px 130px 32px", gap: 9, alignItems: "center", padding: "12px 0", borderBottom: "1px solid #e8edf4" }}>
          <div><b style={{ display: "block", fontSize: 13 }}>{indicator.name}</b><small style={{ color: "#718096" }}>{indicator.category.name} · {indicator.unit}</small></div>
          <label style={{ display: "grid", gap: 3, fontSize: 11, color: "#64748b" }}>Peso (%)<input type="number" min="0" max="100" value={config.weight} onChange={(event) => updateConfig(config.slug, { weight: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} style={{ width: "100%", minWidth: 0, padding: "7px 6px", border: "1px solid #cbd5e1", borderRadius: 7 }}/></label>
          <label style={{ display: "grid", gap: 3, fontSize: 11, color: "#64748b" }}>O que é melhor?<select value={config.direction} onChange={(event) => updateConfig(config.slug, { direction: event.target.value as Config["direction"] })} style={{ width: "100%", minWidth: 0, padding: "7px 5px", border: "1px solid #cbd5e1", borderRadius: 7, background: "white", color: "#1e293b" }}><option value="higher">Maior valor</option><option value="lower">Menor valor</option></select></label>
          <button className="icon-button" onClick={() => setConfigs((items) => items.filter((item) => item.slug !== config.slug))} title="Remover indicador" aria-label={`Remover ${indicator.name}`}><Trash2 size={15}/></button>
        </div>)}
        <div className="comparison-controls" style={{ marginTop: 14 }}><select value="" onChange={(event) => addIndicator(event.target.value)} disabled={configs.length >= 8}><option value="">Adicionar indicador ({configs.length}/8)</option>{catalog.filter((item) => !configs.some((config) => config.slug === item.slug)).map((item) => <option key={item.slug} value={item.slug}>{item.name} — {item.unit}</option>)}</select><span style={{ fontSize: 11, color: "#64748b" }}>Até 8 indicadores por índice.</span></div>
        <div className="composite-save" style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}><input value={indexName} onChange={(event) => setIndexName(event.target.value)} aria-label="Nome do índice" placeholder="Nome do índice" style={{ flex: 1, minWidth: 160, padding: "9px 10px", border: "1px solid #cbd5e1", borderRadius: 8 }}/><button className="button button-primary" onClick={saveIndex} disabled={!configs.length || weightTotal <= 0}><Save size={15}/> Salvar combinação</button></div>
        {saved.length > 0 && <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 7 }}>{saved.map((item) => <span key={item.name} className="comparison-chip" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: 20, fontSize: 12 }}><button onClick={() => loadIndex(item.name)} style={{ background: "none", border: 0, cursor: "pointer", color: "inherit" }}>{item.name}</button><button onClick={() => deleteIndex(item.name)} aria-label={`Excluir ${item.name}`} style={{ border: 0, background: "none", cursor: "pointer", display: "inline-flex" }}><Trash2 size={12}/></button></span>)}</div>}
      </div>
      <aside className="composite-summary" style={{ background: "#f7f9fc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <span className="eyebrow">Resultado da combinação</span><div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", color: "#173b73", marginTop: 7 }}>{availableCount}<small style={{ fontSize: 13, fontWeight: 600, color: "#64748b" }}> / 27 UFs</small></div><p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 14px" }}>Estados com dados completos para todos os indicadores no período selecionado.</p>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "9px 0", borderTop: "1px solid #e2e8f0" }}><span>Indicadores combinados</span><b>{configs.length}</b></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "9px 0", borderTop: "1px solid #e2e8f0" }}><span>Período</span><b>{period ? periodLabel(period) : "—"}</b></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "9px 0", borderTop: "1px solid #e2e8f0" }}><span>Peso válido</span><b style={{ color: weightTotal === 100 ? "#15803d" : "#b45309" }}>{weightTotal === 100 ? "100%" : `${weightTotal}% (recomendado: 100%)`}</b></div>
        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#fff", color: "#64748b", fontSize: 11, lineHeight: 1.5 }}>A pontuação é relativa às UFs com dados disponíveis. Ela não representa um índice oficial nem deve ser comparada entre períodos sem considerar a mudança na distribuição dos dados.</div>
      </aside>
    </div>

    {showMethodology && <div className="map-data-note" style={{ marginTop: 16 }}><Info size={16}/><div><b>Metodologia do índice composto</b><p>Cada indicador é normalizado pelo método min–max para uma escala de 0 a 100, usando apenas os valores estaduais disponíveis no período. Para indicadores em que valores menores são desejáveis, a escala é invertida. A pontuação final é a média ponderada das pontuações normalizadas.</p><small>O cálculo é estrito: uma UF só recebe nota se tiver observação para todos os indicadores selecionados. Pesos são relativos e o sistema divide pela soma dos pesos informados; recomenda-se totalizar 100%. Indicadores correlacionados podem contar dimensões semelhantes mais de uma vez. O índice é exploratório e não substitui indicadores oficiais.</small></div></div>}

    <div className="map-main-grid" style={{ marginTop: 20 }}>
      <section className="panel map-panel"><div className="panel-heading"><div><h3>Mapa do índice composto</h3><p>{indexName} · {period ? periodLabel(period) : "período não definido"}</p></div><span className="map-status">{loading ? "Carregando" : `${availableCount} UFs com nota`}</span></div>
        {geo && projection ? <div className="map-svg-wrap"><svg id="composite-brazil-map" viewBox="0 0 680 620" role="img" aria-label="Mapa brasileiro do índice composto">{geo.features.map((feature, index) => { const raw = feature.properties?.codarea ?? feature.properties?.CD_UF ?? feature.properties?.CD_GEOCUF ?? feature.id ?? ""; const code = String(raw).padStart(2, "0").slice(-2); const state = STATE_BY_CODE.get(code); if (!state) return null; const row = results.find((item) => item.code === code); return <path key={`${code}-${index}`} d={pathFor(feature, projection)} fill={color(row?.score ?? null)} stroke={selectedState === code ? "#102a56" : "#fff"} strokeWidth={selectedState === code ? 2.8 : 1.5} className="map-state-shape" onClick={() => setSelectedState(code)} tabIndex={0} role="button" aria-label={`${state.name}: ${fmt(row?.score ?? null)}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedState(code); }}><title>{state.name} · {fmt(row?.score ?? null)}</title></path>; })}</svg><div className="map-legend"><span>Menor nota</span><div className="legend-swatches">{PALETTE.map((item) => <i key={item} style={{ background: item }}/>)}</div><span>Maior nota</span><small>Sem dado: cinza</small></div></div> : <div className="map-placeholder">{loading ? "Carregando mapa…" : "Não foi possível carregar a malha territorial."}</div>}
      </section>
      <aside className="panel state-detail-panel"><div className="panel-heading"><div><span className="eyebrow">UF selecionada</span><h2>{selected?.name ?? "—"}</h2></div><span className="state-abbr">{selected?.abbreviation}</span></div><div className="state-primary-metric"><span>Pontuação composta</span><strong>{fmt(selected?.score ?? null)}</strong><small>{selected?.rank ? `${selected.rank}º lugar entre ${availableCount} UFs` : "Dados incompletos para calcular"}</small></div><div className="state-detail-stats"><div><span>Região</span><strong>{selected?.region ?? "—"}</strong></div><div><span>Indicadores</span><strong>{configs.length}</strong></div><div><span>Período</span><strong>{period || "—"}</strong></div></div><div style={{ marginTop: 14 }}><b style={{ fontSize: 13 }}>Composição da nota</b>{selectedIndicators.map(({ config, indicator }) => <div key={config.slug} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid #edf0f5", fontSize: 12 }}><span>{indicator.name} <small style={{ color: "#64748b" }}>({config.weight}%)</small></span><b>{selected?.values[indicator.slug] === null || selected?.values[indicator.slug] === undefined ? "Sem dado" : selected.values[indicator.slug]}</b></div>)}</div></aside>
    </div>

    <section className="panel ranking-panel" style={{ marginTop: 20 }}><div className="panel-heading"><div><h3>Ranking do índice personalizado</h3><p>Ordenado da maior para a menor pontuação.</p></div><span className="map-status">{availableCount} resultados</span></div><div className="ranking-list">{ranked.map((row) => <button key={row.code} className={`ranking-row ${row.code === selectedState ? "active" : ""}`} onClick={() => setSelectedState(row.code)}><span className="ranking-position">{row.rank ?? "—"}</span><span className="ranking-name"><b>{row.abbreviation}</b><small>{row.name}</small></span><span className="ranking-value">{row.score === null ? "Sem dado" : row.score.toFixed(1).replace(".", ",")}</span><span className="ranking-bar"><i style={{ width: `${row.score ?? 0}%` }}/></span></button>)}{!availableCount && <div className="empty">{loading ? "Carregando indicadores…" : "Não há UFs com dados completos para a combinação atual. Selecione indicadores com cobertura territorial e período compatíveis."}</div>}</div></section>
    <div className="map-data-note"><Info size={16}/><div><b>Transparência e cobertura</b><p>Para cada ano selecionado, o sistema usa a observação mais recente daquele ano para cada indicador, permitindo combinar séries anuais e trimestrais sem misturar anos diferentes. Fontes, unidades e metodologias permanecem associadas a cada indicador no catálogo do Observatório. A ausência de dados não é convertida em zero, média ou estimativa.</p><small>Índices salvos ficam neste navegador. A combinação pode ser exportada em CSV para análise externa.</small></div></div>
  </section>;
}
