import { parseMarketHolidays } from "./market-calendar";
import { normalizeStrategyAllocations, type StrategyAllocations } from "./strategies";
import { type EngineConfig } from "./types";

export const DEFAULT_ENGINE_CONFIG = {
  stopLoss: -5,
  takeProfit: 5,
  trailingStop: -3,
  maxPerTrade: 1_000_000,
  maxDailyTrades: 5,
  takeProfitRatio: 50,
  dailyLossLimit: -3,
  dynamicRisk: true,
  maxHoldDays: 5,
} as const;

export interface EngineHealthSnapshot {
  status: "healthy" | "stale" | "error" | "unknown";
  lastRunAt: string | null;
  minutesSinceLastRun: number | null;
}

export interface EngineControlSnapshot {
  engine_enabled: boolean;
  max_positions: number;
  max_per_sector: number;
  rsi_buy: number;
  rsi_sell: number;
  strong_score: number;
  weak_score: number;
  market_crash_threshold: number;
  market_holidays: string[];
  strategy_allocations: StrategyAllocations;
}

function readNumber(cfgMap: Map<string, unknown>, key: string, fallback: number): number {
  return cfgMap.has(key) ? Number(cfgMap.get(key)) : fallback;
}

export function readEngineControlSnapshot(cfgMap: Map<string, unknown>): EngineControlSnapshot {
  return {
    engine_enabled: !(cfgMap.get("engine_enabled") === false || cfgMap.get("engine_enabled") === "false"),
    max_positions: readNumber(cfgMap, "max_positions", 5) || 5,
    max_per_sector: readNumber(cfgMap, "max_per_sector", 2) || 2,
    rsi_buy: readNumber(cfgMap, "rsi_buy", 30),
    rsi_sell: readNumber(cfgMap, "rsi_sell", 70),
    strong_score: readNumber(cfgMap, "strong_score", 70),
    weak_score: readNumber(cfgMap, "weak_score", 40),
    market_crash_threshold: readNumber(cfgMap, "market_crash_threshold", -2),
    market_holidays: parseMarketHolidays(cfgMap.get("market_holidays")),
    strategy_allocations: normalizeStrategyAllocations({
      watchlist_pullback: cfgMap.get("strategy_alloc_watchlist_pullback"),
      surge_momentum: cfgMap.get("strategy_alloc_surge_momentum"),
      institutional_follow: cfgMap.get("strategy_alloc_institutional_follow"),
    }),
  };
}

export function applyEngineAppConfig(
  config: EngineConfig,
  cfgMap: Map<string, unknown>,
): {
  maxPositions: number;
  maxPerSector: number;
  strategyAllocations: StrategyAllocations;
} {
  if (cfgMap.has("stop_loss")) config.stopLoss = -Math.abs(Number(cfgMap.get("stop_loss")));
  if (cfgMap.has("take_profit")) config.takeProfit = Number(cfgMap.get("take_profit"));
  if (cfgMap.has("take_profit_ratio")) config.takeProfitRatio = Number(cfgMap.get("take_profit_ratio"));
  if (cfgMap.has("trailing_stop")) config.trailingStop = -Math.abs(Number(cfgMap.get("trailing_stop")));
  if (cfgMap.has("max_amount_per_trade")) config.maxPerTrade = Number(cfgMap.get("max_amount_per_trade")) * 10000;
  if (cfgMap.has("max_trades_per_day")) config.maxDailyTrades = Number(cfgMap.get("max_trades_per_day"));
  if (cfgMap.has("daily_loss_limit")) config.dailyLossLimit = -Math.abs(Number(cfgMap.get("daily_loss_limit")));
  if (cfgMap.has("max_hold_days")) config.maxHoldDays = Number(cfgMap.get("max_hold_days"));
  if (cfgMap.has("rsi_buy")) config.rsiBuy = Number(cfgMap.get("rsi_buy"));
  if (cfgMap.has("rsi_sell")) config.rsiSell = Number(cfgMap.get("rsi_sell"));
  if (cfgMap.has("strong_score")) config.strongScore = Number(cfgMap.get("strong_score"));
  if (cfgMap.has("weak_score")) config.weakScore = Number(cfgMap.get("weak_score"));
  if (cfgMap.has("market_crash_threshold")) config.marketCrashThreshold = Number(cfgMap.get("market_crash_threshold"));

  if (cfgMap.has("trending_rsi_buy") || cfgMap.has("trending_strong_score")) {
    config.trendingParams = {
      rsiBuy: Number(cfgMap.get("trending_rsi_buy") ?? config.rsiBuy ?? 30),
      rsiSell: Number(cfgMap.get("trending_rsi_sell") ?? config.rsiSell ?? 70),
      strongScore: Number(cfgMap.get("trending_strong_score") ?? config.strongScore ?? 70),
      weakScore: Number(cfgMap.get("trending_weak_score") ?? config.weakScore ?? 40),
    };
  }

  if (cfgMap.has("ranging_rsi_buy") || cfgMap.has("ranging_strong_score")) {
    config.rangingParams = {
      rsiBuy: Number(cfgMap.get("ranging_rsi_buy") ?? config.rsiBuy ?? 30),
      rsiSell: Number(cfgMap.get("ranging_rsi_sell") ?? config.rsiSell ?? 70),
      strongScore: Number(cfgMap.get("ranging_strong_score") ?? config.strongScore ?? 70),
      weakScore: Number(cfgMap.get("ranging_weak_score") ?? config.weakScore ?? 40),
    };
  }

  const control = readEngineControlSnapshot(cfgMap);
  return {
    maxPositions: control.max_positions,
    maxPerSector: control.max_per_sector,
    strategyAllocations: control.strategy_allocations,
  };
}

export function resolveEngineHealth(params: {
  lastRunAt: string | null;
  hasError: boolean;
  now?: Date;
  staleAfterMinutes?: number;
}): EngineHealthSnapshot {
  const now = params.now ?? new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600_000);
  const hhmm = kstNow.getUTCHours() * 100 + kstNow.getUTCMinutes();
  const weekday = kstNow.getUTCDay();
  const isMarketHours = weekday >= 1 && weekday <= 5 && hhmm >= 930 && hhmm <= 1520;
  const minutesSinceLastRun = params.lastRunAt
    ? Math.floor((now.getTime() - new Date(params.lastRunAt).getTime()) / 60_000)
    : null;

  const staleAfterMinutes = params.staleAfterMinutes ?? 120;
  const status =
    !params.lastRunAt ? "unknown"
    : params.hasError ? "error"
    : isMarketHours && minutesSinceLastRun !== null && minutesSinceLastRun > staleAfterMinutes ? "stale"
    : "healthy";

  return {
    status,
    lastRunAt: params.lastRunAt,
    minutesSinceLastRun,
  };
}
