import { NextResponse } from "next/server";

import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { getEngineLockState, isEngineEnabled } from "@/lib/engine/app-config";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { placeOrder } from "@/lib/kis/api";
import { resolvePendingSignal } from "@/lib/engine/db";
import { sendBulkBuyAlert } from "@/lib/engine/notify";
import { resolveKisAccessToken } from "@/lib/kis/runtime-token";
import { KIS_RUNTIME_MODE } from "@/lib/constants";

interface PendingSignalRow {
  id: string;
  stock_code: string;
  stock_name: string | null;
  signal_data?: Record<string, unknown> | null;
}

function resolveOrderQty(signal: PendingSignalRow): number {
  const rawQty = signal.signal_data?.qty_override;
  const qty = typeof rawQty === "number" ? Math.floor(rawQty) : 1;
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

export async function POST() {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });
    if (!(await isEngineEnabled())) {
      return NextResponse.json({ error: "비상 정지 활성 상태에서는 일괄매수를 실행할 수 없습니다" }, { status: 409 });
    }

    const lockState = await getEngineLockState();
    if (lockState.locked) {
      return NextResponse.json({ error: "엔진 실행 중에는 일괄매수를 실행할 수 없습니다" }, { status: 409 });
    }

    const { data: pendingSignals, error: pendingError } = await supabase
      .from("pending_signals")
      .select("id, stock_code, stock_name, signal_data")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (pendingError) {
      return NextResponse.json({ error: pendingError.message }, { status: 500 });
    }

    const signals = (pendingSignals ?? []) as PendingSignalRow[];
    if (signals.length === 0) {
      return NextResponse.json({ error: "일괄매수할 승인 대기 신호가 없습니다" }, { status: 409 });
    }

    const domesticProfileId = KIS_RUNTIME_MODE === "prod" ? "kr" : "default";
    const active = await getActiveKisConfig(domesticProfileId);
    if (!active) {
      return NextResponse.json({ error: "KIS 설정이 없습니다" }, { status: 400 });
    }
    let token: string;
    try {
      token = await resolveKisAccessToken(active.profileId, active.config.appKey, active.config.appSecret);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "KIS 토큰 발급 실패";
      return NextResponse.json(
        {
          error: `${KIS_RUNTIME_MODE === "prod" ? "국내" : "모의"} KIS 토큰 오류 (${active.source}/${active.profileId}): ${message}`,
        },
        { status: 500 },
      );
    }

    const ids = signals.map((signal) => signal.id);
    const { error: approveError } = await supabase
      .from("pending_signals")
      .update({ status: "approved" })
      .in("id", ids);

    if (approveError) {
      return NextResponse.json({ error: approveError.message }, { status: 500 });
    }

    const approved: Array<{ code: string; name: string; qty: number }> = [];
    const failed: Array<{ code: string; name: string; detail: string }> = [];

    for (const signal of signals) {
      const qty = resolveOrderQty(signal);
      const name = signal.stock_name || signal.stock_code;

      try {
        const data = await placeOrder(
          {
            appKey: active.config.appKey,
            appSecret: active.config.appSecret,
            accountNo: active.config.accountNo,
            accountProductCode: active.config.accountProductCode,
            token,
          },
          "buy",
          signal.stock_code,
          qty,
          0,
          "01",
        );

        if (String(data?.rt_cd ?? "") === "0") {
          await resolvePendingSignal(signal.id, "expired", "일괄매수 즉시 주문 접수");
          approved.push({ code: signal.stock_code, name, qty });
          continue;
        }

        failed.push({
          code: signal.stock_code,
          name,
          detail: String(data?.msg1 || data?.msg || data?.error || "즉시 주문 실패"),
        });
      } catch (error) {
        failed.push({
          code: signal.stock_code,
          name,
          detail: error instanceof Error ? error.message : "즉시 주문 실패",
        });
      }
    }

    await sendBulkBuyAlert({ approved, failed });

    return NextResponse.json({
      ok: true,
      approvedCount: approved.length,
      failedCount: failed.length,
      approved,
      failed,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "일괄매수 실패";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
