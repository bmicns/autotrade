import { supabase } from "@/lib/supabase/api-client";
import { recordTradeMemory, savePendingOrder } from "@/lib/engine/db";
import { sendTradeAlert } from "@/lib/engine/notify";
import type { StrategyKey } from "@/lib/engine/strategies";
import type { MarketTrend, OrderResult, StepContext } from "@/lib/engine/types";
import type { SignalResult } from "@/lib/kis/indicators";

export function sleepRateLimit(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function joinBonusTags(tags: Array<string | null | undefined>): string {
  return tags.filter(Boolean).join(" ");
}

export async function recordSuccessfulEntry(params: {
  ctx: StepContext;
  code: string;
  name: string;
  qty: number;
  result: OrderResult & { limitPrice: number };
  adjustedScore: number;
  strategyKey: StrategyKey;
  marketTrend: MarketTrend;
  baseSignal: SignalResult;
  learnedSignal: SignalResult;
  bonuses: { market: number; investor: number; snapshot: number };
}) {
  void params.marketTrend;
  await savePendingOrder({
    stock_code: params.code,
    stock_name: params.name,
    order_no: params.result.ordNo ?? "",
    order_qty: params.qty,
    limit_price: params.result.limitPrice,
    signal_score: params.adjustedScore,
    strategy_key: params.strategyKey,
  });
  await sendTradeAlert({
    type: params.strategyKey === "surge_momentum" ? "surge_buy" : "buy",
    code: params.code,
    name: params.name,
    qty: params.qty,
    price: params.result.limitPrice,
    score: params.adjustedScore,
    strategyKey: params.strategyKey,
    regime: params.learnedSignal.raw.regime,
  });
  await recordTradeMemory({
    code: params.code,
    name: params.name,
    baseSignal: params.baseSignal,
    learnedSignal: params.learnedSignal,
    bonuses: params.bonuses,
    adjustedScore: params.adjustedScore,
    weightsSource: params.ctx.customWeights ? "learned" : "default",
    positionSize: params.qty * params.result.limitPrice,
    entryPrice: params.result.limitPrice,
    stopLossPct: params.ctx.config.stopLoss,
    takeProfitPct: params.ctx.config.takeProfit,
  });
}

export async function queuePendingSignal(params: {
  code: string;
  name: string;
  score: number;
  comment: string;
  signal: SignalResult;
  source: string;
  strategyKey: StrategyKey;
  allocationPct: number;
  openingBonus?: number;
  institutionalBonus?: number;
}) {
  try {
    await supabase.from("pending_signals").insert({
      stock_code: params.code,
      stock_name: params.name,
      signal_score: params.score,
      signal_comment: params.comment,
      signal_data: {
        indicators: params.signal.indicators,
        raw: params.signal.raw,
        matchCount: params.signal.matchCount,
        openingBonus: params.openingBonus,
        institutionalBonus: params.institutionalBonus,
        strategyKey: params.strategyKey,
        allocationPct: params.allocationPct,
      },
      source: params.source,
      status: "pending",
    });
  } catch {
    // Ignore queue failures.
  }
}
