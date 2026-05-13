import test from "node:test";
import assert from "node:assert/strict";

import { resolveAvailableCash, resolveBalanceCashAmount } from "../../src/lib/engine/balance-summary";

test("resolveBalanceCashAmount prefers deposit cash with fallback fields", () => {
  assert.equal(resolveBalanceCashAmount({ dnca_tot_amt: "1500000", nxdy_excc_amt: "1400000" }), 1500000);
  assert.equal(resolveBalanceCashAmount({ nxdy_excc_amt: "900000" }), 900000);
  assert.equal(resolveBalanceCashAmount({ ord_psbl_cash: "800000" }), 800000);
});

test("resolveAvailableCash uses the most conservative positive cash basis with buffer", () => {
  const available = resolveAvailableCash({
    dnca_tot_amt: "1000000",
    nxdy_excc_amt: "980000",
    ord_psbl_cash: "950000",
  });

  assert.equal(available, 940500);
});

test("resolveAvailableCash falls back to zero when no valid cash fields exist", () => {
  assert.equal(resolveAvailableCash({}), 0);
  assert.equal(resolveAvailableCash({ dnca_tot_amt: "0", nxdy_excc_amt: "-1" }), 0);
});
