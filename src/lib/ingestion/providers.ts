import { fetchJson, parseBrazilianNumber, bcbDateToIso, sidraPeriodToIso } from "./http";
import type { ImportTarget, NormalizedObservation } from "./types";

type BcbRow = { data: string; valor: string };
type SidraRow = Record<string, string>;
type ODataResponse<T> = { value?: T[]; "@odata.context"?: string; "@odata.nextLink"?: string };
type IpeaValue = { VALDATA?: string; VALVALOR?: number | string; NIVNOME?: string; TERCODIGO?: string };

const UF_CODES: Record<string, string> = {
  "11": "Rondônia", "12": "Acre", "13": "Amazonas", "14": "Roraima", "15": "Pará", "16": "Amapá", "17": "Tocantins",
  "21": "Maranhão", "22": "Piauí", "23": "Ceará", "24": "Rio Grande do Norte", "25": "Paraíba", "26": "Pernambuco",
  "27": "Alagoas", "28": "Sergipe", "29": "Bahia", "31": "Minas Gerais", "32": "Espírito Santo", "33": "Rio de Janeiro",
  "35": "São Paulo", "41": "Paraná", "42": "Santa Catarina", "43": "Rio Grande do Sul", "50": "Mato Grosso do Sul",
  "51": "Mato Grosso", "52": "Goiás", "53": "Distrito Federal",
};

function normalizeSidraUnemploymentPeriod(label: string | undefined, code: string | undefined): string | null {
  const text = String(label ?? "").trim();
  const quarter = text.match(/([1-4])\s*[ºª°]?\s*trimestre.*?(20\d{2})/i);
  if (quarter) return `${quarter[2]}-T${quarter[1]}`;
  const month = text.match(/(20\d{2})[\s/.-]*(0?[1-9]|1[0-2])/);
  if (month) return `${month[1]}-${String(Number(month[2])).padStart(2, "0")}`;
  const raw = String(code ?? "").trim();
  // SIDRA codifica trimestres como AAAATT (ex.: 201201 = 1º trimestre de 2012).
  const quarterlyCode = raw.match(/^(20\d{2})0([1-4])$/);
  if (quarterlyCode) return `${quarterlyCode[1]}-T${quarterlyCode[2]}`;
  // Mantém suporte a códigos mensais caso a fonte altere a periodicidade.
  const monthlyCode = raw.match(/^(20\d{2})(0[1-9]|1[0-2])$/);
  if (monthlyCode) return `${monthlyCode[1]}-${monthlyCode[2]}`;
  return null;
}

async function fetchIbgeMunicipalPopulation(): Promise<NormalizedObservation[]> {
  // SIDRA 6579 / variável 9324: estimativas anuais de população residente por município.
  // O recorte dos últimos dez períodos limita o volume e mantém histórico comparável.
  const url = "https://apisidra.ibge.gov.br/values/t/6579/n6/all/v/9324/p/last%2010";
  const rows = await fetchJson<SidraRow[]>(url);
  if (!Array.isArray(rows) || rows.length < 2) throw new Error("SIDRA não retornou estimativas municipais de população.");
  return rows.slice(1).flatMap((row) => {
    const entries = Object.entries(row);
    const geographyEntry = entries.find(([key, value]) => /C$/.test(key) && /^\d{7}$/.test(String(value ?? "")));
    const geographyNameKey = geographyEntry ? geographyEntry[0].replace(/C$/, "N") : "";
    const periodEntry = entries.find(([key, value]) => /C$/.test(key) && /^20\d{2}$/.test(String(value ?? "")));
    const code = geographyEntry ? String(geographyEntry[1]) : "";
    const name = geographyNameKey ? String(row[geographyNameKey] ?? code) : code;
    const period = periodEntry ? String(periodEntry[1]) : "";
    const value = parseBrazilianNumber(row.V ?? row.VALOR);
    if (!/^\d{7}$/.test(code) || !/^20\d{2}$/.test(period) || value === null) return [];
    return [{ region: name, period, value, geographyCode: code, geographyLevel: "Municipio" }];
  });
}


async function fetchIbgeStatePopulation(): Promise<NormalizedObservation[]> {
  // SIDRA 6579 / variável 9324: estimativas anuais de população por UF (N3).
  const rows = await fetchJson<SidraRow[]>("https://apisidra.ibge.gov.br/values/t/6579/n3/all/v/9324/p/last%2010");
  if (!Array.isArray(rows) || rows.length < 2) throw new Error("SIDRA não retornou estimativas estaduais de população.");
  return rows.slice(1).flatMap((row) => {
    const code = String(row.D1C ?? "").padStart(2, "0");
    const region = String(row.D1N ?? UF_CODES[code] ?? "");
    const period = String(row.D3C ?? row.D3N ?? "").match(/20\d{2}/)?.[0] ?? "";
    const value = parseBrazilianNumber(row.V ?? row.VALOR);
    if (!UF_CODES[code] || !/^20\d{2}$/.test(period) || value === null) return [];
    return [{ region: UF_CODES[code], period, value, geographyCode: code, geographyLevel: "UF" }];
  });
}

async function fetchIbgeGdpPerCapitaByUf(): Promise<NormalizedObservation[]> {
  // SIDRA 5964 / variável 38: PIB per capita anual, nível territorial N3.
  const rows = await fetchJson<SidraRow[]>("https://apisidra.ibge.gov.br/values/t/5964/n3/all/v/38/p/last%2010");
  if (!Array.isArray(rows) || rows.length < 2) throw new Error("SIDRA não retornou PIB per capita por UF.");
  return rows.slice(1).flatMap((row) => {
    const code = String(row.D1C ?? "").padStart(2, "0");
    const period = String(row.D3C ?? row.D3N ?? "").match(/20\d{2}/)?.[0] ?? "";
    const value = parseBrazilianNumber(row.V ?? row.VALOR);
    if (!UF_CODES[code] || !/^20\d{2}$/.test(period) || value === null) return [];
    return [{ region: UF_CODES[code], period, value, geographyCode: code, geographyLevel: "UF" }];
  });
}

async function fetchIbgeUnemploymentByUf(): Promise<NormalizedObservation[]> {
  // SIDRA 4099 / variável 4099: taxa de desocupação da PNAD Contínua por UF.
  // A variável 4103 é o coeficiente de variação da taxa, não a taxa em si.
  const url = "https://apisidra.ibge.gov.br/values/t/4099/n3/all/v/4099/p/all";
  const rows = await fetchJson<SidraRow[]>(url);
  if (!Array.isArray(rows) || rows.length < 2) throw new Error("SIDRA não retornou a taxa de desocupação por UF.");
  return rows.slice(1).flatMap((row) => {
    const codeKey = Object.keys(row).find((key) => /^D1C$/.test(key));
    const nameKey = Object.keys(row).find((key) => /^D1N$/.test(key));
    const periodCodeKey = Object.keys(row).find((key) => /^D3C$/.test(key));
    const periodNameKey = Object.keys(row).find((key) => /^D3N$/.test(key));
    const rawCode = String(codeKey ? row[codeKey] ?? "" : "").padStart(2, "0");
    const region = UF_CODES[rawCode] ?? (nameKey ? row[nameKey] : undefined);
    const period = normalizeSidraUnemploymentPeriod(periodNameKey ? row[periodNameKey] : undefined, periodCodeKey ? row[periodCodeKey] : undefined);
    const value = parseBrazilianNumber(row.V ?? row.VALOR);
    if (!region || !period || value === null || !UF_CODES[rawCode]) return [];
    return [{ region, period, value, geographyCode: rawCode, geographyLevel: "UF" }];
  });
}

async function fetchBcbSeries(code: string): Promise<NormalizedObservation[]> {
  // O SGS limita consultas de séries diárias a janelas de até 10 anos; sempre envie o intervalo.
  const end = new Date();
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 10);
  const toBrazilianDate = (date: Date) => `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
  const params = new URLSearchParams({ formato: "json", dataInicial: toBrazilianDate(start), dataFinal: toBrazilianDate(end) });
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${encodeURIComponent(code)}/dados?${params.toString()}`;
  const rows = await fetchJson<BcbRow[]>(url);
  if (!Array.isArray(rows)) throw new Error("Formato inesperado na resposta do SGS/BCB.");
  return rows.flatMap((row) => {
    const value = parseBrazilianNumber(row.valor);
    if (value === null) return [];
    return [{ region: "Brasil", period: bcbDateToIso(row.data), value }];
  });
}

async function fetchIbgeIpca(): Promise<NormalizedObservation[]> {
  // SIDRA: tabela 1737 (IPCA - série histórica), variável 63 (variação mensal).
  // A tabela/variável são explícitas para facilitar auditoria e alteração futura.
  const url = "https://apisidra.ibge.gov.br/values/t/1737/n1/1/v/63/p/last%20120";
  const rows = await fetchJson<SidraRow[]>(url);
  if (!Array.isArray(rows) || rows.length < 2) throw new Error("SIDRA não retornou observações para o IPCA.");
  const dataRows = rows.slice(1);
  return dataRows.flatMap((row) => {
    const periodRaw = Object.entries(row).find(([key, value]) => /^D\d+C$/.test(key) && /\d{4}/.test(String(value)))?.[1];
    const valueRaw = row.V ?? row.VALOR;
    const period = periodRaw ? sidraPeriodToIso(String(periodRaw)) : null;
    const value = parseBrazilianNumber(valueRaw);
    if (!period || value === null) return [];
    return [{ region: "Brasil", period, value }];
  });
}

async function fetchIpeaSeries(code: string): Promise<NormalizedObservation[]> {
  const safeCode = encodeURIComponent(code.replace(/'/g, "''"));
  const url = `https://www.ipeadata.gov.br/api/odata4/Metadados('${safeCode}')/Valores`;
  const rows: IpeaValue[] = [];
  let nextUrl: string | undefined = url;
  // OData pode paginar séries longas; percorremos todas as páginas para não truncar o histórico.
  while (nextUrl) {
    const response: ODataResponse<IpeaValue> | IpeaValue[] = await fetchJson<ODataResponse<IpeaValue> | IpeaValue[]>(nextUrl);
    if (Array.isArray(response)) {
      rows.push(...response);
      nextUrl = undefined;
    } else {
      rows.push(...(response.value ?? []));
      nextUrl = response["@odata.nextLink"];
    }
  }
  if (!rows.length) throw new Error(`IPEAData não retornou valores para a série ${code}.`);
  return rows.flatMap((row) => {
    if (!row.VALDATA) return [];
    // Este MVP aceita séries nacionais. Séries por estado/município precisam de um mapeamento territorial explícito.
    if (row.NIVNOME && !["Brasil", "País", "Pais"].includes(row.NIVNOME)) return [];
    const date = new Date(row.VALDATA);
    if (Number.isNaN(date.getTime())) return [];
    const value = parseBrazilianNumber(row.VALVALOR);
    if (value === null) return [];
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = date.getUTCDate();
    const period = day === 1 ? `${year}-${month}` : `${year}-${month}-${String(day).padStart(2, "0")}`;
    return [{ region: "Brasil", period, value }];
  });
}

const bcbBase = {
  sourceName: "Banco Central — SGS",
  sourceInstitution: "Banco Central do Brasil",
  sourceUrl: "https://api.bcb.gov.br/",
  categorySlug: "economia",
};
const ibgeBase = {
  sourceName: "IBGE — SIDRA",
  sourceInstitution: "Instituto Brasileiro de Geografia e Estatística",
  sourceUrl: "https://sidra.ibge.gov.br/",
  categorySlug: "economia",
};

export function getImportTargets(): ImportTarget[] {
  const targets: ImportTarget[] = [
    {
      ...bcbBase,
      slug: "selic-meta",
      name: "Taxa Selic — anualizada",
      description: "Taxa Selic anualizada, série diária do Sistema Gerenciador de Séries Temporais do Banco Central.",
      unit: "% ao ano",
      periodicity: "Diária",
      methodology: "Série SGS 432 do Banco Central. O valor representa a taxa anualizada divulgada na data da observação.",
      externalCode: "SGS 432",
      fetch: () => fetchBcbSeries("432"),
    },
    {
      ...bcbBase,
      slug: "ipca-bcb",
      name: "IPCA — variação mensal (BCB/SGS)",
      description: "Variação mensal do IPCA, reproduzida na série temporal do Banco Central a partir dos dados do índice oficial.",
      unit: "% no mês",
      periodicity: "Mensal",
      methodology: "Série SGS 433 do Banco Central. Para publicações, confira a metodologia e a divulgação original do IBGE.",
      externalCode: "SGS 433",
      fetch: () => fetchBcbSeries("433"),
    },
    {
      ...ibgeBase,
      slug: "ipca",
      name: "IPCA — variação mensal",
      description: "Índice Nacional de Preços ao Consumidor Amplo: variação mensal publicada pelo IBGE.",
      unit: "% no mês",
      periodicity: "Mensal",
      methodology: "SIDRA tabela 1737, variável 63 (variação mensal), Brasil. A série é importada diretamente da API do IBGE.",
      externalCode: "SIDRA 1737 / variável 63",
      fetch: fetchIbgeIpca,
    },
    {
      ...ibgeBase,
      categorySlug: "economia",
      slug: "populacao-estimada-municipios",
      name: "População estimada por município",
      description: "Estimativa anual da população residente nos municípios brasileiros, divulgada pelo IBGE.",
      unit: "habitantes",
      periodicity: "Anual",
      methodology: "IBGE/SIDRA, tabela 6579, variável 9324, nível territorial N6 (município). São importados os dez períodos mais recentes disponíveis. A cobertura temporal pode variar conforme a disponibilidade oficial da tabela.",
      externalCode: "SIDRA 6579 / variável 9324",
      geographyLevel: "Municipio",
      fetch: fetchIbgeMunicipalPopulation,
    },
    {
      ...ibgeBase,
      categorySlug: "demografia",
      slug: "populacao-estimada-uf",
      name: "População estimada por Unidade da Federação",
      description: "Estimativa anual da população residente em cada estado e no Distrito Federal.",
      unit: "habitantes",
      periodicity: "Anual",
      methodology: "IBGE/SIDRA, tabela 6579, variável 9324, nível territorial N3 (UF). Série anual com os dez períodos mais recentes disponíveis. População absoluta mede tamanho populacional, não qualidade de vida ou desenvolvimento por si só.",
      externalCode: "SIDRA 6579 / variável 9324 / N3",
      geographyLevel: "UF",
      fetch: fetchIbgeStatePopulation,
    },
    {
      ...ibgeBase,
      categorySlug: "economia",
      slug: "pib-per-capita-uf",
      name: "PIB per capita por Unidade da Federação",
      description: "Produto Interno Bruto por habitante, calculado e divulgado pelo IBGE para estados e Distrito Federal.",
      unit: "R$ por habitante",
      periodicity: "Anual",
      methodology: "IBGE/SIDRA, tabela 5964, variável 38, nível territorial N3 (UF). Indicador econômico médio por habitante; não equivale à renda efetivamente recebida pelas pessoas nem mede distribuição de renda.",
      externalCode: "SIDRA 5964 / variável 38 / N3",
      geographyLevel: "UF",
      fetch: fetchIbgeGdpPerCapitaByUf,
    },
    {
      ...ibgeBase,
      categorySlug: "trabalho-renda",
      slug: "taxa-desocupacao-uf",
      name: "Taxa de desocupação por Unidade da Federação",
      description: "Percentual de pessoas desocupadas na força de trabalho, segundo a PNAD Contínua, por estado e Distrito Federal.",
      unit: "%",
      periodicity: "Trimestral",
      methodology: "IBGE/SIDRA, tabela 4099, variável 4099 (taxa de desocupação; a variável 4103 corresponde ao coeficiente de variação). A série é consultada por Unidade da Federação (nível territorial 3), com todo o histórico disponível. A periodicidade é trimestral; confira o período de referência e a metodologia da PNAD Contínua antes de comparar valores.",
      externalCode: "SIDRA 4099 / variável 4099",
      geographyLevel: "UF",
      fetch: fetchIbgeUnemploymentByUf,
    },
  ];

  const ipeaCode = process.env.IPEADATA_SERIES_CODE?.trim() || "PNADC12_TDESOC12";
  if (ipeaCode) {
    targets.push({
      sourceName: "IPEAData",
      sourceInstitution: "Instituto de Pesquisa Econômica Aplicada",
      sourceUrl: "https://ipeadata.gov.br/api/",
      categorySlug: "trabalho-renda",
      slug: process.env.IPEADATA_INDICATOR_SLUG?.trim() || "taxa-desocupacao",
      name: process.env.IPEADATA_INDICATOR_NAME?.trim() || "Taxa de desocupação",
      description: "Percentual de pessoas de 14 anos ou mais desocupadas em relação à força de trabalho, conforme PNAD Contínua mensal.",
      unit: process.env.IPEADATA_INDICATOR_UNIT?.trim() || "%",
      periodicity: process.env.IPEADATA_INDICATOR_PERIODICITY?.trim() || "Mensal",
      methodology: `Série IPEAData ${ipeaCode}, originada da PNAD Contínua/IBGE. Verifique a nota metodológica e a cobertura territorial nos metadados da fonte.`,
      externalCode: ipeaCode,
      fetch: () => fetchIpeaSeries(ipeaCode),
    });
  }
  return targets;
}
