import test from "node:test";
import assert from "node:assert/strict";

import { buildEngineStateSnapshotFromRows, selectPendingSignalsForScope } from "../../src/lib/engine/snapshot-model";

test("snapshot builder assembles runtime state and summary from rows", () => {
  const snapshot = buildEngineStateSnapshotFromRows({
    positions: [
      {
        id: "p1",
        stock_code: "005930",
        stock_name: "삼성전자",
        phase: "initial",
        status: "open",
        entry_price: 70000,
        entry_qty: 10,
        entry_date: "2026-05-02T01:00:00.000Z",
        entry_signal: { strategyKey: "watchlist_pullback" },
      },
    ],
    orders: [
      {
        id: "o1",
        stock_code: "005930",
        stock_name: "삼성전자",
        order_no: "1001",
        order_qty: 10,
        limit_price: 70000,
        signal_score: 74,
        strategy_key: "watchlist_pullback",
        created_at: "2026-05-02T01:01:00.000Z",
      },
    ],
    signals: [
      {
        id: "s1",
        stock_code: "000660",
        stock_name: "SK하이닉스",
        status: "pending",
        signal_score: 68,
        signal_comment: "약한 신호",
        source: "watchlist",
        created_at: "2026-05-02T01:02:00.000Z",
        resolved_at: null,
        signal_data: { strategyKey: "watchlist_pullback" },
      },
      {
        id: "s2",
        stock_code: "035420",
        stock_name: "NAVER",
        status: "expired",
        signal_score: 71,
        signal_comment: "주문 접수 완료",
        source: "manual",
        created_at: "2026-05-02T01:03:00.000Z",
        resolved_at: "2026-05-02T01:05:00.000Z",
        signal_data: { strategyKey: "surge_momentum" },
      },
    ],
    events: [
      {
        id: "e1",
        event_type: "position_opened",
        stock_code: "005930",
        entity_table: "positions",
        entity_id: "p1",
        payload: { phase: "initial" },
        created_at: "2026-05-02T01:01:30.000Z",
      },
    ],
  });

  assert.equal(snapshot.summary.openPositionCount, 1);
  assert.equal(snapshot.summary.pendingOrderCount, 1);
  assert.equal(snapshot.summary.pendingSignalCount, 1);
  assert.equal(snapshot.recentEvents[0].eventType, "position_opened");
  assert.equal(snapshot.openPositions[0].strategyKey, "watchlist_pullback");
});

test("snapshot scope selector splits active vs history signals", () => {
  const snapshot = buildEngineStateSnapshotFromRows({
    positions: [],
    orders: [],
    signals: [
      { id: "s1", stock_code: "A", status: "pending", created_at: "2026-05-02T00:00:00Z" },
      { id: "s2", stock_code: "B", status: "failed", created_at: "2026-05-02T00:00:00Z" },
      { id: "s3", stock_code: "C", status: "processing", created_at: "2026-05-02T00:00:00Z" },
    ],
    events: [],
  });

  assert.deepEqual(selectPendingSignalsForScope(snapshot, "active").map((signal) => signal.stockCode), ["A", "C"]);
  assert.deepEqual(selectPendingSignalsForScope(snapshot, "history").map((signal) => signal.stockCode), ["B"]);
});
