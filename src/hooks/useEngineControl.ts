"use client";

import { useState, useCallback } from "react";
import type { SignalThresholds } from "@/components/strategy/signal-edit-sheet";
import { useAppStore, type TradeSettings } from "@/lib/store";

interface StrategyAllocations {
  watchlist_pullback: number;
  surge_momentum: number;
  institutional_follow: number;
}

interface SurgeSettings {
  maxDailyEntriesPerStock: number;
  reentryBuyRatio: number;
  trailingPartialExitRatio: number;
  tightStopLoss: number;
  tightTrailingStop: number;
  openBonus: number;
  morningBonus: number;
  latePenalty: number;
  reentryCooldownMinutes: number;
  newsPositiveBonus: number;
  newsNegativePenalty: number;
  newsRiskCooldownMinutes: number;
  learningRiskAdjustmentsEnabled: boolean;
  manualUsBuyNoteTemplates: string[];
  manualUsSellNoteTemplates: string[];
}

const DEFAULT_THRESHOLDS: SignalThresholds = { rsiBuy: 30, rsiSell: 70, strongScore: 70, weakScore: 40 };
const DEFAULT_ALLOCATIONS: StrategyAllocations = { watchlist_pullback: 20, surge_momentum: 40, institutional_follow: 40 };
const DEFAULT_SURGE_SETTINGS: SurgeSettings = {
  maxDailyEntriesPerStock: 4,
  reentryBuyRatio: 0.7,
  trailingPartialExitRatio: 35,
  tightStopLoss: 2.8,
  tightTrailingStop: 1.4,
  openBonus: 8,
  morningBonus: 4,
  latePenalty: 6,
  reentryCooldownMinutes: 18,
  newsPositiveBonus: 8,
  newsNegativePenalty: 8,
  newsRiskCooldownMinutes: 90,
  learningRiskAdjustmentsEnabled: true,
  manualUsBuyNoteTemplates: ["선캐치", "재진입", "뉴스반응", "눌림목", "분할진입"],
  manualUsSellNoteTemplates: ["익절", "리스크축소", "비중축소", "뉴스대응", "수동정리"],
};
const DEFAULT_TRADE_SETTINGS: TradeSettings = {
  maxTradesPerDay: 5,
  stopLoss: 5,
  trailingStop: 3,
  dailyLossLimit: 3,
  maxHoldDays: 5,
  morningStart: "09:30",
  morningEnd: "11:30",
  afternoonStart: "13:00",
  afternoonEnd: "14:50",
};

export function useEngineControl() {
  const [thresholds, setThresholds] = useState<SignalThresholds>(DEFAULT_THRESHOLDS);
  const [sellRuleSensitivity, setSellRuleSensitivity] = useState(5);
  const [allocations, setAllocations] = useState<StrategyAllocations>(DEFAULT_ALLOCATIONS);
  const [surgeSettings, setSurgeSettings] = useState<SurgeSettings>(DEFAULT_SURGE_SETTINGS);
  const [holidays, setHolidays] = useState("");
  const [loaded, setLoaded] = useState(false);
  const syncTradeSettings = useAppStore((s) => s.setTradeSettings);

  const fetchEngineControl = useCallback(async () => {
    try {
      const d = await fetch("/api/engine-control").then((r) => r.json());
      setThresholds({
        rsiBuy:      d.rsi_buy      ?? DEFAULT_THRESHOLDS.rsiBuy,
        rsiSell:     d.rsi_sell     ?? DEFAULT_THRESHOLDS.rsiSell,
        strongScore: d.strong_score ?? DEFAULT_THRESHOLDS.strongScore,
        weakScore:   d.weak_score   ?? DEFAULT_THRESHOLDS.weakScore,
      });
      setSellRuleSensitivity(d.sell_rule_sensitivity ?? 5);
      setAllocations({
        watchlist_pullback:   d.strategy_allocations?.watchlist_pullback   ?? DEFAULT_ALLOCATIONS.watchlist_pullback,
        surge_momentum:       d.strategy_allocations?.surge_momentum       ?? DEFAULT_ALLOCATIONS.surge_momentum,
        institutional_follow: d.strategy_allocations?.institutional_follow ?? DEFAULT_ALLOCATIONS.institutional_follow,
      });
      setHolidays(Array.isArray(d.market_holidays) ? d.market_holidays.join("\n") : "");
      setSurgeSettings({
        maxDailyEntriesPerStock: d.surge_max_daily_entries_per_stock ?? DEFAULT_SURGE_SETTINGS.maxDailyEntriesPerStock,
        reentryBuyRatio: d.surge_reentry_buy_ratio ?? DEFAULT_SURGE_SETTINGS.reentryBuyRatio,
        trailingPartialExitRatio: d.surge_trailing_partial_exit_ratio ?? DEFAULT_SURGE_SETTINGS.trailingPartialExitRatio,
        tightStopLoss: d.surge_tight_stop_loss ?? DEFAULT_SURGE_SETTINGS.tightStopLoss,
        tightTrailingStop: d.surge_tight_trailing_stop ?? DEFAULT_SURGE_SETTINGS.tightTrailingStop,
        openBonus: d.surge_open_bonus ?? DEFAULT_SURGE_SETTINGS.openBonus,
        morningBonus: d.surge_morning_bonus ?? DEFAULT_SURGE_SETTINGS.morningBonus,
        latePenalty: d.surge_late_penalty ?? DEFAULT_SURGE_SETTINGS.latePenalty,
        reentryCooldownMinutes: d.surge_reentry_cooldown_minutes ?? DEFAULT_SURGE_SETTINGS.reentryCooldownMinutes,
        newsPositiveBonus: d.surge_news_positive_bonus ?? DEFAULT_SURGE_SETTINGS.newsPositiveBonus,
        newsNegativePenalty: d.surge_news_negative_penalty ?? DEFAULT_SURGE_SETTINGS.newsNegativePenalty,
        newsRiskCooldownMinutes: d.surge_news_risk_cooldown_minutes ?? DEFAULT_SURGE_SETTINGS.newsRiskCooldownMinutes,
        learningRiskAdjustmentsEnabled: d.learning_risk_adjustments_enabled ?? DEFAULT_SURGE_SETTINGS.learningRiskAdjustmentsEnabled,
        manualUsBuyNoteTemplates: Array.isArray(d.manual_us_buy_note_templates) ? d.manual_us_buy_note_templates : DEFAULT_SURGE_SETTINGS.manualUsBuyNoteTemplates,
        manualUsSellNoteTemplates: Array.isArray(d.manual_us_sell_note_templates) ? d.manual_us_sell_note_templates : DEFAULT_SURGE_SETTINGS.manualUsSellNoteTemplates,
      });
      syncTradeSettings({
        maxTradesPerDay: d.max_trades_per_day ?? DEFAULT_TRADE_SETTINGS.maxTradesPerDay,
        stopLoss: d.stop_loss ?? DEFAULT_TRADE_SETTINGS.stopLoss,
        trailingStop: d.trailing_stop ?? DEFAULT_TRADE_SETTINGS.trailingStop,
        dailyLossLimit: d.daily_loss_limit ?? DEFAULT_TRADE_SETTINGS.dailyLossLimit,
        maxHoldDays: d.max_hold_days ?? DEFAULT_TRADE_SETTINGS.maxHoldDays,
        morningStart: d.morning_start ?? DEFAULT_TRADE_SETTINGS.morningStart,
        morningEnd: d.morning_end ?? DEFAULT_TRADE_SETTINGS.morningEnd,
        afternoonStart: d.afternoon_start ?? DEFAULT_TRADE_SETTINGS.afternoonStart,
        afternoonEnd: d.afternoon_end ?? DEFAULT_TRADE_SETTINGS.afternoonEnd,
      });
    } catch { /* ignore */ }
    setLoaded(true);
  }, [syncTradeSettings]);

  return { thresholds, setThresholds, sellRuleSensitivity, setSellRuleSensitivity, allocations, surgeSettings, setSurgeSettings, holidays, loaded, fetchEngineControl };
}
