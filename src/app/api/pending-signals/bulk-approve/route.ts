import { NextResponse } from "next/server";

import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { getEngineLockState, isEngineEnabled } from "@/lib/engine/app-config";
import { sendBulkApproveAlert } from "@/lib/engine/notify";

interface PendingSignalRow {
  id: string;
  stock_code: string;
  stock_name: string | null;
  signal_data?: Record<string, unknown> | null;
}

function resolveSignalQty(signal: PendingSignalRow): number {
  const rawQty = signal.signal_data?.qty_override;
  const qty = typeof rawQty === "number" ? Math.floor(rawQty) : 1;
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

export async function POST() {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });
    if (!(await isEngineEnabled())) {
      return NextResponse.json({ error: "비상 정지 활성 상태에서는 일괄 승인을 진행할 수 없습니다" }, { status: 409 });
    }

    const lockState = await getEngineLockState();
    if (lockState.locked) {
      return NextResponse.json({ error: "엔진 실행 중에는 일괄 승인을 진행할 수 없습니다" }, { status: 409 });
    }

    const { data: pendingSignals, error } = await supabase
      .from("pending_signals")
      .select("id, stock_code, stock_name, signal_data")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const signals = (pendingSignals ?? []) as PendingSignalRow[];
    if (signals.length === 0) {
      return NextResponse.json({ error: "일괄 승인할 신호가 없습니다" }, { status: 409 });
    }

    const { error: updateError } = await supabase
      .from("pending_signals")
      .update({ status: "approved" })
      .in("id", signals.map((signal) => signal.id));

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const approved = signals.map((signal) => ({
      code: signal.stock_code,
      name: signal.stock_name || signal.stock_code,
      qty: resolveSignalQty(signal),
    }));

    await sendBulkApproveAlert({ approved });

    return NextResponse.json({
      ok: true,
      approvedCount: approved.length,
      approved,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "일괄 승인 실패";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
