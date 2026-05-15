import { NextRequest, NextResponse } from "next/server";
import { resolveActiveBrokerState } from "@/lib/broker/config";
import { fetchBrokerBalance, validateBrokerBalancePayload } from "@/lib/broker/market";

export async function POST(req: NextRequest) {
  try {
    const brokerState = await resolveActiveBrokerState();
    const validated = validateBrokerBalancePayload(await req.json() as Record<string, unknown>);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const result = await fetchBrokerBalance(brokerState.brokerId, validated);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    return NextResponse.json({ error: "잔고 조회 실패" }, { status: 500 });
  }
}
