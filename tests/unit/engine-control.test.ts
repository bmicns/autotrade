import test from "node:test";
import assert from "node:assert/strict";

import { applyEngineAppConfig, readEngineControlSnapshot } from "../../src/lib/engine/control";

test("readEngineControlSnapshot normalizes defaults and allocations", () => {
  const cfgMap = new Map<string, unknown>([
    ["engine_enabled", "false"],
    ["strategy_alloc_watchlist_pullback", 80],
    ["strategy_alloc_surge_momentum", 20],
    ["strategy_alloc_institutional_follow", 0],
    ["market_holidays", "2026-05-05,2026-06-06"],
  ]);

  const snapshot = readEngineControlSnapshot(cfgMap);
  assert.equal(snapshot.engine_enabled, false);
  assert.equal(snapshot.max_positions, 5);
  assert.deepEqual(snapshot.market_holidays, ["2026-05-05", "2026-06-06"]);
  assert.deepEqual(snapshot.strategy_allocations, {
    watchlist_pullback: 80,
    surge_momentum: 20,
    institutional_follow: 0,
  });
});

test("applyEngineAppConfig mutates engine config and returns parsed limits", () => {
  const config = {
    appKey: "a",
    appSecret: "b",
    accountNo: "1234567801",
    token: "t",
    stopLoss: -5,
    takeProfit: 5,
    trailingStop: -3,
    maxPerTrade: 1_000_000,
    maxDailyTrades: 5,
    takeProfitRatio: 50,
    dailyLossLimit: -3,
    dynamicRisk: true,
    maxHoldDays: 5,
  };
  const cfgMap = new Map<string, unknown>([
    ["stop_loss", 4],
    ["take_profit", 8],
    ["max_amount_per_trade", 250],
    ["max_positions", 7],
    ["max_per_sector", 3],
  ]);

  const result = applyEngineAppConfig(config, cfgMap);
  assert.equal(config.stopLoss, -4);
  assert.equal(config.takeProfit, 8);
  assert.equal(config.maxPerTrade, 2_500_000);
  assert.equal(result.maxPositions, 7);
  assert.equal(result.maxPerSector, 3);
});
