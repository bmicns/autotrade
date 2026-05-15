import { NextRequest, NextResponse } from "next/server";
import { getEngineLockState, isEngineEnabled } from "@/lib/engine/app-config";
import { getSupabaseConfigError } from "@/lib/supabase/api-client";
import { resolveActiveBrokerState } from "@/lib/broker/config";
import { placeBrokerManualOrder, validateManualOrderPayload } from "@/lib/broker/manual-order";

export async function POST(req: NextRequest) {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });
    const brokerState = await resolveActiveBrokerState();
    const requestBody = await req.json() as Record<string, unknown>;
    const validated = validateManualOrderPayload(requestBody);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    if (validated.side === "buy" && !(await isEngineEnabled())) {
      return NextResponse.json({ error: "비상 정지 활성 상태에서는 신규 매수를 실행할 수 없습니다" }, { status: 409 });
    }
    if (validated.side === "buy") {
      const lockState = await getEngineLockState();
      if (lockState.locked) {
        return NextResponse.json({ error: "엔진 실행 중에는 신규 매수를 실행할 수 없습니다" }, { status: 409 });
      }
    }
    const result = await placeBrokerManualOrder(brokerState.brokerId, validated);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "주문 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
