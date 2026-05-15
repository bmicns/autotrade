import { NextRequest, NextResponse } from "next/server";
import { requireSessionWriteRequest } from "@/lib/request-guard";
import { executeBrokerManualSell, validateManualSellPayload } from "@/lib/broker/manual-sell";

export async function POST(req: NextRequest) {
  const guard = requireSessionWriteRequest(req);
  if (guard) return guard;

  try {
    const validated = validateManualSellPayload(await req.json() as Record<string, unknown>);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const result = await executeBrokerManualSell(validated);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수동 매도 실패" },
      { status: 500 },
    );
  }
}
