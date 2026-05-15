import { parseMarketHolidays, resolveEffectiveMarketWindows } from "./market-calendar";
import { normalizeStrategyAllocations, type StrategyAllocations } from "./strategies";
import { type EngineConfig } from "./types";

export const DEFAULT_ENGINE_CONFIG = {
  stopLoss: -2,
  trailingStop: -3,
  maxPerTrade: 1_000_000,
  maxDailyTrades: 5,
  partialExitRatio: 50,
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
  operator_display_name: string;
  max_positions: number;
  max_per_sector: number;
  stop_loss: number;
  trailing_stop: number;
  partial_exit_ratio: number;
  max_trades_per_day: number;
  daily_loss_limit: number;
  max_hold_days: number;
  morning_start: string;
  morning_end: string;
  afternoon_start: string;
  afternoon_end: string;
  rsi_buy: number;
  rsi_sell: number;
  strong_score: number;
  weak_score: number;
  sell_rule_sensitivity: number;
  market_crash_threshold: number;
  market_holidays: string[];
  strategy_allocations: StrategyAllocations;
  surge_max_daily_entries_per_stock: number;
  surge_reentry_buy_ratio: number;
  surge_trailing_partial_exit_ratio: number;
  surge_tight_stop_loss: number;
  surge_tight_trailing_stop: number;
  surge_open_bonus: number;
  surge_morning_bonus: number;
  surge_late_penalty: number;
  surge_reentry_cooldown_minutes: number;
  surge_news_positive_bonus: number;
  surge_news_negative_penalty: number;
  surge_news_risk_cooldown_minutes: number;
  learning_risk_adjustments_enabled: boolean;
  manual_us_buy_note_templates: string[];
  manual_us_sell_note_templates: string[];
}

function readNumber(cfgMap: Map<string, unknown>, key: string, fallback: number): number {
  return cfgMap.has(key) ? Number(cfgMap.get(key)) : fallback;
}

function readString(cfgMap: Map<string, unknown>, key: string, fallback: string): string {
  const raw = cfgMap.get(key);
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return trimmed || fallback;
}

function readStringList(cfgMap: Map<string, unknown>, key: string, fallback: string[]): string[] {
  const raw = cfgMap.get(key);
  if (!raw) return fallback;
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  if (typeof raw === "string") {
    return raw.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  }
  return fallback;
}

export function readEngineControlSnapshot(cfgMap: Map<string, unknown>): EngineControlSnapshot {
  const marketWindows = resolveEffectiveMarketWindows(cfgMap);
  return {
    engine_enabled: !(cfgMap.get("engine_enabled") === false || cfgMap.get("engine_enabled") === "false"),
    operator_display_name: readString(
      cfgMap,
      "operator_display_name",
      process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim() || process.env.ADMIN_ID?.trim() || "운영자",
    ),
    max_positions: readNumber(cfgMap, "max_positions", 5) || 5,
    max_per_sector: readNumber(cfgMap, "max_per_sector", 2) || 2,
    stop_loss: readNumber(cfgMap, "stop_loss", Math.abs(DEFAULT_ENGINE_CONFIG.stopLoss)),
    trailing_stop: readNumber(cfgMap, "trailing_stop", Math.abs(DEFAULT_ENGINE_CONFIG.trailingStop)),
    partial_exit_ratio: readNumber(cfgMap, "partial_exit_ratio", DEFAULT_ENGINE_CONFIG.partialExitRatio),
    max_trades_per_day: readNumber(cfgMap, "max_trades_per_day", DEFAULT_ENGINE_CONFIG.maxDailyTrades),
    daily_loss_limit: readNumber(cfgMap, "daily_loss_limit", Math.abs(DEFAULT_ENGINE_CONFIG.dailyLossLimit)),
    max_hold_days: readNumber(cfgMap, "max_hold_days", DEFAULT_ENGINE_CONFIG.maxHoldDays),
    morning_start: marketWindows.morningStart,
    morning_end: marketWindows.morningEnd,
    afternoon_start: marketWindows.afternoonStart,
    afternoon_end: marketWindows.afternoonEnd,
    rsi_buy: readNumber(cfgMap, "rsi_buy", 30),
    rsi_sell: readNumber(cfgMap, "rsi_sell", 70),
    strong_score: readNumber(cfgMap, "strong_score", 70),
    weak_score: readNumber(cfgMap, "weak_score", 40),
    sell_rule_sensitivity: readNumber(cfgMap, "sell_rule_sensitivity", 5),
    market_crash_threshold: readNumber(cfgMap, "market_crash_threshold", -2),
    market_holidays: parseMarketHolidays(cfgMap.get("market_holidays")),
    strategy_allocations: normalizeStrategyAllocations({
      watchlist_pullback: cfgMap.get("strategy_alloc_watchlist_pullback"),
      surge_momentum: cfgMap.get("strategy_alloc_surge_momentum"),
      institutional_follow: cfgMap.get("strategy_alloc_institutional_follow"),
    }),
    surge_max_daily_entries_per_stock: readNumber(cfgMap, "surge_max_daily_entries_per_stock", 4),
    surge_reentry_buy_ratio: readNumber(cfgMap, "surge_reentry_buy_ratio", 0.7),
    surge_trailing_partial_exit_ratio: readNumber(cfgMap, "surge_trailing_partial_exit_ratio", 35),
    surge_tight_stop_loss: readNumber(cfgMap, "surge_tight_stop_loss", 2.8),
    surge_tight_trailing_stop: readNumber(cfgMap, "surge_tight_trailing_stop", 1.4),
    surge_open_bonus: readNumber(cfgMap, "surge_open_bonus", 8),
    surge_morning_bonus: readNumber(cfgMap, "surge_morning_bonus", 4),
    surge_late_penalty: readNumber(cfgMap, "surge_late_penalty", 6),
    surge_reentry_cooldown_minutes: readNumber(cfgMap, "surge_reentry_cooldown_minutes", 18),
    surge_news_positive_bonus: readNumber(cfgMap, "surge_news_positive_bonus", 8),
    surge_news_negative_penalty: readNumber(cfgMap, "surge_news_negative_penalty", 8),
    surge_news_risk_cooldown_minutes: readNumber(cfgMap, "surge_news_risk_cooldown_minutes", 90),
    learning_risk_adjustments_enabled: !(cfgMap.get("learning_risk_adjustments_enabled") === false || cfgMap.get("learning_risk_adjustments_enabled") === "false"),
    manual_us_buy_note_templates: readStringList(cfgMap, "manual_us_buy_note_templates", ["선캐치", "재진입", "뉴스반응", "눌림목", "분할진입"]),
    manual_us_sell_note_templates: readStringList(cfgMap, "manual_us_sell_note_templates", ["익절", "리스크축소", "비중축소", "뉴스대응", "수동정리"]),
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
  if (cfgMap.has("partial_exit_ratio")) config.partialExitRatio = Number(cfgMap.get("partial_exit_ratio"));
  else if (cfgMap.has("take_profit_ratio")) config.partialExitRatio = Number(cfgMap.get("take_profit_ratio"));
  if (cfgMap.has("trailing_stop")) config.trailingStop = -Math.abs(Number(cfgMap.get("trailing_stop")));
  if (cfgMap.has("max_amount_per_trade")) config.maxPerTrade = Number(cfgMap.get("max_amount_per_trade")) * 10000;
  if (cfgMap.has("max_trades_per_day")) config.maxDailyTrades = Number(cfgMap.get("max_trades_per_day"));
  if (cfgMap.has("daily_loss_limit")) config.dailyLossLimit = -Math.abs(Number(cfgMap.get("daily_loss_limit")));
  if (cfgMap.has("max_hold_days")) config.maxHoldDays = Number(cfgMap.get("max_hold_days"));
  if (cfgMap.has("rsi_buy")) config.rsiBuy = Number(cfgMap.get("rsi_buy"));
  if (cfgMap.has("rsi_sell")) config.rsiSell = Number(cfgMap.get("rsi_sell"));
  if (cfgMap.has("strong_score")) config.strongScore = Number(cfgMap.get("strong_score"));
  if (cfgMap.has("weak_score")) config.weakScore = Number(cfgMap.get("weak_score"));
  if (cfgMap.has("sell_rule_sensitivity")) config.sellRuleSensitivity = Number(cfgMap.get("sell_rule_sensitivity"));
  if (cfgMap.has("market_crash_threshold")) config.marketCrashThreshold = Number(cfgMap.get("market_crash_threshold"));
  if (cfgMap.has("surge_max_daily_entries_per_stock")) config.surgeMaxDailyEntriesPerStock = Number(cfgMap.get("surge_max_daily_entries_per_stock"));
  if (cfgMap.has("surge_reentry_buy_ratio")) config.surgeReentryBuyRatio = Number(cfgMap.get("surge_reentry_buy_ratio"));
  if (cfgMap.has("surge_trailing_partial_exit_ratio")) config.surgeTrailingPartialExitRatio = Number(cfgMap.get("surge_trailing_partial_exit_ratio"));
  if (cfgMap.has("surge_tight_stop_loss")) config.surgeTightStopLoss = -Math.abs(Number(cfgMap.get("surge_tight_stop_loss")));
  if (cfgMap.has("surge_tight_trailing_stop")) config.surgeTightTrailingStop = -Math.abs(Number(cfgMap.get("surge_tight_trailing_stop")));
  if (cfgMap.has("surge_open_bonus")) config.surgeOpenBonus = Number(cfgMap.get("surge_open_bonus"));
  if (cfgMap.has("surge_morning_bonus")) config.surgeMorningBonus = Number(cfgMap.get("surge_morning_bonus"));
  if (cfgMap.has("surge_late_penalty")) config.surgeLatePenalty = Number(cfgMap.get("surge_late_penalty"));
  if (cfgMap.has("surge_reentry_cooldown_minutes")) config.surgeReentryCooldownMinutes = Number(cfgMap.get("surge_reentry_cooldown_minutes"));
  if (cfgMap.has("surge_news_positive_bonus")) config.surgeNewsPositiveBonus = Number(cfgMap.get("surge_news_positive_bonus"));
  if (cfgMap.has("surge_news_negative_penalty")) config.surgeNewsNegativePenalty = Number(cfgMap.get("surge_news_negative_penalty"));
  if (cfgMap.has("surge_news_risk_cooldown_minutes")) config.surgeNewsRiskCooldownMinutes = Number(cfgMap.get("surge_news_risk_cooldown_minutes"));
  if (cfgMap.has("learning_risk_adjustments_enabled")) config.learningRiskAdjustmentsEnabled = !(cfgMap.get("learning_risk_adjustments_enabled") === false || cfgMap.get("learning_risk_adjustments_enabled") === "false");

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
