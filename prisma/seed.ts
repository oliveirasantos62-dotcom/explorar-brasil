import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const sources = [
    { name: "IBGE — SIDRA", institution: "Instituto Brasileiro de Geografia e Estatística", url: "https://sidra.ibge.gov.br/" },
    { name: "Banco Central — SGS", institution: "Banco Central do Brasil", url: "https://api.bcb.gov.br/" },
    { name: "IPEAData", institution: "Instituto de Pesquisa Econômica Aplicada", url: "https://ipeadata.gov.br/api/" }
  ];
  for (const source of sources) await prisma.source.upsert({ where: { name: source.name }, update: source, create: source });

  const categories = [
    { name: "Economia", slug: "economia", description: "Atividade econômica, preços e juros" },
    { name: "Trabalho e renda", slug: "trabalho-renda", description: "Mercado de trabalho e rendimento" },
    { name: "Demografia", slug: "demografia", description: "População e dinâmica demográfica" }
  ];
  for (const category of categories) await prisma.category.upsert({ where: { slug: category.slug }, update: category, create: category });

  // Remove somente os pontos anuais artificiais criados pelo seed antigo (2020–2025).
  // As séries oficiais diárias/mensais importadas não são apagadas.
  await prisma.observation.deleteMany({ where: { period: { in: ["2020", "2021", "2022", "2023", "2024", "2025"] }, indicator: { slug: { in: ["selic-meta", "ipca", "desocupacao", "populacao"] } } } });
  // Remove dois indicadores que existiam apenas como exemplos artificiais no seed anterior.
  await prisma.indicator.deleteMany({ where: { slug: { in: ["desocupacao", "populacao"] } } });

  console.log("Catálogo inicial preparado. Nenhum dado estatístico fictício foi criado.");
  console.log("Execute npm run ingest para importar observações das fontes oficiais.");
}
main().finally(() => prisma.$disconnect());
