import test from "node:test";
import assert from "node:assert/strict";

import { resolveRuntimeTradingBlockers } from "../../src/lib/engine/engine-safety";

test("resolveRuntimeTradingBlockers returns no blockers when runtime is clean", () => {
  assert.deepEqual(
    resolveRuntimeTradingBlockers({
      brokerMismatchCount: 0,
      stalePendingOrderCount: 0,
      staleSignalCount: 0,
      recentOrderFailures: { account: 0, capacity: 0, retryable: 0, unknown: 0 },
      sectorOverload: { count: 0, firstSector: null, firstCount: null, maxPerSector: null },
      entryPressure: { overflowCount: 0, firstCode: null, firstCount: null, firstLimit: null },
    }),
    [],
  );
});

test("resolveRuntimeTradingBlockers includes every high-confidence trading blocker", () => {
  assert.deepEqual(
    resolveRuntimeTradingBlockers({
      brokerMismatchCount: 2,
      stalePendingOrderCount: 1,
      staleSignalCount: 3,
      recentOrderFailures: { account: 0, capacity: 0, retryable: 0, unknown: 0 },
      sectorOverload: { count: 0, firstSector: null, firstCount: null, maxPerSector: null },
      entryPressure: { overflowCount: 0, firstCode: null, firstCount: null, firstLimit: null },
    }),
    [
      { key: "broker_reconcile", detail: "브로커-DB 정합성 불일치 2건" },
      { key: "stale_pending_orders", detail: "stale pending order 1건" },
      { key: "stale_signals", detail: "오래된 pending signal 3건" },
    ],
  );
});

test("resolveRuntimeTradingBlockers halts on recent account order failures", () => {
  assert.deepEqual(
    resolveRuntimeTradingBlockers({
      brokerMismatchCount: 0,
      stalePendingOrderCount: 0,
      staleSignalCount: 0,
      recentOrderFailures: { account: 1, capacity: 0, retryable: 0, unknown: 0 },
      sectorOverload: { count: 0, firstSector: null, firstCount: null, maxPerSector: null },
      entryPressure: { overflowCount: 0, firstCode: null, firstCount: null, firstLimit: null },
    }),
    [{ key: "recent_order_failures", detail: "최근 주문 계좌 오류 1건" }],
  );
});

test("resolveRuntimeTradingBlockers halts on repeated capacity or retryable order failures", () => {
  assert.deepEqual(
    resolveRuntimeTradingBlockers({
      brokerMismatchCount: 0,
      stalePendingOrderCount: 0,
      staleSignalCount: 0,
      recentOrderFailures: { account: 0, capacity: 3, retryable: 0, unknown: 0 },
      sectorOverload: { count: 0, firstSector: null, firstCount: null, maxPerSector: null },
      entryPressure: { overflowCount: 0, firstCode: null, firstCount: null, firstLimit: null },
    }),
    [{ key: "recent_order_failures", detail: "최근 주문 한도/잔고 오류 3건" }],
  );

  assert.deepEqual(
    resolveRuntimeTradingBlockers({
      brokerMismatchCount: 0,
      stalePendingOrderCount: 0,
      staleSignalCount: 0,
      recentOrderFailures: { account: 0, capacity: 0, retryable: 3, unknown: 0 },
      sectorOverload: { count: 0, firstSector: null, firstCount: null, maxPerSector: null },
      entryPressure: { overflowCount: 0, firstCode: null, firstCount: null, firstLimit: null },
    }),
    [{ key: "recent_order_failures", detail: "최근 재시도성 주문 실패 3건" }],
  );
});

test("resolveRuntimeTradingBlockers halts on sector overload", () => {
  assert.deepEqual(
    resolveRuntimeTradingBlockers({
      brokerMismatchCount: 0,
      stalePendingOrderCount: 0,
      staleSignalCount: 0,
      recentOrderFailures: { account: 0, capacity: 0, retryable: 0, unknown: 0 },
      sectorOverload: { count: 1, firstSector: "반도체", firstCount: 3, maxPerSector: 2 },
      entryPressure: { overflowCount: 0, firstCode: null, firstCount: null, firstLimit: null },
    }),
    [{ key: "sector_exposure", detail: "섹터 과집중 반도체 3/2" }],
  );
});

test("resolveRuntimeTradingBlockers halts on entry pressure overflow", () => {
  assert.deepEqual(
    resolveRuntimeTradingBlockers({
      brokerMismatchCount: 0,
      stalePendingOrderCount: 0,
      staleSignalCount: 0,
      recentOrderFailures: { account: 0, capacity: 0, retryable: 0, unknown: 0 },
      sectorOverload: { count: 0, firstSector: null, firstCount: null, maxPerSector: null },
      entryPressure: { overflowCount: 1, firstCode: "034020", firstCount: 5, firstLimit: 4 },
    }),
    [{ key: "entry_pressure", detail: "종목 반복진입 초과 034020 5/4" }],
  );
});
