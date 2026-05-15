import { NextRequest, NextResponse } from "next/server";
import { resolveActiveBrokerState } from "@/lib/broker/config";
import { fetchBrokerPrice, validateBrokerPricePayload } from "@/lib/broker/market";

export async function POST(req: NextRequest) {
  try {
    const brokerState = await resolveActiveBrokerState();
    const validated = validateBrokerPricePayload(await req.json() as Record<string, unknown>);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const result = await fetchBrokerPrice(brokerState.brokerId, validated);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    console.error("[price] 시세 조회 오류:", e);
    return NextResponse.json({ error: "시세 조회 실패" }, { status: 500 });
  }
}
