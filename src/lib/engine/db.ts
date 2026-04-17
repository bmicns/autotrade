// ─── Supabase DB 헬퍼 함수 ───────────────────────
import { supabase } from "@/lib/supabase/api-client";
import { type SignalResult } from "@/lib/kis/indicators";



// ─── trade_memory 헬퍼 ──────────────────────────
export function extractCandlePattern(signal: SignalResult): string {
  const patternInd = signal.indicators.find((i) => i.name === "캔들패턴");
  return patternInd?.value ?? "없음";
}

// ─── Supabase 포지션 관리 ────────────────────────
export async function openPosition(code: string, name: string | null, price: number, qty: number, signal: SignalResult, phase: "initial" | "full") {
  try {
    await supabase.from("positions").insert({
      stock_code: code, stock_name: name,
      entry_price: price, entry_qty: qty,
      entry_signal: { indicators: signal.indicators, raw: signal.raw, matchCount: signal.matchCount, totalScore: signal.totalScore },
      signal_strength: signal.strength,
      phase, status: "open",
    });
  } catch { /* ignore */ }
}

export async function closePosition(code: string, exitPrice: number, exitQty: number, exitReason: string) {
  try {
    const { data } = await supabase.from("positions").select("*")
      .eq("stock_code", code).eq("status", "open")
      .order("entry_date", { ascending: true }).limit(1);
    if (!data || data.length === 0) return;
    const pos = data[0];
    const entryPrice = Number(pos.entry_price);
    const pnlAmount = (exitPrice - entryPrice) * exitQty;
    const pnlPercent = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
    const holdDays = Math.max(1, Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000));

    await supabase.from("positions").update({
      exit_price: exitPrice, exit_qty: exitQty,
      exit_date: new Date().toISOString(), exit_reason: exitReason,
      pnl_amount: Math.round(pnlAmount),
      pnl_percent: Math.round(pnlPercent * 100) / 100,
      hold_days: holdDays, status: "closed",
    }).eq("id", pos.id);
  } catch { /* ignore */ }
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
  exitReason: string
): Promise<void> {
  try {
    await supabase.from("trade_memory")
      .update({
        pnl_percent: Math.round(pnlPercent * 100) / 100,
        pnl_amount: Math.round(pnlAmount),
        hold_days: holdDays,
        exit_reason: exitReason,
        is_win: pnlAmount > 0,
        closed_at: new Date().toISOString(),
      })
      .eq("stock_code", code)
      .is("closed_at", null)
      .order("created_at", { ascending: false });
  } catch { /* ignore */ }
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
    const today = new Date().toISOString().slice(0, 10);
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
