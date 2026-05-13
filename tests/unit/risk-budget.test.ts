import test from "node:test";
import assert from "node:assert/strict";

import { summarizeEntryPressure, summarizeRiskBudget, summarizeSectorExposure } from "../../src/lib/engine/risk-budget";

test("summarizeRiskBudget detects warning and hard loss limits", () => {
  const warning = summarizeRiskBudget({
    dailyLossLimitPct: 3,
    todayRealizedLossPct: -2.5,
    maxPositions: 5,
    openPositionCount: 3,
    maxDailyTrades: 5,
    todayTradeCount: 2,
    maxPerTradeAmount: 1_000_000,
    availableCash: 1_500_000,
  });
  assert.equal(warning.dailyLossWarning, true);
  assert.equal(warning.dailyLossReached, false);

  const hardStop = summarizeRiskBudget({
    dailyLossLimitPct: 3,
    todayRealizedLossPct: -3.2,
    maxPositions: 5,
    openPositionCount: 5,
    maxDailyTrades: 5,
    todayTradeCount: 5,
    maxPerTradeAmount: 1_000_000,
    availableCash: 200_000,
  });
  assert.equal(hardStop.dailyLossReached, true);
  assert.equal(hardStop.positionSlotsRemaining, 0);
  assert.equal(hardStop.tradeSlotsRemaining, 0);
  assert.equal(hardStop.hasCashForFreshEntry, false);
  assert.equal(hardStop.cashShortfallAmount, 800_000);
});

test("summarizeSectorExposure detects overloaded sectors only", () => {
  const summary = summarizeSectorExposure([
    { sector: "반도체" },
    { sector: "반도체" },
    { sector: "반도체" },
    { sector: "은행" },
    { sector: null },
  ], 2);

  assert.equal(summary.overloadedCount, 1);
  assert.deepEqual(summary.overloadedSectors, [{ sector: "반도체", count: 3 }]);
});

test("summarizeEntryPressure detects saturated and overflowing stocks", () => {
  const summary = summarizeEntryPressure([
    { stock_code: "005930", strategy_key: null },
    { stock_code: "005930", strategy_key: null },
    { stock_code: "034020", strategy_key: "surge_momentum" },
    { stock_code: "034020", strategy_key: "surge_momentum" },
    { stock_code: "034020", strategy_key: "surge_momentum" },
    { stock_code: "034020", strategy_key: "surge_momentum" },
    { stock_code: "034020", strategy_key: "surge_momentum" },
  ], (strategyKey) => strategyKey === "surge_momentum" ? 4 : 2);

  assert.equal(summary.saturatedCount, 2);
  assert.equal(summary.overflowCount, 1);
  assert.deepEqual(summary.stocks, [
    { code: "034020", count: 5, limit: 4 },
    { code: "005930", count: 2, limit: 2 },
  ]);
});
