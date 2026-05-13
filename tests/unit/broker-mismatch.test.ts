import test from "node:test";
import assert from "node:assert/strict";

import { compareBrokerHoldingsWithDb } from "../../src/lib/engine/broker-sync";

test("compareBrokerHoldingsWithDb classifies missing, qty mismatch, orphaned rows", () => {
  const result = compareBrokerHoldingsWithDb(
    [
      { pdno: "005930", prdt_name: "삼성전자", hldg_qty: "3", pchs_avg_pric: "70000" },
      { pdno: "000660", prdt_name: "SK하이닉스", hldg_qty: "5", pchs_avg_pric: "180000" },
    ],
    [
      { stock_code: "005930", stock_name: "삼성전자", entry_qty: 5, partial_exit_qty: 2 },
      { stock_code: "035420", stock_name: "NAVER", entry_qty: 2, partial_exit_qty: 0 },
      { stock_code: "000660", stock_name: "SK하이닉스", entry_qty: 4, partial_exit_qty: 0 },
    ],
  );

  assert.deepEqual(result.missingInDb, []);
  assert.deepEqual(result.qtyMismatch, [
    { code: "000660", name: "SK하이닉스", brokerQty: 5, dbQty: 4 },
  ]);
  assert.deepEqual(result.orphanedDb, [
    { code: "035420", name: "NAVER", dbQty: 2 },
  ]);
});

test("compareBrokerHoldingsWithDb detects broker-only holdings", () => {
  const result = compareBrokerHoldingsWithDb(
    [{ pdno: "251270", prdt_name: "넷마블", hldg_qty: "1", pchs_avg_pric: "50000" }],
    [],
  );

  assert.deepEqual(result.missingInDb, [
    { code: "251270", name: "넷마블", brokerQty: 1, brokerPrice: 50000 },
  ]);
});
