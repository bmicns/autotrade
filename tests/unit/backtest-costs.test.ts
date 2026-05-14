import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBuyExecution,
  applySellExecution,
  calcBuyCost,
  calcSellProceeds,
} from "../../src/lib/backtest-costs";

test("buy execution increases effective entry price with slippage", () => {
  assert.equal(Math.round(applyBuyExecution(10000, 0.001)), 10010);
});

test("sell execution decreases effective exit price with slippage", () => {
  assert.equal(Math.round(applySellExecution(10000, 0.001)), 9990);
});

test("buy and sell costs reduce net proceeds", () => {
  const buy = calcBuyCost(10000, 10, 0.00015);
  const sell = calcSellProceeds(11000, 10, 0.00015, 0.0018);

  assert.equal(buy.gross, 100000);
  assert.equal(buy.total > buy.gross, true);
  assert.equal(sell.net < sell.gross, true);
  assert.equal(sell.tax > sell.fee, true);
});
