// ─── Supabase DB 헬퍼 함수 ───────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// [Supabase SQL Editor에서 실행] 부분익절 PnL 추적용 컬럼 추가 (C1 fix)
// ALTER TABLE positions
//   ADD COLUMN IF NOT EXISTS partial_exit_price integer DEFAULT NULL,
//   ADD COLUMN IF NOT EXISTS partial_exit_qty integer DEFAULT NULL;
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
import { supabase } from "@/lib/supabase/api-client";
import { type SignalResult } from "@/lib/kis/indicators";



// ─── trade_memory 헬퍼 ──────────────────────────
export function extractCandlePattern(signal: SignalResult): string {
  const patternInd = signal.indicators.find((i) => i.name === "캔들패턴");
  return patternInd?.value ?? "없음";
}

// ─── Supabase 포지션 관리 ────────────────────────
export async function openPosition(code: string, name: string | null, price: number, qty: number, signal: SignalResult, phase: "initial" | "full", sector?: string) {
  try {
    await supabase.from("positions").insert({
      stock_code: code, stock_name: name,
      entry_price: price, entry_qty: qty,
      entry_signal: { indicators: signal.indicators, raw: signal.raw, matchCount: signal.matchCount, totalScore: signal.totalScore },
      signal_strength: signal.strength,
      phase, status: "open",
      sector: sector ?? null,
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

export async function closePosition(code: string, exitPrice: number, exitQty: number, exitReason: string) {
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

    await supabase.from("positions").update({
      exit_price: exitPrice, exit_qty: exitQty,
      exit_date: new Date().toISOString(), exit_reason: exitReason,
      pnl_amount: Math.round(pnlAmount),
      pnl_percent: Math.round(pnlPercent * 100) / 100,
      hold_days: holdDays, status: "closed",
    }).eq("id", pos.id);
  } catch { /* ignore */ }
}

// 1차 부분익절 시 가격·수량 기록 (2차 청산 시 블렌드 PnL 산출용)
export async function recordPartialExit(code: string, price: number, qty: number, nextPhase: string): Promise<void> {
  try {
    const { data } = await supabase.from("positions")
      .select("id")
      .eq("stock_code", code)
      .eq("status", "open")
      .order("entry_date", { ascending: true })
      .limit(1);
    if (!data || data.length === 0) return;
    await supabase.from("positions")
      .update({
        partial_exit_price: price,
        partial_exit_qty: qty,
        phase: nextPhase,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data[0].id);
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
}): Promise<void> {
  try {
    const raw = params.learnedSignal.raw;
    await supabase.from("trade_memory").insert({
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
    });
  } catch { /* ignore */ }
}

export async function closeTradeMemory(
  code: string,
  pnlPercent: number,
  pnlAmount: number,
  holdDays: number,
  exitReason: string,
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

    await supabase.from("trade_memory")
      .update({
        pnl_percent: Math.round(pnlPercent * 100) / 100,
        pnl_amount: Math.round(pnlAmount),
        hold_days: holdDays,
        exit_reason: exitReason,
        is_win: pnlAmount > 0,
        closed_at: new Date().toISOString(),
      })
      .eq("id", targetId);
  } catch { /* ignore */ }
}

export async function updatePositionPhase(code: string, phase: string): Promise<void> {
  try {
    const { data } = await supabase.from("positions")
      .select("id")
      .eq("stock_code", code)
      .eq("status", "open")
      .order("entry_date", { ascending: true })
      .limit(1);
    if (!data || data.length === 0) return;
    await supabase.from("positions")
      .update({ phase, updated_at: new Date().toISOString() })
      .eq("id", data[0].id);
  } catch (e) { console.error("[updatePositionPhase] DB 오류:", e); }
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
export interface PendingOrder {
  id: string;
  stock_code: string;
  stock_name: string | null;
  order_no: string;
  order_qty: number;
  limit_price: number;
  signal_score: number | null;
  created_at: string;
}

export async function savePendingOrder(params: {
  stock_code: string;
  stock_name?: string | null;
  order_no: string;
  order_qty: number;
  limit_price: number;
  signal_score?: number | null;
}): Promise<void> {
  try {
    await supabase.from("pending_orders").insert({
      stock_code: params.stock_code,
      stock_name: params.stock_name ?? null,
      order_no: params.order_no,
      order_qty: params.order_qty,
      limit_price: params.limit_price,
      signal_score: params.signal_score ?? null,
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
  } catch { /* ignore */ }
}
