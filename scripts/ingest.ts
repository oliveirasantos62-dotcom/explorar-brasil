import { runIngestion } from "../src/lib/ingestion";

async function main() {
  const provider = process.argv[2];
  const results = await runIngestion(provider);
  console.table(results.map((result) => ({
    fonte: result.source, indicador: result.indicator, status: result.status,
    registros: result.records, mensagem: result.message,
  })));
  if (results.some((result) => result.status === "FAILED")) process.exitCode = 1;
}
main().catch((error) => {
  console.error("Falha na ingestão:", error);
  process.exitCode = 1;
});
