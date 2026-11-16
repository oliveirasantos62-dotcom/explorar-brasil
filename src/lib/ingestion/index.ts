import { prisma } from "@/lib/prisma";
import { getImportTargets } from "./providers";
import type { ImportResult, ImportTarget } from "./types";

async function ensureCatalog(target: ImportTarget) {
  const category = await prisma.category.upsert({
    where: { slug: target.categorySlug },
    update: {},
    create: { slug: target.categorySlug, name: target.categorySlug === "economia" ? "Economia" : "Trabalho e renda" },
  });
  const source = await prisma.source.upsert({
    where: { name: target.sourceName },
    update: { institution: target.sourceInstitution, url: target.sourceUrl },
    create: { name: target.sourceName, institution: target.sourceInstitution, url: target.sourceUrl },
  });
  const indicator = await prisma.indicator.upsert({
    where: { slug: target.slug },
    update: {
      name: target.name,
      description: target.description,
      unit: target.unit,
      periodicity: target.periodicity,
      methodology: target.methodology,
      externalCode: target.externalCode,
      geographyLevel: target.geographyLevel ?? "Brasil",
      categoryId: category.id,
      sourceId: source.id,
    },
    create: {
      slug: target.slug,
      name: target.name,
      description: target.description,
      unit: target.unit,
      periodicity: target.periodicity,
      methodology: target.methodology,
      externalCode: target.externalCode,
      geographyLevel: target.geographyLevel ?? "Brasil",
      categoryId: category.id,
      sourceId: source.id,
    },
  });
  return { source, indicator };
}

export async function runIngestion(provider?: string): Promise<ImportResult[]> {
  const providerKey = provider?.toLowerCase();
  const matchesProvider = (sourceName: string) => {
    if (!providerKey) return true;
    if (["bcb", "sgs", "banco central"].includes(providerKey)) return sourceName.toLowerCase().includes("banco central");
    if (["ibge", "sidra"].includes(providerKey)) return sourceName.toLowerCase().includes("ibge");
    if (["ipea", "ipeadata"].includes(providerKey)) return sourceName.toLowerCase().includes("ipea");
    return sourceName.toLowerCase().includes(providerKey);
  };
  const targets = getImportTargets().filter((target) => matchesProvider(target.sourceName));
  if (!targets.length) throw new Error(`Nenhuma integração encontrada para: ${provider ?? "todas"}.`);
  const results: ImportResult[] = [];

  for (const target of targets) {
    const startedAt = new Date();
    let logId: string | undefined;
    try {
      const { source, indicator } = await ensureCatalog(target);
      const log = await prisma.importLog.create({ data: { sourceName: target.sourceName, status: "RUNNING", message: `Importando ${target.externalCode}` } });
      logId = log.id;
      const observations = await target.fetch();
      const unique = new Map<string, { indicatorId: string; region: string; period: string; value: number; fetchedAt: Date; geographyCode?: string; geographyLevel?: string }>();
      const fetchedAt = new Date();
      for (const item of observations) {
        if (!item.region || !item.period || !Number.isFinite(item.value)) continue;
        unique.set(`${item.geographyCode ?? item.region}|${item.period}`, {
          indicatorId: indicator.id, region: item.region, period: item.period, value: item.value, fetchedAt,
          geographyCode: item.geographyCode, geographyLevel: item.geographyLevel ?? target.geographyLevel ?? "Brasil",
        });
      }
      const rows = [...unique.values()];
      if (rows.length) {
        // Upsert por chave natural: reimportar não duplica observações e corrige valores revisados pela fonte.
        const chunkSize = 150;
        for (let offset = 0; offset < rows.length; offset += chunkSize) {
          const chunk = rows.slice(offset, offset + chunkSize);
          await prisma.$transaction(chunk.map((row) => prisma.observation.upsert({
            where: { indicatorId_region_period: { indicatorId: row.indicatorId, region: row.region, period: row.period } },
            update: { value: row.value, fetchedAt: row.fetchedAt, geographyCode: row.geographyCode, geographyLevel: row.geographyLevel },
            create: row,
          })));
        }
      }
      await prisma.source.update({ where: { id: source.id }, data: { consultedAt: fetchedAt } });
      const status = rows.length ? "SUCCESS" : "EMPTY";
      const message = rows.length ? `${rows.length} observações importadas/atualizadas.` : "A fonte respondeu, mas não retornou observações válidas.";
      await prisma.importLog.update({ where: { id: logId }, data: { status, records: rows.length, message, finishedAt: new Date() } });
      results.push({ source: target.sourceName, indicator: target.slug, status, records: rows.length, message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido na importação.";
      if (logId) {
        await prisma.importLog.update({ where: { id: logId }, data: { status: "FAILED", message, finishedAt: new Date() } }).catch(() => undefined);
      } else {
        await prisma.importLog.create({ data: { sourceName: target.sourceName, status: "FAILED", message, records: 0, startedAt, finishedAt: new Date() } }).catch(() => undefined);
      }
      results.push({ source: target.sourceName, indicator: target.slug, status: "FAILED", records: 0, message });
    }
  }
  return results;
}
