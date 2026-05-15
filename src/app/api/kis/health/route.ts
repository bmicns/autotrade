import { NextResponse } from "next/server";
import { apiCacheHeaders } from "@/lib/http-cache";
import { resolveActiveBrokerState } from "@/lib/broker/config";
import { checkBrokerHealth } from "@/lib/broker/health";

export async function GET() {
  try {
    const brokerState = await resolveActiveBrokerState();
    const result = await checkBrokerHealth(brokerState.brokerId);
    return NextResponse.json(result.status, { status: result.httpStatus, headers: apiCacheHeaders.realtime });
  } catch {
    return NextResponse.json({ error: "헬스체크 실패" }, { status: 500, headers: apiCacheHeaders.realtime });
  }
}
