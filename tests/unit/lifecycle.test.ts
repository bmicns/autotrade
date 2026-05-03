import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPositionClosePayload,
  buildPositionOpenPayload,
  buildTradeMemoryClosePayload,
  resolveEntryBuyRatio,
  resolveEntryPhase,
  resolvePartialExitPhase,
} from "../../src/lib/engine/lifecycle";

test("resolveEntryPhase and ratio make entry state explicit", () => {
  assert.equal(resolveEntryPhase(undefined), "initial");
  assert.equal(resolveEntryPhase("initial"), "full");
  assert.equal(resolveEntryBuyRatio(undefined), 0.5);
  assert.equal(resolveEntryBuyRatio("initial"), 1);
});

test("resolvePartialExitPhase returns deterministic next phase", () => {
  assert.deepEqual(resolvePartialExitPhase({ currentPhase: "initial", isSmallPosition: false }), {
    nextPhase: "partial_tp",
    phaseLabel: "1차 익절",
  });
  assert.deepEqual(resolvePartialExitPhase({ currentPhase: "partial_tp", isSmallPosition: false }), {
    nextPhase: "final_tp",
    phaseLabel: "2차 익절",
  });
});

test("lifecycle payload builders create canonical DB states", () => {
  const signal = {
    indicators: [],
    raw: { regime: "ranging" },
    matchCount: 2,
    totalScore: 71,
    strength: "strong",
  } as unknown as Parameters<typeof buildPositionOpenPayload>[0]["signal"];

  const openPayload = buildPositionOpenPayload({
    code: "005930",
    name: "삼성전자",
    price: 70000,
    qty: 10,
    signal,
    phase: "initial",
  });
  assert.equal(openPayload.status, "open");
  assert.equal(openPayload.phase, "initial");

  const closePayload = buildPositionClosePayload({
    exitPrice: 72000,
    exitQty: 10,
    exitReason: "take_profit",
    pnlAmount: 20000,
    pnlPercent: 2.857,
    holdDays: 3,
  });
  assert.equal(closePayload.status, "closed");
  assert.equal(closePayload.exit_reason, "take_profit");

  const memoryPayload = buildTradeMemoryClosePayload({
    pnlPercent: -1.234,
    pnlAmount: -12345,
    holdDays: 1,
    exitReason: "stop_loss",
  });
  assert.equal(memoryPayload.exit_reason, "stop_loss");
  assert.equal(memoryPayload.is_win, false);
});
