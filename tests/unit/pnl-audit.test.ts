import test from "node:test";
import assert from "node:assert/strict";

import { compareClosedPositionPnl } from "../../src/lib/engine/pnl-audit";

test("compareClosedPositionPnl detects missing trade memory and missing position", () => {
  const summary = compareClosedPositionPnl(
    [
      {
        id: "p1",
        stock_code: "005930",
        stock_name: "삼성전자",
        exit_date: "2026-05-04T01:00:00.000Z",
        exit_reason: "stop_loss",
        pnl_amount: -10000,
        pnl_percent: -1.2,
      },
    ],
    [
      {
        id: "m2",
        stock_code: "000660",
        stock_name: "SK하이닉스",
        closed_at: "2026-05-04T01:10:00.000Z",
        exit_reason: "trailing_stop",
        pnl_amount: 20000,
        pnl_percent: 1.5,
      },
    ],
  );

  assert.equal(summary.mismatchCount, 2);
  assert.equal(summary.mismatches[0].kind, "missing_trade_memory");
  assert.equal(summary.mismatches[1].kind, "missing_position");
});

test("compareClosedPositionPnl detects pnl and reason mismatches", () => {
  const summary = compareClosedPositionPnl(
    [
      {
        id: "p1",
        stock_code: "005930",
        stock_name: "삼성전자",
        exit_date: "2026-05-04T01:00:00.000Z",
        exit_reason: "stop_loss",
        pnl_amount: -10000,
        pnl_percent: -1.2,
      },
    ],
    [
      {
        id: "m1",
        stock_code: "005930",
        stock_name: "삼성전자",
        closed_at: "2026-05-04T01:05:00.000Z",
        exit_reason: "manual_sell",
        pnl_amount: -9000,
        pnl_percent: -1.1,
      },
    ],
  );

  assert.equal(summary.matchedCount, 1);
  assert.deepEqual(summary.mismatches.map((item) => item.kind), ["pnl_amount", "pnl_percent", "exit_reason"]);
});

test("compareClosedPositionPnl matches synthetic recovery histories when close rows exist", () => {
  const summary = compareClosedPositionPnl(
    [
      {
        id: "p1",
        stock_code: "028050",
        stock_name: "삼성E&A",
        exit_date: "2026-05-04T04:47:55.152Z",
        exit_reason: "manual_sell",
        pnl_amount: 1200,
        pnl_percent: 2.21,
      },
    ],
    [
      {
        id: "m1",
        stock_code: "028050",
        stock_name: "삼성E&A",
        closed_at: "2026-05-04T04:47:56.000Z",
        exit_reason: "manual_sell",
        pnl_amount: 1200,
        pnl_percent: 2.21,
      },
    ],
  );

  assert.equal(summary.mismatchCount, 0);
  assert.equal(summary.matchedCount, 1);
});
