import type { MinuteCandle } from "./intraday";
import type { KISPriceOutput } from "./types";
import type { StrategyKey } from "./strategies";
import {
  MAX_DAILY_ENTRIES_PER_STOCK,
  SURGE_MAX_DAILY_ENTRIES_PER_STOCK,
  SURGE_REENTRY_BUY_RATIO,
  SURGE_TRAILING_PARTIAL_EXIT_RATIO,
  SURGE_TIGHT_STOP_LOSS,
  SURGE_TIGHT_TRAILING_STOP,
} from "./constants";

function sortMinuteCandles(candles: MinuteCandle[]): MinuteCandle[] {
  return [...candles].sort((a, b) => a.time.localeCompare(b.time));
}

function calcAverageVolume(candles: MinuteCandle[]): number {
  if (candles.length === 0) return 0;
  return candles.reduce((sum, candle) => sum + candle.volume, 0) / candles.length;
}

function resolveTradingHour(now: Date): number {
  return now.getHours();
}

export function getPerStockEntryLimit(strategyKey?: StrategyKey | null): number {
  return strategyKey === "surge_momentum" ? SURGE_MAX_DAILY_ENTRIES_PER_STOCK : MAX_DAILY_ENTRIES_PER_STOCK;
}

export function resolveConfiguredPerStockEntryLimit(strategyKey?: StrategyKey | null, configured?: number | null): number {
  if (strategyKey !== "surge_momentum") return MAX_DAILY_ENTRIES_PER_STOCK;
  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed >= 2 ? Math.floor(parsed) : SURGE_MAX_DAILY_ENTRIES_PER_STOCK;
}

export function resolveSurgeBuyRatio(existingPhase?: string | null, configured?: number | null): number {
  const parsed = Number(configured);
  const reentryBuyRatio = Number.isFinite(parsed) && parsed > 0 ? parsed : SURGE_REENTRY_BUY_RATIO;
  return existingPhase === "partial_tp" ? reentryBuyRatio : 0.5;
}

export function resolveSurgeIntradayEdge(
  now = new Date(),
  overrides?: { openBonus?: number | null; morningBonus?: number | null; latePenalty?: number | null },
): { bonus: number; allowFreshEntry: boolean; label: string } {
  const hour = resolveTradingHour(now);
  const openBonus = Number.isFinite(Number(overrides?.openBonus)) ? Number(overrides?.openBonus) : 8;
  const morningBonus = Number.isFinite(Number(overrides?.morningBonus)) ? Number(overrides?.morningBonus) : 4;
  const latePenalty = Number.isFinite(Number(overrides?.latePenalty)) ? Number(overrides?.latePenalty) : 6;
  if (hour <= 9) {
    return { bonus: openBonus, allowFreshEntry: true, label: "장초반 우대" };
  }
  if (hour <= 11) {
    return { bonus: morningBonus, allowFreshEntry: true, label: "오전 모멘텀" };
  }
  if (hour >= 15) {
    return { bonus: -latePenalty, allowFreshEntry: false, label: "장마감 신규진입 보수화" };
  }
  return { bonus: 0, allowFreshEntry: true, label: "" };
}

export function resolveSurgeReentryCooldown(params: {
  existingPhase?: string | null;
  entryDate?: string | null;
  now?: Date;
  cooldownMinutes?: number;
}): { blocked: boolean; remainingMinutes: number } {
  if (params.existingPhase !== "partial_tp" || !params.entryDate) {
    return { blocked: false, remainingMinutes: 0 };
  }
  const now = params.now ?? new Date();
  const cooldownMinutes = Number.isFinite(Number(params.cooldownMinutes)) && Number(params.cooldownMinutes) > 0
    ? Number(params.cooldownMinutes)
    : 18;
  const elapsedMinutes = (now.getTime() - new Date(params.entryDate).getTime()) / 60000;
  const remainingMinutes = Math.max(0, Math.ceil(cooldownMinutes - elapsedMinutes));
  return { blocked: remainingMinutes > 0, remainingMinutes };
}

export function resolveSurgeNewsRiskCooldown(params: {
  publishedAts: Array<string | null | undefined>;
  now?: Date;
  cooldownMinutes?: number;
}): { blocked: boolean; remainingMinutes: number } {
  const timestamps = params.publishedAts
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) {
    return { blocked: false, remainingMinutes: 0 };
  }
  const now = params.now ?? new Date();
  const latestTs = Math.max(...timestamps);
  const cooldownMinutes = Number.isFinite(Number(params.cooldownMinutes)) && Number(params.cooldownMinutes) > 0
    ? Number(params.cooldownMinutes)
    : 90;
  const elapsedMinutes = (now.getTime() - latestTs) / 60000;
  const remainingMinutes = Math.max(0, Math.ceil(cooldownMinutes - elapsedMinutes));
  return { blocked: remainingMinutes > 0, remainingMinutes };
}

export function resolveSurgeRiskConfig(
  baseStopLoss: number,
  baseTrailingStop: number,
  overrides?: { partialExitRatio?: number | null; stopLoss?: number | null; trailingStop?: number | null },
) {
  const configuredPartialExitRatio = Number(overrides?.partialExitRatio);
  const configuredStopLoss = Number(overrides?.stopLoss);
  const configuredTrailingStop = Number(overrides?.trailingStop);
  return {
    stopLoss: Math.max(baseStopLoss, Number.isFinite(configuredStopLoss) ? configuredStopLoss : SURGE_TIGHT_STOP_LOSS),
    trailingStop: Math.max(baseTrailingStop, Number.isFinite(configuredTrailingStop) ? configuredTrailingStop : SURGE_TIGHT_TRAILING_STOP),
    partialExitRatio: Number.isFinite(configuredPartialExitRatio) ? configuredPartialExitRatio : SURGE_TRAILING_PARTIAL_EXIT_RATIO,
  };
}

export function evaluateSurgeEarlyEntry(params: {
  minuteCandles: MinuteCandle[];
  priceData: KISPriceOutput | null | undefined;
}): { bonus: number; earlyEntry: boolean; reasons: string[] } {
  const candles = sortMinuteCandles(params.minuteCandles).filter((candle) => candle.close > 0 && candle.volume > 0);
  const priceData = params.priceData ?? {};
  const reasons: string[] = [];
  let bonus = 0;

  if (candles.length < 6) {
    return { bonus, earlyEntry: false, reasons };
  }

  const recent = candles.slice(-3);
  const prior = candles.slice(-6, -3);
  const last = recent[recent.length - 1];
  const first = recent[0];
  const intradayReturnPct = first.close > 0 ? ((last.close - first.close) / first.close) * 100 : 0;
  const avgRecentVolume = calcAverageVolume(recent);
  const avgPriorVolume = calcAverageVolume(prior);
  const volumeAcceleration = avgPriorVolume > 0 ? avgRecentVolume / avgPriorVolume : 1;
  const priorHigh = Math.max(...prior.map((candle) => candle.high));
  const breakout = priorHigh > 0 && last.close >= priorHigh * 0.998;
  const openPrice = Number(priceData.stck_oprc) || 0;
  const currentPrice = Number(priceData.stck_prpr) || last.close || 0;
  const openMovePct = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0;

  if (intradayReturnPct >= 1.2) {
    bonus += 8;
    reasons.push(`3분 모멘텀 ${intradayReturnPct.toFixed(1)}%`);
  }
  if (volumeAcceleration >= 1.8) {
    bonus += 8;
    reasons.push(`체결량 가속 x${volumeAcceleration.toFixed(1)}`);
  }
  if (breakout) {
    bonus += 10;
    reasons.push("직전 고점 재돌파");
  }
  if (openMovePct >= 2.0) {
    bonus += 6;
    reasons.push(`시가 대비 +${openMovePct.toFixed(1)}%`);
  }

  const earlyEntry = breakout && intradayReturnPct >= 0.8 && volumeAcceleration >= 1.4;
  return { bonus, earlyEntry, reasons };
}
