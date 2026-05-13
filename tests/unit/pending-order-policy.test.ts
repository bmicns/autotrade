import test from "node:test";
import assert from "node:assert/strict";

import { resolvePendingOrderLifecycleDecision } from "../../src/lib/engine/pending-order-policy";

test("resolvePendingOrderLifecycleDecision keeps fresh partial orders observable", () => {
  const decision = resolvePendingOrderLifecycleDecision("partial", 12, 30);
  assert.equal(decision, "partial_observed");
});

test("resolvePendingOrderLifecycleDecision times out stale partial orders", () => {
  const decision = resolvePendingOrderLifecycleDecision("partial", 31, 30);
  assert.equal(decision, "timeout");
});

test("resolvePendingOrderLifecycleDecision times out stale open orders", () => {
  const decision = resolvePendingOrderLifecycleDecision("open", 45, 30);
  assert.equal(decision, "timeout");
});

test("resolvePendingOrderLifecycleDecision keeps not-found orders idle before stale threshold", () => {
  const decision = resolvePendingOrderLifecycleDecision("not_found", 8, 30);
  assert.equal(decision, "noop");
});
