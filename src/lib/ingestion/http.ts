export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "ObservatorioDados/1.0 (public-data-ingestion)" },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`HTTP ${response.status} em ${url}: ${body}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json") && !contentType.includes("javascript")) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`Resposta não JSON em ${url}: ${body}`);
  }
  return response.json() as Promise<T>;
}

export function parseBrazilianNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s/g, "");
  if (!cleaned || cleaned === "..." || cleaned === "-" || cleaned === "X") return null;
  // APIs do BCB usam ponto decimal; SIDRA/IPEA podem usar vírgula decimal.
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function bcbDateToIso(date: string): string {
  const [day, month, year] = date.split("/");
  if (!day || !month || !year) throw new Error(`Data do BCB inválida: ${date}`);
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function sidraPeriodToIso(period: string): string | null {
  const value = period.trim();
  const numeric = value.match(/^(\d{4})(\d{2})$/);
  if (numeric) return `${numeric[1]}-${numeric[2]}`;
  const yearOnly = value.match(/^(\d{4})$/);
  if (yearOnly) return yearOnly[1];
  const monthNames: Record<string, string> = {
    janeiro: "01", jan: "01", fevereiro: "02", fev: "02", março: "03", marco: "03", mar: "03",
    abril: "04", abr: "04", maio: "05", mai: "05", junho: "06", jun: "06", julho: "07", jul: "07",
    agosto: "08", ago: "08", setembro: "09", set: "09", outubro: "10", out: "10",
    novembro: "11", nov: "11", dezembro: "12", dez: "12",
  };
  const match = value.toLocaleLowerCase("pt-BR").match(/(\d{4}).*?([a-zç]+)/i)
    ?? value.toLocaleLowerCase("pt-BR").match(/([a-zç]+).*?(\d{4})/i);
  if (!match) return null;
  const year = match[1].length === 4 ? match[1] : match[2];
  const monthText = match[1].length === 4 ? match[2] : match[1];
  const month = monthNames[monthText];
  return month ? `${year}-${month}` : null;
}
