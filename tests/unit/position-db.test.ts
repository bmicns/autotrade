import test from "node:test";
import assert from "node:assert/strict";

import { getOpenPositionRemainingQty } from "../../src/lib/engine/position-math";

test("getOpenPositionRemainingQty subtracts partial exit quantity", () => {
  assert.equal(getOpenPositionRemainingQty({ entry_qty: 10, partial_exit_qty: 4 }), 6);
  assert.equal(getOpenPositionRemainingQty({ entry_qty: 10, partial_exit_qty: null }), 10);
  assert.equal(getOpenPositionRemainingQty({ entry_qty: 3, partial_exit_qty: 9 }), 0);
});
