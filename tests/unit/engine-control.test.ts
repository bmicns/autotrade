import test from "node:test";
import assert from "node:assert/strict";

import { applyEngineAppConfig, readEngineControlSnapshot } from "../../src/lib/engine/control";
import type { EngineConfig } from "../../src/lib/engine/types";

test("readEngineControlSnapshot normalizes defaults and allocations", () => {
  const cfgMap = new Map<string, unknown>([
    ["engine_enabled", "false"],
    ["strategy_alloc_watchlist_pullback", 80],
    ["strategy_alloc_surge_momentum", 20],
    ["strategy_alloc_institutional_follow", 0],
    ["market_holidays", "2026-05-05,2026-06-06"],
    ["surge_max_daily_entries_per_stock", 4],
    ["surge_reentry_buy_ratio", 0.75],
    ["surge_open_bonus", 9],
    ["surge_reentry_cooldown_minutes", 25],
    ["surge_news_positive_bonus", 10],
    ["surge_news_negative_penalty", 7],
    ["surge_news_risk_cooldown_minutes", 120],
  ]);

  const snapshot = readEngineControlSnapshot(cfgMap);
  assert.equal(snapshot.engine_enabled, false);
  assert.equal(snapshot.max_positions, 5);
  assert.equal(snapshot.stop_loss, 2);
  assert.equal(snapshot.trailing_stop, 3);
  assert.equal(snapshot.max_trades_per_day, 5);
  assert.equal(snapshot.morning_start, "09:00");
  assert.equal(snapshot.morning_end, "15:20");
  assert.deepEqual(snapshot.market_holidays, ["2026-05-05", "2026-06-06"]);
  assert.deepEqual(snapshot.strategy_allocations, {
    watchlist_pullback: 80,
    surge_momentum: 20,
    institutional_follow: 0,
  });
  assert.equal(snapshot.surge_max_daily_entries_per_stock, 4);
  assert.equal(snapshot.surge_reentry_buy_ratio, 0.75);
  assert.equal(snapshot.surge_open_bonus, 9);
  assert.equal(snapshot.surge_reentry_cooldown_minutes, 25);
  assert.equal(snapshot.surge_news_positive_bonus, 10);
  assert.equal(snapshot.surge_news_negative_penalty, 7);
  assert.equal(snapshot.surge_news_risk_cooldown_minutes, 120);
});

test("applyEngineAppConfig mutates engine config and returns parsed limits", () => {
  const config: EngineConfig = {
    appKey: "a",
    appSecret: "b",
    accountNo: "1234567801",
    token: "t",
    stopLoss: -2,
    trailingStop: -3,
    maxPerTrade: 1_000_000,
    maxDailyTrades: 5,
    partialExitRatio: 50,
    dailyLossLimit: -3,
    dynamicRisk: true,
    maxHoldDays: 5,
  };
  const cfgMap = new Map<string, unknown>([
    ["stop_loss", 4],
    ["partial_exit_ratio", 35],
    ["max_amount_per_trade", 250],
    ["max_positions", 7],
    ["max_per_sector", 3],
    ["surge_tight_stop_loss", 2.8],
    ["surge_tight_trailing_stop", 1.4],
    ["surge_open_bonus", 9],
    ["surge_reentry_cooldown_minutes", 25],
    ["surge_news_positive_bonus", 10],
    ["surge_news_negative_penalty", 7],
    ["surge_news_risk_cooldown_minutes", 120],
  ]);

  const result = applyEngineAppConfig(config, cfgMap);
  assert.equal(config.stopLoss, -4);
  assert.equal(config.partialExitRatio, 35);
  assert.equal(config.maxPerTrade, 2_500_000);
  assert.equal(config.surgeTightStopLoss, -2.8);
  assert.equal(config.surgeTightTrailingStop, -1.4);
  assert.equal(config.surgeOpenBonus, 9);
  assert.equal(config.surgeReentryCooldownMinutes, 25);
  assert.equal(config.surgeNewsPositiveBonus, 10);
  assert.equal(config.surgeNewsNegativePenalty, 7);
  assert.equal(config.surgeNewsRiskCooldownMinutes, 120);
  assert.equal(result.maxPositions, 7);
  assert.equal(result.maxPerSector, 3);
});
