import { NextRequest, NextResponse } from "next/server";
import { runIngestion } from "@/lib/ingestion";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const expected = process.env.INGESTION_API_KEY;
  const authorization = request.headers.get("authorization") ?? "";
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  let provider: string | undefined;
  try {
    const body: unknown = await request.json().catch(() => ({}));
    if (body && typeof body === "object" && "provider" in body && typeof body.provider === "string") {
      provider = body.provider;
    }
    const results = await runIngestion(provider);
    const failed = results.some((result) => result.status === "FAILED");
    return NextResponse.json({
      status: failed ? "completed_with_errors" : "completed",
      summary: { integrations: results.length, records: results.reduce((sum, item) => sum + item.records, 0) },
      results,
    }, { status: failed ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na ingestão." }, { status: 500 });
  }
}
