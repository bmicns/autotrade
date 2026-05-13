// ─── Supabase DB 헬퍼 함수 ───────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// [Supabase SQL Editor에서 실행] 부분익절 PnL 추적용 컬럼 추가 (C1 fix)
// ALTER TABLE positions
//   ADD COLUMN IF NOT EXISTS partial_exit_price integer DEFAULT NULL,
//   ADD COLUMN IF NOT EXISTS partial_exit_qty integer DEFAULT NULL;
// ─────────────────────────────────────────────────────────────────────────────
// [Supabase SQL Editor에서 실행] ATR 정확도 추적용 컬럼 추가
// ALTER TABLE trade_memory
//   ADD COLUMN IF NOT EXISTS stop_price integer DEFAULT NULL;
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
import { type SignalRaw, type SignalResult } from "@/lib/kis/indicators";
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
import { selectRestorableBrokerHoldings } from "@/lib/engine/broker-sync";
import { getOpenPositionRemainingQty } from "@/lib/engine/position-math";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";

const BROKER_SYNC_RAW: SignalRaw = {
  rsi: 0,
  macd: 0,
  macdSignal: 0,
  macdCrossover: "none",
  ma5: 0,
  ma20: 0,
  ema5: 0,
  ema20: 0,
  bbPosition: "middle",
  volumeRatio: 100,
  atr: 0,
  adx: 0,
  regime: "ranging",
  stochRsiK: 50,
  stochRsiD: 50,
  obvSlope: 0,
  disparity: 0,
  patternSellHit: false,
};

interface RecentDirectOrderContext {
  note: string | null;
  market: string | null;
  profileId: string | null;
  createdAt: string;
}

interface ReconcileContext {
  source: string | null;
  profileId: string | null;
}

async function loadActiveReconcileContext(): Promise<ReconcileContext> {
  try {
    const activeConfig = await getActiveKisConfig();
    return {
      source: activeConfig?.source ?? null,
      profileId: activeConfig?.profileId ?? null,
    };
  } catch {
    return { source: null, profileId: null };
  }
}



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

export async function closePosition(
  code: string,
  exitPrice: number,
  exitQty: number,
  exitReason: PositionCloseReason,
): Promise<{ holdDays: number; pnlAmount: number; pnlPercent: number } | null> {
  try {
    const { data } = await supabase.from("positions").select("*")
      .eq("stock_code", code).eq("status", "open")
      .order("entry_date", { ascending: true }).limit(1);
    if (!data || data.length === 0) return null;
    const pos = data[0];
    const entryPrice = Number(pos.entry_price);
    const holdDays = Math.max(1, Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000));

    // 부분청산 이력이 있으면 최종 청산 손익을 블렌드 기준으로 정산한다.
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
    return { holdDays, pnlAmount, pnlPercent };
  } catch {
    return null;
  }
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
}): Promise<string | null> {
  try {
    const raw = params.learnedSignal.raw;
    const stopPrice   = params.entryPrice && params.stopLossPct
      ? Math.round(params.entryPrice * (1 - params.stopLossPct / 100))
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
    };
    const { data } = await supabase.from("trade_memory").insert(payload).select("id").maybeSingle();
    await recordEngineEvent({
      eventType: "trade_memory_recorded",
      stockCode: params.code,
      entityTable: "trade_memory",
      entityId: (data?.id as string | undefined) ?? null,
      payload,
    });
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
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
    let targetId: string | null = tradeMemoryId ?? null;

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
      targetId = (row?.id as string | undefined) ?? null;
    }

    if (!targetId) {
      const { data: latestPosition } = await supabase.from("positions")
        .select("stock_name, entry_price, entry_qty")
        .eq("stock_code", code)
        .order("entry_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const recoveredSignal: SignalResult = {
        strength: "weak",
        side: "buy",
        totalScore: 0,
        comment: "청산 시 trade_memory 누락 복구",
        indicators: [],
        raw: BROKER_SYNC_RAW,
        matchCount: 0,
      };

      const recoveredTradeMemoryId = await recordTradeMemory({
        code,
        name: (latestPosition?.stock_name as string | undefined) ?? code,
        baseSignal: recoveredSignal,
        learnedSignal: recoveredSignal,
        bonuses: { market: 0, investor: 0, snapshot: 0 },
        adjustedScore: 0,
        weightsSource: "default",
        positionSize: Number(latestPosition?.entry_qty) || 0,
        entryPrice: Number(latestPosition?.entry_price) || undefined,
      });

      targetId = recoveredTradeMemoryId;
      if (!targetId) return;
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

export async function reconcilePositionEntryFill(
  code: string,
  fillPrice: number,
  fillQty: number,
  phase: PositionPhase,
): Promise<void> {
  try {
    const { data } = await supabase.from("positions")
      .select("id, entry_price, entry_qty, partial_exit_qty")
      .eq("stock_code", code)
      .eq("status", "open")
      .order("entry_date", { ascending: true })
      .limit(1);
    if (!data || data.length === 0) return;

    const pos = data[0];
    const remainingQty = getOpenPositionRemainingQty(pos);
    const nextQty = remainingQty + fillQty;
    const baseCost = (Number(pos.entry_price) || 0) * remainingQty;
    const fillCost = fillPrice * fillQty;
    const nextEntryPrice = nextQty > 0 ? Math.round((baseCost + fillCost) / nextQty) : fillPrice;
    const payload = {
      entry_price: nextEntryPrice,
      entry_qty: nextQty,
      partial_exit_price: null,
      partial_exit_qty: null,
      phase,
      updated_at: new Date().toISOString(),
    };

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
  } catch (e) { console.error("[reconcilePositionEntryFill] DB 오류:", e); }
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

export async function syncBrokerHoldingsToPositions(holdings: Array<Record<string, string>>): Promise<Array<{ code: string; name: string; qty: number }>> {
  const activeHoldings = holdings.filter((holding) => Number(holding.hldg_qty) > 0);
  const codes = [...new Set(activeHoldings.map((holding) => holding.pdno).filter(Boolean))];
  if (codes.length === 0) return [];

  const { data: openPositions } = await supabase
    .from("positions")
    .select("stock_code")
    .eq("status", "open")
    .in("stock_code", codes);

  const openCodeSet = new Set((openPositions ?? []).map((row) => row.stock_code as string));
  const restored: Array<{ code: string; name: string; qty: number }> = [];
  const recentDirectOrderContextByCode = await loadRecentDirectOrderContext(codes);
  const reconcileContext = await loadActiveReconcileContext();

  for (const holding of selectRestorableBrokerHoldings(activeHoldings, openCodeSet)) {
    const directOrderContext = recentDirectOrderContextByCode.get(holding.code) ?? null;
    const recoveredSignal: SignalResult = {
      strength: "weak",
      side: "buy",
      totalScore: 0,
      comment: "브로커 실잔고 동기화 복구",
      indicators: [],
      raw: BROKER_SYNC_RAW,
      matchCount: 0,
      ...(directOrderContext?.note ? { directOrderNote: directOrderContext.note } : {}),
      ...(directOrderContext?.market ? { directOrderMarket: directOrderContext.market } : {}),
      ...(directOrderContext?.profileId ? { directOrderProfileId: directOrderContext.profileId } : {}),
    };
    await openPosition(
      holding.code,
      holding.name,
      holding.price,
      holding.qty,
      recoveredSignal,
      "initial",
    );
    await recordTradeMemory({
      code: holding.code,
      name: holding.name,
      baseSignal: recoveredSignal,
      learnedSignal: recoveredSignal,
      bonuses: { market: 0, investor: 0, snapshot: 0 },
      adjustedScore: 0,
      weightsSource: "default",
      positionSize: holding.qty,
      entryPrice: holding.price,
    });
    await recordEngineEvent({
      eventType: "position_reconciled",
      stockCode: holding.code,
      entityTable: "positions",
      entityId: null,
      payload: {
        code: holding.code,
        name: holding.name,
        qty: holding.qty,
        price: holding.price,
        source: directOrderContext ? "broker_sync_manual_direct_order" : "broker_sync",
        reconcileSource: reconcileContext.source,
        reconcileProfileId: reconcileContext.profileId,
        directOrderNote: directOrderContext?.note ?? null,
        directOrderMarket: directOrderContext?.market ?? null,
        directOrderProfileId: directOrderContext?.profileId ?? null,
      },
    });
    restored.push({ code: holding.code, name: holding.name, qty: holding.qty });
  }

  return restored;
}

type OpenPositionRow = {
  id: string;
  stock_code: string;
  stock_name?: string | null;
  entry_price?: number | string | null;
  entry_date?: string | null;
  entry_qty?: number | string | null;
  partial_exit_qty?: number | string | null;
  partial_exit_price?: number | string | null;
  phase?: string | null;
};

export async function reconcileBrokerPositionDrift(holdings: Array<Record<string, string>>): Promise<{
  qtyAdjusted: Array<{ code: string; name: string; fromQty: number; toQty: number }>;
  orphanedClosed: Array<{ code: string; name: string; qty: number }>;
}> {
  const activeHoldings = holdings.filter((holding) => Number(holding.hldg_qty) > 0);
  const brokerQtyEntries: Array<[string, { qty: number; name: string }]> = activeHoldings
    .map<[string, { qty: number; name: string }]>((holding) => [
      String(holding.pdno ?? ""),
      {
        qty: Number(holding.hldg_qty) || 0,
        name: String(holding.prdt_name ?? holding.pdno ?? ""),
      },
    ])
    .filter((entry): entry is [string, { qty: number; name: string }] => Boolean(entry[0]) && entry[1].qty > 0);
  const brokerQtyByCode = new Map<string, { qty: number; name: string }>(brokerQtyEntries);

  const { data: openPositions } = await supabase
    .from("positions")
    .select("id, stock_code, stock_name, entry_price, entry_date, entry_qty, partial_exit_qty, partial_exit_price, phase")
    .eq("status", "open");

  const rows = (openPositions ?? []) as OpenPositionRow[];
  const qtyAdjusted: Array<{ code: string; name: string; fromQty: number; toQty: number }> = [];
  const orphanedClosed: Array<{ code: string; name: string; qty: number }> = [];
  const reconcileContext = await loadActiveReconcileContext();

  for (const row of rows) {
    const code = String(row.stock_code ?? "");
    if (!code) continue;

    const remainingQty = getOpenPositionRemainingQty(row);
    const broker = brokerQtyByCode.get(code);
    if (broker && broker.qty > 0 && broker.qty !== remainingQty) {
      const currentEntryQty = Math.max(Number(row.entry_qty) || 0, remainingQty);
      const nextEntryQty = broker.qty > currentEntryQty ? broker.qty : currentEntryQty;
      const nextPartialQty = broker.qty >= currentEntryQty ? null : currentEntryQty - broker.qty;
      const payload = {
        entry_qty: nextEntryQty,
        partial_exit_qty: nextPartialQty,
        partial_exit_price: nextPartialQty ? (Number(row.partial_exit_price) || Number(row.entry_price) || null) : null,
        phase: nextPartialQty ? "partial_tp" : ((row.phase as string | null) ?? "initial"),
        updated_at: new Date().toISOString(),
      };
      await supabase.from("positions").update(payload).eq("id", row.id);
      await recordEngineEvent({
        eventType: "position_reconciled",
        stockCode: code,
        entityTable: "positions",
        entityId: row.id,
        payload: {
          action: "qty_adjusted",
          code,
          name: broker.name || String(row.stock_name ?? code),
          fromQty: remainingQty,
          toQty: broker.qty,
          source: reconcileContext.source,
          profileId: reconcileContext.profileId,
        },
      });
      qtyAdjusted.push({
        code,
        name: broker.name || String(row.stock_name ?? code),
        fromQty: remainingQty,
        toQty: broker.qty,
      });
      continue;
    }

    if (!broker && remainingQty > 0) {
      const holdDays = Math.max(1, Math.ceil((Date.now() - new Date(String(row.entry_date ?? new Date().toISOString())).getTime()) / 86400000));
      const entryPrice = Number(row.entry_price) || 0;
      const exitQty = remainingQty;
      const payload = buildPositionClosePayload({
        exitPrice: entryPrice,
        exitQty,
        exitReason: "reconcile_orphan",
        pnlAmount: 0,
        pnlPercent: 0,
        holdDays,
      });
      await supabase.from("positions").update(payload).eq("id", row.id);
      await closeTradeMemory(code, 0, 0, holdDays, "reconcile_orphan");
      await recordEngineEvent({
        eventType: "position_closed",
        stockCode: code,
        entityTable: "positions",
        entityId: row.id,
        payload: {
          ...payload,
          action: "orphan_closed",
          code,
          name: String(row.stock_name ?? code),
          source: reconcileContext.source,
          profileId: reconcileContext.profileId,
        },
      });
      orphanedClosed.push({
        code,
        name: String(row.stock_name ?? code),
        qty: exitQty,
      });
    }
  }

  return { qtyAdjusted, orphanedClosed };
}

async function loadRecentDirectOrderContext(codes: string[]): Promise<Map<string, RecentDirectOrderContext>> {
  if (codes.length === 0) return new Map();
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  try {
    const { data } = await supabase
      .from("engine_state_events")
      .select("stock_code, created_at, payload")
      .eq("event_type", "manual_buy_executed")
      .in("stock_code", codes)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });

    const contextMap = new Map<string, RecentDirectOrderContext>();
    for (const row of data ?? []) {
      const stockCode = String(row.stock_code ?? "");
      if (!stockCode || contextMap.has(stockCode)) continue;
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (payload.success === false) continue;
      contextMap.set(stockCode, {
        note: typeof payload.note === "string" && payload.note.trim().length > 0 ? payload.note.trim() : null,
        market: typeof payload.market === "string" ? payload.market : null,
        profileId: typeof payload.profileId === "string" ? payload.profileId : null,
        createdAt: String(row.created_at ?? ""),
      });
    }
    return contextMap;
  } catch {
    return new Map();
  }
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

export async function getTodayEntryCount(stockCode: string): Promise<number> {
  try {
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 9 * 3600000 + 86400000).toISOString().slice(0, 10);
    const { count } = await supabase
      .from("trade_memory")
      .select("id", { count: "exact", head: true })
      .eq("stock_code", stockCode)
      .gte("created_at", today)
      .lt("created_at", tomorrow);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function getLatestStopLossReference(stockCode: string): Promise<{ stopPrice: number; closedAt: string } | null> {
  try {
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data } = await supabase
      .from("trade_memory")
      .select("stop_price, closed_at")
      .eq("stock_code", stockCode)
      .eq("exit_reason", "stop_loss")
      .not("closed_at", "is", null)
      .gte("closed_at", cutoff)
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const stopPrice = Number(data?.stop_price) || 0;
    const closedAt = typeof data?.closed_at === "string" ? data.closed_at : "";
    if (!(stopPrice > 0) || !closedAt) return null;
    return { stopPrice, closedAt };
  } catch {
    return null;
  }
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
// [Supabase SQL Editor에서 실행] entry_tag 컬럼 추가
// ALTER TABLE pending_orders ADD COLUMN IF NOT EXISTS entry_tag text DEFAULT NULL;
// [Supabase SQL Editor에서 실행] signal_context 컬럼 추가
// ALTER TABLE pending_orders ADD COLUMN IF NOT EXISTS signal_context jsonb DEFAULT NULL;
export interface PendingOrder {
  id: string;
  stock_code: string;
  stock_name: string | null;
  order_no: string;
  order_qty: number;
  limit_price: number;
  signal_score: number | null;
  strategy_key: string | null;
  entry_tag?: string | null;
  signal_context?: Record<string, unknown> | null;
  created_at: string;
}

export const PENDING_ORDER_STALE_MINUTES = 30;

export async function savePendingOrder(params: {
  stock_code: string;
  stock_name?: string | null;
  order_no: string;
  order_qty: number;
  limit_price: number;
  signal_score?: number | null;
  strategy_key?: string | null;
  entry_tag?: string | null;
  signal_context?: Record<string, unknown> | null;
  pending_signal_id?: string | null;
  signal_source?: string | null;
}): Promise<void> {
  try {
    if (params.order_no) {
      const { data: existing } = await supabase.from("pending_orders")
        .select("id")
        .eq("order_no", params.order_no)
        .limit(1)
        .maybeSingle();
      if (existing?.id) return;
    }

    const signalContext = {
      ...(params.signal_context ?? {}),
      ...(params.pending_signal_id ? { pending_signal_id: params.pending_signal_id } : {}),
      ...(params.signal_source ? { signal_source: params.signal_source } : {}),
    };
    const payload = {
      stock_code: params.stock_code,
      stock_name: params.stock_name ?? null,
      order_no: params.order_no,
      order_qty: params.order_qty,
      limit_price: params.limit_price,
      signal_score: params.signal_score ?? null,
      strategy_key: params.strategy_key ?? null,
      entry_tag: params.entry_tag ?? null,
      signal_context: Object.keys(signalContext).length > 0 ? signalContext : null,
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

export async function resolvePendingOrder(params: {
  orderId: string;
  stockCode: string;
  stockName?: string | null;
  orderNo?: string;
  orderQty?: number | null;
  limitPrice?: number | null;
  signalContext?: Record<string, unknown> | null;
  createdAt?: string;
  resolution: "filled" | "timeout" | "stale_cleanup";
  detail?: string;
  cancelAttempted?: boolean;
  cancelSucceeded?: boolean;
  cancelDetail?: string | null;
}): Promise<void> {
  try {
    await supabase.from("pending_orders").delete().eq("id", params.orderId);
    const ageMinutes = params.createdAt
      ? Math.max(0, Math.round((Date.now() - new Date(params.createdAt).getTime()) / 60000))
      : null;
    await recordEngineEvent({
      eventType: "pending_order_deleted",
      stockCode: params.stockCode,
      entityTable: "pending_orders",
      entityId: params.orderId,
      payload: {
        deleted: true,
        resolution: params.resolution,
        detail: params.detail ?? null,
        order_no: params.orderNo ?? null,
        order_qty: params.orderQty ?? null,
        limit_price: params.limitPrice ?? null,
        stock_name: params.stockName ?? null,
        pending_signal_id: typeof params.signalContext?.pending_signal_id === "string" ? params.signalContext.pending_signal_id : null,
        signal_source: typeof params.signalContext?.signal_source === "string" ? params.signalContext.signal_source : null,
        signal_context: params.signalContext ?? null,
        age_minutes: ageMinutes,
        cancel_attempted: params.cancelAttempted ?? false,
        cancel_succeeded: params.cancelSucceeded ?? false,
        cancel_detail: params.cancelDetail ?? null,
      },
    });
  } catch { /* ignore */ }
}

// 30분 이상 경과한 pending_orders 일괄 삭제 (고립 상태 정리)
export async function cleanupStalePendingOrders(cutoffMinutes = PENDING_ORDER_STALE_MINUTES): Promise<{
  cleanedCount: number;
  cleanedOrders: Array<{ id: string; stock_code: string; stock_name: string | null }>;
}> {
  try {
    const cutoff = new Date(Date.now() - cutoffMinutes * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("pending_orders")
      .select("id, stock_code, stock_name, order_no, order_qty, limit_price, signal_context, created_at")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(20);
    const staleOrders = (data ?? []) as Array<PendingOrder>;
    for (const order of staleOrders) {
      await resolvePendingOrder({
        orderId: order.id,
        stockCode: order.stock_code,
        stockName: order.stock_name,
        orderNo: order.order_no,
        orderQty: order.order_qty,
        limitPrice: order.limit_price,
        signalContext: order.signal_context ?? null,
        createdAt: order.created_at,
        resolution: "stale_cleanup",
        detail: `엔진 시작 전 ${cutoffMinutes}분 초과 stale pending order 정리`,
      });
    }
    return {
      cleanedCount: staleOrders.length,
      cleanedOrders: staleOrders.map((order) => ({
        id: order.id,
        stock_code: order.stock_code,
        stock_name: order.stock_name,
      })),
    };
  } catch {
    return { cleanedCount: 0, cleanedOrders: [] };
  }
}
