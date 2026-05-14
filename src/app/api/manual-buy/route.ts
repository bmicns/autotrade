import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { NextRequest, NextResponse } from "next/server";
import { recordEngineEvent } from "@/lib/engine/event-log";
import { getEngineLockState, isEngineEnabled } from "@/lib/engine/app-config";
import { sendManualBuyQueuedAlert } from "@/lib/engine/notify";
import { requireSessionWriteRequest } from "@/lib/request-guard";

const MAX_QTY = 10_000;

interface ManualBuyItem {
  stock_code: string;
  stock_name: string;
  qty: number;
}

export async function POST(req: NextRequest) {
  const guard = requireSessionWriteRequest(req);
  if (guard) return guard;

  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });
    if (!(await isEngineEnabled())) {
      return NextResponse.json({ error: "비상 정지 활성 상태에서는 신규 매수를 추가할 수 없습니다" }, { status: 409 });
    }
    const lockState = await getEngineLockState();
    if (lockState.locked) {
      return NextResponse.json({ error: "엔진 실행 중에는 신규 수동매수를 추가할 수 없습니다" }, { status: 409 });
    }

    const { items } = await req.json() as { items: ManualBuyItem[] };
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items required" }, { status: 400 });
    }

    const normalized = new Map<string, ManualBuyItem>();
    for (const item of items) {
      if (!/^\d{6}$/.test(item.stock_code)) {
        return NextResponse.json({ error: `유효하지 않은 종목코드: ${item.stock_code}` }, { status: 400 });
      }
      const qty = Math.floor(Number(item.qty));
      if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) {
        return NextResponse.json({ error: `수량은 1~${MAX_QTY} 정수여야 합니다: ${item.stock_code}` }, { status: 400 });
      }
      normalized.set(item.stock_code, {
        stock_code: item.stock_code,
        stock_name: String(item.stock_name ?? item.stock_code),
        qty,
      });
    }

    const dedupedItems = [...normalized.values()];
    const codes = dedupedItems.map((item) => item.stock_code);

    const [{ data: openPositions }, { data: activeSignals }] = await Promise.all([
      supabase
        .from("positions")
        .select("stock_code")
        .eq("status", "open")
        .in("stock_code", codes),
      supabase
        .from("pending_signals")
        .select("stock_code")
        .in("status", ["pending", "approved", "processing"])
        .in("stock_code", codes),
    ]);

    const blockedCodes = new Set<string>([
      ...(openPositions ?? []).map((row) => String(row.stock_code)),
      ...(activeSignals ?? []).map((row) => String(row.stock_code)),
    ]);

    const insertableItems = dedupedItems.filter((item) => !blockedCodes.has(item.stock_code));
    if (insertableItems.length === 0) {
      return NextResponse.json({ error: "이미 보유 중이거나 처리 중인 종목만 포함되어 있습니다" }, { status: 409 });
    }

    const records = insertableItems.map((item) => ({
      stock_code: item.stock_code,
      stock_name: String(item.stock_name ?? item.stock_code).slice(0, 40),
      signal_score: 100,
      signal_comment: `수동 지정 매수 — ${item.qty.toLocaleString()}주`,
      source: "manual",
      status: "approved",
      signal_data: { qty_override: item.qty },
    }));

    const { data, error } = await supabase
      .from("pending_signals")
      .insert(records)
      .select("id, stock_code, stock_name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const row of data ?? []) {
      await recordEngineEvent({
        eventType: "manual_buy_queued",
        stockCode: String(row.stock_code),
        entityTable: "pending_signals",
        entityId: String(row.id),
        payload: {
          source: "manual_buy",
          stock_name: row.stock_name,
          qty: insertableItems.find((item) => item.stock_code === row.stock_code)?.qty ?? null,
          pending_signal_id: String(row.id),
          side: "buy",
        },
      });
    }

    await sendManualBuyQueuedAlert({
      items: insertableItems.map((item) => ({
        code: item.stock_code,
        name: item.stock_name,
        qty: item.qty,
      })),
      skippedCodes: dedupedItems.filter((item) => blockedCodes.has(item.stock_code)).map((item) => item.stock_code),
    });

    return NextResponse.json({
      ok: true,
      inserted: data,
      skippedCodes: dedupedItems.filter((item) => blockedCodes.has(item.stock_code)).map((item) => item.stock_code),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
