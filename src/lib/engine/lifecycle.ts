import type { SignalResult } from "@/lib/kis/indicators";
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

export const POSITION_CLOSE_REASONS = [
  "stop_loss",
  "take_profit",
  "trailing_stop",
  "max_hold_sell",
  "orgn_flip_sell",
  "manual_sell",
] as const;
export type PositionCloseReason = (typeof POSITION_CLOSE_REASONS)[number];

export const STATS_CLOSE_TYPES = new Set<string>(POSITION_CLOSE_REASONS);

export function resolveEntryPhase(existingPhase?: string | null): PositionPhase {
  return existingPhase === "initial" ? "full" : "initial";
}

export function resolveEntryBuyRatio(existingPhase?: string | null): number {
  return existingPhase === "initial" ? 1 : 0.5;
}

export function isFinalTakeProfitPhase(phase?: string | null): boolean {
  return phase === "final_tp";
}

export function resolvePartialExitPhase(params: {
  currentPhase?: string | null;
  isSmallPosition: boolean;
}): { nextPhase: PositionPhase; phaseLabel: string } {
  if (params.isSmallPosition) {
    return { nextPhase: "final_tp", phaseLabel: "전량 익절" };
  }
  if ((params.currentPhase ?? "initial") === "initial") {
    return { nextPhase: "partial_tp", phaseLabel: "1차 익절" };
  }
  return { nextPhase: "final_tp", phaseLabel: "2차 익절" };
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

