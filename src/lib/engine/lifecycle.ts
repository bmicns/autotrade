import type { SignalRaw, SignalResult } from "@/lib/kis/indicators";
import type { StrategyKey } from "@/lib/engine/strategies";

export const POSITION_PHASES = ["initial", "full", "partial_tp", "final_tp"] as const;
export type PositionPhase = (typeof POSITION_PHASES)[number];

export const POSITION_STATUSES = ["open", "closed"] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];

export const PENDING_SIGNAL_STATUSES = [
  "pending",
  "approved",
  "processing",
  "expired",
  "rejected",
  "failed",
] as const;
export type PendingSignalStatus = (typeof PENDING_SIGNAL_STATUSES)[number];

export const CURRENT_POSITION_CLOSE_REASONS = [
  "stop_loss",
  "trailing_stop",
  "max_hold_sell",
  "orgn_flip_sell",
  "signal_rule_sell",
  "manual_sell",
  "reconcile_orphan",
] as const;

export const LEGACY_POSITION_CLOSE_REASONS = [
  "take_profit",
] as const;

export type PositionCloseReason =
  | (typeof CURRENT_POSITION_CLOSE_REASONS)[number]
  | (typeof LEGACY_POSITION_CLOSE_REASONS)[number];

export const HISTORICAL_CLOSE_TYPES = new Set<string>([
  ...CURRENT_POSITION_CLOSE_REASONS,
  ...LEGACY_POSITION_CLOSE_REASONS,
]);

export const CURRENT_SELL_ACTION_TYPES = new Set<string>(CURRENT_POSITION_CLOSE_REASONS);

export function resolveEntryPhase(existingPhase?: string | null): PositionPhase {
  if (existingPhase === "initial" || existingPhase === "partial_tp") return "full";
  return "initial";
}

export function resolveRecoveredEntryPhase(existingPhase?: string | null): PositionPhase {
  if (existingPhase === "partial_tp") return "full";
  if (existingPhase === "full") return "full";
  if (existingPhase === "final_tp") return "final_tp";
  return "initial";
}

export function canReenterPosition(existingPhase?: string | null): boolean {
  return existingPhase === "initial" || existingPhase === "partial_tp";
}

export function shouldAllowStopLossReentry(params: {
  currentPrice: number;
  stopPrice?: number | null;
  raw: Pick<SignalRaw, "ma5" | "ma20" | "ema5" | "ema20" | "macd" | "macdSignal" | "rsi">;
}): boolean {
  const stopPrice = Number(params.stopPrice) || 0;
  if (!(stopPrice > 0) || !(params.currentPrice > 0)) return false;

  const recoveredAboveStop = params.currentPrice >= stopPrice;
  const movingAverageRecovery = params.raw.ma5 > params.raw.ma20 && params.raw.ema5 >= params.raw.ema20;
  const momentumRecovery = params.raw.macd >= params.raw.macdSignal;
  const notOverheated = params.raw.rsi < 72;

  return recoveredAboveStop && movingAverageRecovery && momentumRecovery && notOverheated;
}

export function resolvePartialExitPhase(params: {
  currentPhase?: string | null;
  isSmallPosition: boolean;
}): { nextPhase: PositionPhase; phaseLabel: string } {
  if (params.isSmallPosition) {
    return { nextPhase: "final_tp", phaseLabel: "전량 트레일링 청산" };
  }
  if ((params.currentPhase ?? "initial") === "initial") {
    return { nextPhase: "partial_tp", phaseLabel: "1차 트레일링 청산" };
  }
  return { nextPhase: "final_tp", phaseLabel: "전량 트레일링 청산" };
}

export function buildPositionOpenPayload(params: {
  code: string;
  name: string | null;
  price: number;
  qty: number;
  signal: SignalResult;
  phase: PositionPhase;
  sector?: string;
}) {
  const strategySignal = params.signal as SignalResult & {
    strategyKey?: StrategyKey;
    allocationPct?: number;
    sourceStrategy?: string;
    entryTag?: string;
    newsKeywords?: string[];
    newsScore?: number;
    learningRiskEnabled?: boolean;
    directOrderNote?: string | null;
    directOrderMarket?: string | null;
    directOrderProfileId?: string | null;
  };

  return {
    stock_code: params.code,
    stock_name: params.name,
    entry_price: params.price,
    entry_qty: params.qty,
    entry_signal: {
      indicators: params.signal.indicators,
      raw: params.signal.raw,
      matchCount: params.signal.matchCount,
      totalScore: params.signal.totalScore,
      strategyKey: strategySignal.strategyKey ?? null,
      allocationPct: strategySignal.allocationPct ?? null,
      sourceStrategy: strategySignal.sourceStrategy ?? null,
      entryTag: strategySignal.entryTag ?? null,
      newsKeywords: strategySignal.newsKeywords ?? [],
      newsScore: strategySignal.newsScore ?? null,
      learningRiskEnabled: strategySignal.learningRiskEnabled ?? null,
      directOrderNote: strategySignal.directOrderNote ?? null,
      directOrderMarket: strategySignal.directOrderMarket ?? null,
      directOrderProfileId: strategySignal.directOrderProfileId ?? null,
    },
    signal_strength: params.signal.strength,
    phase: params.phase,
    status: "open" satisfies PositionStatus,
    sector: params.sector ?? null,
  };
}

export function buildPositionClosePayload(params: {
  exitPrice: number;
  exitQty: number;
  exitReason: PositionCloseReason;
  pnlAmount: number;
  pnlPercent: number;
  holdDays: number;
}) {
  return {
    exit_price: params.exitPrice,
    exit_qty: params.exitQty,
    exit_date: new Date().toISOString(),
    exit_reason: params.exitReason,
    pnl_amount: Math.round(params.pnlAmount),
    pnl_percent: Math.round(params.pnlPercent * 100) / 100,
    hold_days: params.holdDays,
    status: "closed" satisfies PositionStatus,
  };
}

export function buildPartialExitPayload(params: {
  price: number;
  qty: number;
  nextPhase: PositionPhase;
}) {
  return {
    partial_exit_price: params.price,
    partial_exit_qty: params.qty,
    phase: params.nextPhase,
    updated_at: new Date().toISOString(),
  };
}

export function buildTradeMemoryClosePayload(params: {
  pnlPercent: number;
  pnlAmount: number;
  holdDays: number;
  exitReason: PositionCloseReason;
}) {
  return {
    pnl_percent: Math.round(params.pnlPercent * 100) / 100,
    pnl_amount: Math.round(params.pnlAmount),
    hold_days: params.holdDays,
    exit_reason: params.exitReason,
    is_win: params.pnlAmount > 0,
    closed_at: new Date().toISOString(),
  };
}
