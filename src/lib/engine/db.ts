// ─── Supabase DB 헬퍼 함수 ───────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// [Supabase SQL Editor에서 실행] 부분익절 PnL 추적용 컬럼 추가 (C1 fix)
// ALTER TABLE positions
//   ADD COLUMN IF NOT EXISTS partial_exit_price integer DEFAULT NULL,
//   ADD COLUMN IF NOT EXISTS partial_exit_qty integer DEFAULT NULL;
// ─────────────────────────────────────────────────────────────────────────────
// [Supabase SQL Editor에서 실행] ATR 정확도 추적용 컬럼 추가
// ALTER TABLE trade_memory
//   ADD COLUMN IF NOT EXISTS stop_price integer DEFAULT NULL,
//   ADD COLUMN IF NOT EXISTS profit_price integer DEFAULT NULL;
// ─────────────────────────────────────────────────────────────────────────────
// [Supabase SQL Editor에서 실행] pending_orders 테이블 생성
// CREATE TABLE IF NOT EXISTS pending_orders (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   stock_code text NOT NULL,
//   stock_name text,
//   order_no text NOT NULL,
//   order_qty integer NOT NULL,
//   limit_price integer NOT NULL,
//   signal_score integer,
//   created_at timestamptz DEFAULT now()
// );
// ─────────────────────────────────────────────────────────────────────────────
// [Supabase SQL Editor에서 실행] 엔진 상태 이벤트 테이블 생성
// CREATE TABLE IF NOT EXISTS engine_state_events (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   event_type text NOT NULL,
//   stock_code text,
//   entity_table text NOT NULL,
//   entity_id text,
//   payload jsonb NOT NULL DEFAULT '{}'::jsonb,
//   created_at timestamptz DEFAULT now()
// );
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase/api-client";
import { type SignalResult } from "@/lib/kis/indicators";
import {
  buildPartialExitPayload,
  buildPositionClosePayload,
  buildPositionOpenPayload,
  buildTradeMemoryClosePayload,
  type PendingSignalStatus,
  type PositionCloseReason,
  type PositionPhase,
} from "@/lib/engine/lifecycle";
import { recordEngineEvent } from "@/lib/engine/event-log";



// ─── trade_memory 헬퍼 ──────────────────────────
export function extractCandlePattern(signal: SignalResult): string {
  const patternInd = signal.indicators.find((i) => i.name === "캔들패턴");
  return patternInd?.value ?? "없음";
}

// ─── Supabase 포지션 관리 ────────────────────────
export async function openPosition(code: string, name: string | null, price: number, qty: number, signal: SignalResult, phase: PositionPhase, sector?: string) {
  try {
    const payload = buildPositionOpenPayload({ code, name, price, qty, signal, phase, sector });
    const { data } = await supabase.from("positions").insert(payload).select("id").maybeSingle();
    await recordEngineEvent({
      eventType: "position_opened",
      stockCode: code,
      entityTable: "positions",
      entityId: (data?.id as string | undefined) ?? null,
      payload,
    });
  } catch (e) { console.error("[openPosition] DB 오류:", e); }
}

// open 포지션의 섹터별 건수 반환 (sector IS NOT NULL인 건만)
export async function getSectorCounts(): Promise<Map<string, number>> {
  try {
    const { data } = await supabase
      .from("positions")
      .select("sector")
      .eq("status", "open")
      .not("sector", "is", null);
    const map = new Map<string, number>();
    for (const row of data ?? []) {
      const s = row.sector as string;
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return map;
  } catch { return new Map(); }
}

export async function closePosition(code: string, exitPrice: number, exitQty: number, exitReason: PositionCloseReason) {
  try {
    const { data } = await supabase.from("positions").select("*")
      .eq("stock_code", code).eq("status", "open")
      .order("entry_date", { ascending: true }).limit(1);
    if (!data || data.length === 0) return;
    const pos = data[0];
    const entryPrice = Number(pos.entry_price);
    const holdDays = Math.max(1, Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000));

    // 부분익절(1차 TP)이 있었던 경우 블렌드 PnL 계산
    const partialPrice = Number(pos.partial_exit_price) || 0;
    const partialQty   = Number(pos.partial_exit_qty)   || 0;
    let pnlAmount: number;
    let pnlPercent: number;
    if (partialPrice > 0 && partialQty > 0) {
      const partialPnl = (partialPrice - entryPrice) * partialQty;
      const finalPnl   = (exitPrice   - entryPrice) * exitQty;
      pnlAmount  = partialPnl + finalPnl;
      const totalQty = partialQty + exitQty;
      pnlPercent = entryPrice > 0 ? (pnlAmount / (entryPrice * totalQty)) * 100 : 0;
    } else {
      pnlAmount  = (exitPrice - entryPrice) * exitQty;
      pnlPercent = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
    }

    const payload = buildPositionClosePayload({ exitPrice, exitQty, exitReason, pnlAmount, pnlPercent, holdDays });
    await supabase.from("positions").update(payload).eq("id", pos.id);
    await recordEngineEvent({
      eventType: "position_closed",
      stockCode: code,
      entityTable: "positions",
      entityId: pos.id as string,
      payload,
    });
  } catch { /* ignore */ }
}

// 1차 부분익절 시 가격·수량 기록 (2차 청산 시 블렌드 PnL 산출용)
export async function recordPartialExit(code: string, price: number, qty: number, nextPhase: PositionPhase): Promise<void> {
  try {
    const { data } = await supabase.from("positions")
      .select("id")
      .eq("stock_code", code)
      .eq("status", "open")
      .order("entry_date", { ascending: true })
      .limit(1);
    if (!data || data.length === 0) return;
    const payload = buildPartialExitPayload({ price, qty, nextPhase });
    await supabase.from("positions")
      .update(payload)
      .eq("id", data[0].id);
    await recordEngineEvent({
      eventType: "partial_exit_recorded",
      stockCode: code,
      entityTable: "positions",
      entityId: data[0].id as string,
      payload,
    });
  } catch (e) { console.error("[recordPartialExit] DB 오류:", e); }
}

export async function recordTradeMemory(params: {
  code: string;
  name: string;
  baseSignal: SignalResult;
  learnedSignal: SignalResult;
  bonuses: { market: number; investor: number; snapshot: number };
  adjustedScore: number;
  weightsSource: "learned" | "default";
  positionSize: number;
  entryPrice?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
}): Promise<void> {
  try {
    const raw = params.learnedSignal.raw;
    const stopPrice   = params.entryPrice && params.stopLossPct
      ? Math.round(params.entryPrice * (1 - params.stopLossPct / 100))
      : null;
    const profitPrice = params.entryPrice && params.takeProfitPct
      ? Math.round(params.entryPrice * (1 + params.takeProfitPct / 100))
      : null;
    const payload = {
      stock_code: params.code,
      stock_name: params.name,
      rsi_value: raw.rsi,
      macd_histogram: raw.macd,
      ma_cross: raw.macdCrossover === "golden" ? "golden" : raw.macdCrossover === "dead" ? "dead" : "none",
      bb_position: raw.bbPosition,
      volume_ratio: raw.volumeRatio,
      adx_value: raw.adx,
      candle_pattern: extractCandlePattern(params.learnedSignal),
      regime: raw.regime,
      base_score: params.baseSignal.totalScore,
      learned_score: params.learnedSignal.totalScore,
      total_score: params.adjustedScore,
      market_bonus: params.bonuses.market,
      investor_bonus: params.bonuses.investor,
      snapshot_bonus: params.bonuses.snapshot,
      weights_source: params.weightsSource,
      atr_value: raw.atr,
      position_size: params.positionSize,
      stop_price: stopPrice,
      profit_price: profitPrice,
    };
    const { data } = await supabase.from("trade_memory").insert(payload).select("id").maybeSingle();
    await recordEngineEvent({
      eventType: "trade_memory_recorded",
      stockCode: params.code,
      entityTable: "trade_memory",
      entityId: (data?.id as string | undefined) ?? null,
      payload,
    });
  } catch { /* ignore */ }
}

export async function closeTradeMemory(
  code: string,
  pnlPercent: number,
  pnlAmount: number,
  holdDays: number,
  exitReason: PositionCloseReason,
  tradeMemoryId?: string
): Promise<void> {
  try {
    let targetId = tradeMemoryId;

    if (!targetId) {
      // positions 테이블에서 해당 종목의 open 포지션 entry_date를 가져와
      // 가장 가까운 trade_memory 행을 특정한다 (unique index로 1건 보장)
      const { data: pos } = await supabase.from("positions")
        .select("entry_date")
        .eq("stock_code", code)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();

      let memQuery = supabase.from("trade_memory")
        .select("id")
        .eq("stock_code", code)
        .is("closed_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (pos?.entry_date) {
        memQuery = memQuery.gte("created_at", pos.entry_date);
      }

      const { data: row } = await memQuery.maybeSingle();
      if (!row?.id) return;
      targetId = row.id as string;
    }

    const payload = buildTradeMemoryClosePayload({ pnlPercent, pnlAmount, holdDays, exitReason });
    await supabase.from("trade_memory")
      .update(payload)
      .eq("id", targetId);
    await recordEngineEvent({
      eventType: "trade_memory_closed",
      stockCode: code,
      entityTable: "trade_memory",
      entityId: targetId ?? null,
      payload,
    });
  } catch { /* ignore */ }
}

export async function updatePositionPhase(code: string, phase: PositionPhase): Promise<void> {
  try {
    const { data } = await supabase.from("positions")
      .select("id")
      .eq("stock_code", code)
      .eq("status", "open")
      .order("entry_date", { ascending: true })
      .limit(1);
    if (!data || data.length === 0) return;
    const payload = { phase, updated_at: new Date().toISOString() };
    await supabase.from("positions")
      .update(payload)
      .eq("id", data[0].id);
    await recordEngineEvent({
      eventType: "position_phase_changed",
      stockCode: code,
      entityTable: "positions",
      entityId: data[0].id as string,
      payload,
    });
  } catch (e) { console.error("[updatePositionPhase] DB 오류:", e); }
}

export async function resolvePendingSignal(id: string, status: PendingSignalStatus, detail?: string): Promise<void> {
  const payload = {
    status,
    resolved_at: new Date().toISOString(),
    signal_data: detail ? { resolution_detail: detail } : undefined,
  };
  await supabase
    .from("pending_signals")
    .update(payload)
    .eq("id", id);
  await recordEngineEvent({
    eventType: "pending_signal_resolved",
    entityTable: "pending_signals",
    entityId: id,
    payload,
  });
}

export async function getOpenPosition(code: string) {
  try {
    const { data } = await supabase.from("positions").select("*")
      .eq("stock_code", code).eq("status", "open").limit(1);
    return data?.[0] || null;
  } catch { return null; }
}

// #5 일일 실현 손실 합산
export async function getTodayRealizedLoss(): Promise<number> {
  try {
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); // KST 기준
    const { data } = await supabase.from("positions").select("pnl_percent")
      .eq("status", "closed").gte("exit_date", today);
    if (!data) return 0;
    return data.reduce((s, p) => s + (Number(p.pnl_percent) || 0), 0);
  } catch { return 0; }
}

export async function logEngineRun(tradeCount: number, actions: unknown[], scannedCount: number, durationMs: number, error?: string) {
  try {
    await supabase.from("engine_runs").insert({
      trade_count: tradeCount, actions, scanned_count: scannedCount,
      duration_ms: durationMs, error: error || null,
    });
  } catch { /* ignore */ }
}

// ─── pending_orders 헬퍼 ─────────────────────────
// [Supabase SQL Editor에서 실행] strategy_key 컬럼 추가
// ALTER TABLE pending_orders ADD COLUMN IF NOT EXISTS strategy_key text DEFAULT NULL;
export interface PendingOrder {
  id: string;
  stock_code: string;
  stock_name: string | null;
  order_no: string;
  order_qty: number;
  limit_price: number;
  signal_score: number | null;
  strategy_key: string | null;
  created_at: string;
}

export async function savePendingOrder(params: {
  stock_code: string;
  stock_name?: string | null;
  order_no: string;
  order_qty: number;
  limit_price: number;
  signal_score?: number | null;
  strategy_key?: string | null;
}): Promise<void> {
  try {
    const payload = {
      stock_code: params.stock_code,
      stock_name: params.stock_name ?? null,
      order_no: params.order_no,
      order_qty: params.order_qty,
      limit_price: params.limit_price,
      signal_score: params.signal_score ?? null,
      strategy_key: params.strategy_key ?? null,
    };
    const { data } = await supabase.from("pending_orders").insert(payload).select("id").maybeSingle();
    await recordEngineEvent({
      eventType: "pending_order_saved",
      stockCode: params.stock_code,
      entityTable: "pending_orders",
      entityId: (data?.id as string | undefined) ?? null,
      payload,
    });
  } catch { /* ignore */ }
}

export async function getPendingOrders(): Promise<PendingOrder[]> {
  try {
    const { data } = await supabase.from("pending_orders").select("*").order("created_at", { ascending: true }).limit(20);
    return (data ?? []) as PendingOrder[];
  } catch { return []; }
}

export async function deletePendingOrder(orderId: string): Promise<void> {
  try {
    await supabase.from("pending_orders").delete().eq("id", orderId);
    await recordEngineEvent({
      eventType: "pending_order_deleted",
      entityTable: "pending_orders",
      entityId: orderId,
      payload: { deleted: true },
    });
  } catch { /* ignore */ }
}

// 30분 이상 경과한 pending_orders 일괄 삭제 (고립 상태 정리)
export async function cleanupStalePendingOrders(cutoffMinutes = 30): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - cutoffMinutes * 60 * 1000).toISOString();
    await supabase.from("pending_orders").delete().lt("created_at", cutoff);
  } catch { /* ignore */ }
}
