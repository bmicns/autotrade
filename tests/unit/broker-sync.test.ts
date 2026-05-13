import test from "node:test";
import assert from "node:assert/strict";

import { buildBrokerReconcilePlan, selectRestorableBrokerHoldings } from "../../src/lib/engine/broker-sync";

test("selectRestorableBrokerHoldings filters held and invalid rows", () => {
  const restored = selectRestorableBrokerHoldings([
    { pdno: "005930", prdt_name: "삼성전자", hldg_qty: "1", pchs_avg_pric: "227250" },
    { pdno: "028050", prdt_name: "삼성E&A", hldg_qty: "2", pchs_avg_pric: "51000" },
    { pdno: "000000", prdt_name: "무효", hldg_qty: "0", pchs_avg_pric: "1000" },
  ], ["005930"]);

  assert.deepEqual(restored, [
    { code: "028050", name: "삼성E&A", qty: 2, price: 51000 },
  ]);
});

test("buildBrokerReconcilePlan exposes qty adjustments and orphaned closures", () => {
  const plan = buildBrokerReconcilePlan(
    [
      { pdno: "005930", prdt_name: "삼성전자", hldg_qty: "2", pchs_avg_pric: "70000" },
      { pdno: "000660", prdt_name: "SK하이닉스", hldg_qty: "4", pchs_avg_pric: "180000" },
    ],
    [
      { stock_code: "005930", stock_name: "삼성전자", entry_qty: 1, partial_exit_qty: 0 },
      { stock_code: "035420", stock_name: "NAVER", entry_qty: 2, partial_exit_qty: 0 },
    ],
  );

  assert.deepEqual(plan.missingInDb, [
    { code: "000660", name: "SK하이닉스", brokerQty: 4, brokerPrice: 180000 },
  ]);
  assert.deepEqual(plan.qtyAdjustments, [
    { code: "005930", name: "삼성전자", brokerQty: 2, dbQty: 1 },
  ]);
  assert.deepEqual(plan.orphanedClosures, [
    { code: "035420", name: "NAVER", dbQty: 2 },
  ]);
});
