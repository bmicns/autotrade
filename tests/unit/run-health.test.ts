import test from "node:test";
import assert from "node:assert/strict";

import { resolveRecentFailureHalt } from "../../src/lib/engine/run-health";

test("resolveRecentFailureHalt returns engine error halt reason", () => {
  const reason = resolveRecentFailureHalt([
    { error: "a" },
    { error: "b" },
    { error: "c" },
  ]);

  assert.equal(reason, "연속 엔진 오류 3회");
});

test("resolveRecentFailureHalt returns token error halt reason", () => {
  const reason = resolveRecentFailureHalt([
    { actions: [{ type: "token_error" }] },
    { actions: [{ type: "token_error" }] },
  ]);

  assert.equal(reason, "연속 토큰 오류 2회");
});

test("resolveRecentFailureHalt returns order failure halt reason", () => {
  const reason = resolveRecentFailureHalt([
    { actions: [{ type: "buy_failed" }] },
    { actions: [{ type: "approved_buy_failed" }] },
    { actions: [{ type: "sell_failed" }] },
  ]);

  assert.equal(reason, "연속 주문 실패 3회");
});

test("resolveRecentFailureHalt immediately halts on account order error", () => {
  const reason = resolveRecentFailureHalt([
    { actions: [{ type: "order_account_error" }] },
  ]);

  assert.equal(reason, "주문 계좌 오류 감지");
});

test("resolveRecentFailureHalt ignores retryable order failures for halt count", () => {
  const reason = resolveRecentFailureHalt([
    { actions: [{ type: "order_retryable_failure" }] },
    { actions: [{ type: "order_retryable_failure" }] },
    { actions: [{ type: "order_retryable_failure" }] },
  ]);

  assert.equal(reason, null);
});

test("resolveRecentFailureHalt ignores mixed successful runs", () => {
  const reason = resolveRecentFailureHalt([
    { actions: [{ type: "buy_failed" }] },
    { actions: [{ type: "approved_buy" }] },
    { actions: [{ type: "sell_failed" }] },
  ]);

  assert.equal(reason, null);
});
