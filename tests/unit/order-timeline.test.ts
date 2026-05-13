import test from "node:test";
import assert from "node:assert/strict";

import { summarizeManualIntentHealth, summarizeOrderLifecycle, summarizeOrderTimelineRisk } from "../../src/lib/engine/order-timeline";

test("summarizeOrderLifecycle merges pending-order lifecycle", () => {
  const items = summarizeOrderLifecycle([
    {
      event_type: "pending_order_deleted",
      stock_code: "028050",
      entity_id: "A-1",
      created_at: "2026-05-07T00:20:00.000Z",
      payload: { order_no: "A-1", resolution: "timeout", cancel_succeeded: true, order_qty: 4, limit_price: 11200 },
    },
    {
      event_type: "pending_order_partially_filled",
      stock_code: "028050",
      entity_id: "A-1",
      created_at: "2026-05-07T00:10:00.000Z",
      payload: { order_no: "A-1", filled_qty: 1, remaining_qty: 3, order_qty: 4, limit_price: 11200 },
    },
    {
      event_type: "pending_order_saved",
      stock_code: "028050",
      entity_id: "A-1",
      created_at: "2026-05-07T00:00:00.000Z",
      payload: { order_no: "A-1", stock_name: "YTN", order_qty: 4, limit_price: 11200 },
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.orderNo, "A-1");
  assert.equal(items[0]?.source, "auto");
  assert.equal(items[0]?.side, "buy");
  assert.equal(items[0]?.status, "timeout");
  assert.equal(items[0]?.filledQty, 1);
  assert.equal(items[0]?.remainingQty, 3);
  assert.deepEqual(items[0]?.events, ["저장", "부분체결", "시간초과후취소"]);
});

test("summarizeOrderLifecycle includes successful manual orders and skips failed ones", () => {
  const items = summarizeOrderLifecycle([
    {
      event_type: "manual_sell_executed",
      stock_code: "005930",
      entity_id: "M-2",
      created_at: "2026-05-07T01:00:00.000Z",
      payload: { success: false, order_no: "M-2", qty: 2, price: 65000, side: "sell", market: "kr" },
    },
    {
      event_type: "manual_buy_executed",
      stock_code: "AAPL",
      entity_id: "M-1",
      created_at: "2026-05-07T02:00:00.000Z",
      payload: { success: true, order_no: "M-1", qty: 3, price: 210.5, side: "buy", market: "us", stock_name: "Apple" },
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.orderNo, "M-1");
  assert.equal(items[0]?.source, "manual");
  assert.equal(items[0]?.side, "buy");
  assert.equal(items[0]?.market, "us");
  assert.equal(items[0]?.status, "filled");
  assert.equal(items[0]?.filledQty, 3);
  assert.deepEqual(items[0]?.events, ["수동매수체결"]);
});

test("summarizeOrderLifecycle merges manual queue into later pending-order lifecycle", () => {
  const items = summarizeOrderLifecycle([
    {
      event_type: "pending_order_partially_filled",
      stock_code: "005930",
      entity_id: "po-1",
      created_at: "2026-05-07T02:10:00.000Z",
      payload: {
        order_no: "K-100",
        order_qty: 3,
        limit_price: 70500,
        pending_signal_id: "sig-1",
        signal_source: "manual",
        filled_qty: 1,
        remaining_qty: 2,
      },
    },
    {
      event_type: "pending_order_saved",
      stock_code: "005930",
      entity_id: "po-1",
      created_at: "2026-05-07T02:05:00.000Z",
      payload: {
        order_no: "K-100",
        stock_name: "삼성전자",
        order_qty: 3,
        limit_price: 70500,
        signal_context: { pending_signal_id: "sig-1", signal_source: "manual" },
      },
    },
    {
      event_type: "manual_buy_queued",
      stock_code: "005930",
      entity_id: "sig-1",
      created_at: "2026-05-07T02:00:00.000Z",
      payload: {
        pending_signal_id: "sig-1",
        stock_name: "삼성전자",
        qty: 3,
        side: "buy",
      },
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.source, "manual");
  assert.equal(items[0]?.status, "partial");
  assert.equal(items[0]?.orderNo, "K-100");
  assert.deepEqual(items[0]?.events, ["수동매수등록", "저장", "부분체결"]);
});

test("summarizeOrderLifecycle keeps queued manual signal resolution when no order is created", () => {
  const items = summarizeOrderLifecycle([
    {
      event_type: "pending_signal_resolved",
      stock_code: "035420",
      entity_id: "sig-9",
      created_at: "2026-05-07T03:10:00.000Z",
      payload: {
        status: "rejected",
        signal_data: { resolution_detail: "수동 취소" },
      },
    },
    {
      event_type: "manual_buy_queued",
      stock_code: "035420",
      entity_id: "sig-9",
      created_at: "2026-05-07T03:00:00.000Z",
      payload: {
        pending_signal_id: "sig-9",
        stock_name: "NAVER",
        qty: 2,
        side: "buy",
      },
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.source, "manual");
  assert.equal(items[0]?.status, "rejected");
  assert.equal(items[0]?.orderNo, "");
  assert.deepEqual(items[0]?.events, ["수동매수등록", "신호거절"]);
});

test("summarizeOrderTimelineRisk aggregates manual and lifecycle warnings", () => {
  const risk = summarizeOrderTimelineRisk([
    {
      orderNo: "1",
      stockCode: "A",
      stockName: "A",
      status: "partial",
      source: "auto",
      side: "buy",
      market: "kr",
      filledQty: 1,
      remainingQty: 2,
      orderQty: 3,
      limitPrice: 1000,
      lastEventAt: "2026-05-07T00:00:00.000Z",
      events: ["저장", "부분체결"],
    },
    {
      orderNo: "2",
      stockCode: "B",
      stockName: "B",
      status: "timeout",
      source: "auto",
      side: "buy",
      market: "kr",
      filledQty: 0,
      remainingQty: 1,
      orderQty: 1,
      limitPrice: 1200,
      lastEventAt: "2026-05-07T00:01:00.000Z",
      events: ["저장", "시간초과후취소"],
    },
    {
      orderNo: "3",
      stockCode: "C",
      stockName: "C",
      status: "filled",
      source: "manual",
      side: "sell",
      market: "us",
      filledQty: 2,
      remainingQty: 0,
      orderQty: 2,
      limitPrice: 22.5,
      lastEventAt: "2026-05-07T00:02:00.000Z",
      events: ["수동매도체결"],
    },
  ]);

  assert.deepEqual(risk, {
    manualOrderCount: 1,
    partialCount: 1,
    timeoutCount: 1,
    staleCleanupCount: 0,
    lifecycleRiskCount: 2,
  });
});

test("summarizeManualIntentHealth classifies manual intent outcomes", () => {
  const summary = summarizeManualIntentHealth([
    {
      orderNo: "",
      stockCode: "A",
      stockName: "A",
      status: "queued",
      source: "manual",
      side: "buy",
      market: null,
      filledQty: 0,
      remainingQty: 0,
      orderQty: 1,
      limitPrice: null,
      lastEventAt: "2026-05-07T00:00:00.000Z",
      events: ["수동매수등록"],
    },
    {
      orderNo: "O-1",
      stockCode: "B",
      stockName: "B",
      status: "partial",
      source: "manual",
      side: "buy",
      market: "kr",
      filledQty: 1,
      remainingQty: 1,
      orderQty: 2,
      limitPrice: 1000,
      lastEventAt: "2026-05-07T00:01:00.000Z",
      events: ["수동매수등록", "저장", "부분체결"],
    },
    {
      orderNo: "",
      stockCode: "C",
      stockName: "C",
      status: "rejected",
      source: "manual",
      side: "buy",
      market: null,
      filledQty: 0,
      remainingQty: 0,
      orderQty: 1,
      limitPrice: null,
      lastEventAt: "2026-05-07T00:02:00.000Z",
      events: ["수동매수등록", "신호거절"],
    },
    {
      orderNo: "",
      stockCode: "D",
      stockName: "D",
      status: "failed",
      source: "manual",
      side: "buy",
      market: null,
      filledQty: 0,
      remainingQty: 0,
      orderQty: 1,
      limitPrice: null,
      lastEventAt: "2026-05-07T00:03:00.000Z",
      events: ["수동매수등록", "신호실패"],
    },
    {
      orderNo: "",
      stockCode: "E",
      stockName: "E",
      status: "expired",
      source: "manual",
      side: "buy",
      market: null,
      filledQty: 0,
      remainingQty: 0,
      orderQty: 1,
      limitPrice: null,
      lastEventAt: "2026-05-07T00:04:00.000Z",
      events: ["수동매수등록", "신호만료"],
    },
  ]);

  assert.deepEqual(summary, {
    queuedCount: 1,
    pendingCount: 1,
    blockedCount: 2,
    rejectedCount: 1,
    failedCount: 1,
    expiredCount: 1,
  });
});
