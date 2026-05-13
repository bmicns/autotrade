import test from "node:test";
import assert from "node:assert/strict";

import { ENGINE_EVENT_TYPES } from "../../src/lib/engine/event-types";
import { CURRENT_POSITION_CLOSE_REASONS, HISTORICAL_CLOSE_TYPES, LEGACY_POSITION_CLOSE_REASONS } from "../../src/lib/engine/lifecycle";

test("engine event catalog covers core lifecycle transitions", () => {
  assert.ok(ENGINE_EVENT_TYPES.includes("position_opened"));
  assert.ok(ENGINE_EVENT_TYPES.includes("position_closed"));
  assert.ok(ENGINE_EVENT_TYPES.includes("pending_signal_resolved"));
  assert.ok(ENGINE_EVENT_TYPES.includes("pending_order_partially_filled"));
  assert.ok(ENGINE_EVENT_TYPES.includes("order_failure_recorded"));
});

test("historical close types separate current and legacy reasons", () => {
  assert.deepEqual(CURRENT_POSITION_CLOSE_REASONS, [
    "stop_loss",
    "trailing_stop",
    "max_hold_sell",
    "orgn_flip_sell",
    "signal_rule_sell",
    "manual_sell",
    "reconcile_orphan",
  ]);
  assert.deepEqual(LEGACY_POSITION_CLOSE_REASONS, ["take_profit"]);
  assert.ok(HISTORICAL_CLOSE_TYPES.has("take_profit"));
  assert.ok(HISTORICAL_CLOSE_TYPES.has("stop_loss"));
  assert.ok(HISTORICAL_CLOSE_TYPES.has("max_hold_sell"));
  assert.ok(HISTORICAL_CLOSE_TYPES.has("orgn_flip_sell"));
  assert.ok(HISTORICAL_CLOSE_TYPES.has("signal_rule_sell"));
  assert.ok(HISTORICAL_CLOSE_TYPES.has("reconcile_orphan"));
});
