import test from "node:test";
import assert from "node:assert/strict";

import {
  filterSignalsByScope,
  mapOpenPositions,
  mapPendingSignals,
  summarizePendingOrders,
  summarizeEngineState,
} from "../../src/lib/engine/read-model";

test("read model maps open positions into canonical view", () => {
  const positions = mapOpenPositions([
    {
      id: "p1",
      stock_code: "005930",
      stock_name: "삼성전자",
      phase: "initial",
      status: "open",
      entry_price: 70000,
      entry_qty: 10,
      entry_date: "2026-05-02T01:00:00.000Z",
      entry_signal: { strategyKey: "watchlist_pullback", directOrderNote: "선캐치", directOrderMarket: "us" },
    },
  ]);

  assert.equal(positions[0].stockCode, "005930");
  assert.equal(positions[0].strategyKey, "watchlist_pullback");
  assert.equal(positions[0].directOrderNote, "선캐치");
  assert.equal(positions[0].directOrderMarket, "us");
});

test("read model filters pending signals by active/history scopes", () => {
  const signals = mapPendingSignals([
    { id: "1", stock_code: "A", status: "pending", created_at: "2026-05-02T00:00:00Z" },
    { id: "2", stock_code: "B", status: "expired", created_at: "2026-05-02T00:00:00Z" },
    { id: "3", stock_code: "C", status: "processing", created_at: "2026-05-02T00:00:00Z" },
  ]);

  assert.deepEqual(filterSignalsByScope(signals, "active").map((signal) => signal.stockCode), ["A", "C"]);
  assert.deepEqual(filterSignalsByScope(signals, "history").map((signal) => signal.stockCode), ["B"]);
});

test("read model summary counts active runtime entities", () => {
  const summary = summarizeEngineState({
    openPositions: [{ id: "p", stockCode: "A", stockName: null, phase: "initial", status: "open", entryPrice: 1, entryQty: 1, entryDate: "", strategyKey: null, directOrderNote: null, directOrderMarket: null }],
    pendingOrders: [{ id: "o", stock_code: "A", stock_name: null, order_no: "1", order_qty: 1, limit_price: 1000, signal_score: null, strategy_key: null, created_at: "" }],
    pendingSignals: mapPendingSignals([
      { id: "1", stock_code: "A", status: "pending", created_at: "2026-05-02T00:00:00Z" },
      { id: "2", stock_code: "B", status: "failed", created_at: "2026-05-02T00:00:00Z" },
    ]),
  });

  assert.deepEqual(summary, {
    openPositionCount: 1,
    pendingOrderCount: 1,
    pendingOrderStaleCount: 0,
    pendingSignalCount: 1,
    recentPartialFillCount: 0,
    recentLifecycleRiskCount: 0,
    recentManualOrderCount: 0,
    recentTimeoutCleanupCount: 0,
    recentOrderFailureCount: 0,
  });
});

test("read model detects stale pending orders separately", () => {
  const now = new Date("2026-05-07T00:30:00.000Z").getTime();
  const summary = summarizePendingOrders([
    {
      id: "fresh",
      stock_code: "A",
      stock_name: null,
      order_no: "1",
      order_qty: 1,
      limit_price: 1000,
      signal_score: null,
      strategy_key: null,
      created_at: "2026-05-07T00:10:00.000Z",
    },
    {
      id: "stale",
      stock_code: "B",
      stock_name: null,
      order_no: "2",
      order_qty: 1,
      limit_price: 1000,
      signal_score: null,
      strategy_key: null,
      created_at: "2026-05-06T23:30:00.000Z",
    },
  ], now);

  assert.deepEqual(summary, {
    pendingOrderCount: 2,
    pendingOrderStaleCount: 1,
  });
});
