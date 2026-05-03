import test from "node:test";
import assert from "node:assert/strict";

import { ENGINE_EVENT_TYPES } from "../../src/lib/engine/event-types";
import { STATS_CLOSE_TYPES } from "../../src/lib/engine/lifecycle";

test("engine event catalog covers core lifecycle transitions", () => {
  assert.ok(ENGINE_EVENT_TYPES.includes("position_opened"));
  assert.ok(ENGINE_EVENT_TYPES.includes("position_closed"));
  assert.ok(ENGINE_EVENT_TYPES.includes("pending_signal_resolved"));
});

test("stats close types include canonical lifecycle close reasons", () => {
  assert.ok(STATS_CLOSE_TYPES.has("take_profit"));
  assert.ok(STATS_CLOSE_TYPES.has("stop_loss"));
  assert.ok(STATS_CLOSE_TYPES.has("max_hold_sell"));
  assert.ok(STATS_CLOSE_TYPES.has("orgn_flip_sell"));
});
