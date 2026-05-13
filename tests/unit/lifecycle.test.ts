import test from "node:test";
import assert from "node:assert/strict";

import {
  canReenterPosition,
  buildPositionClosePayload,
  buildPositionOpenPayload,
  buildTradeMemoryClosePayload,
  resolveEntryPhase,
  resolveRecoveredEntryPhase,
  resolvePartialExitPhase,
  shouldAllowStopLossReentry,
} from "../../src/lib/engine/lifecycle";

test("resolveEntryPhase makes entry state explicit", () => {
  assert.equal(resolveEntryPhase(undefined), "initial");
  assert.equal(resolveEntryPhase("initial"), "full");
  assert.equal(resolveEntryPhase("partial_tp"), "full");
  assert.equal(resolveRecoveredEntryPhase("initial"), "initial");
  assert.equal(resolveRecoveredEntryPhase("partial_tp"), "full");
  assert.equal(resolveRecoveredEntryPhase("full"), "full");
  assert.equal(resolveRecoveredEntryPhase("final_tp"), "final_tp");
  assert.equal(canReenterPosition("partial_tp"), true);
  assert.equal(canReenterPosition("full"), false);
});

test("resolvePartialExitPhase returns deterministic next phase", () => {
  assert.deepEqual(resolvePartialExitPhase({ currentPhase: "initial", isSmallPosition: false }), {
    nextPhase: "partial_tp",
    phaseLabel: "1차 트레일링 청산",
  });
  assert.deepEqual(resolvePartialExitPhase({ currentPhase: "partial_tp", isSmallPosition: false }), {
    nextPhase: "final_tp",
    phaseLabel: "전량 트레일링 청산",
  });
});

test("shouldAllowStopLossReentry requires stop-price recovery with upward trend", () => {
  assert.equal(shouldAllowStopLossReentry({
    currentPrice: 100,
    stopPrice: 99,
    raw: {
      ma5: 101,
      ma20: 97,
      ema5: 100,
      ema20: 98,
      macd: 1.4,
      macdSignal: 1.1,
      rsi: 61,
    },
  }), true);

  assert.equal(shouldAllowStopLossReentry({
    currentPrice: 98,
    stopPrice: 99,
    raw: {
      ma5: 101,
      ma20: 97,
      ema5: 100,
      ema20: 98,
      macd: 1.4,
      macdSignal: 1.1,
      rsi: 61,
    },
  }), false);

  assert.equal(shouldAllowStopLossReentry({
    currentPrice: 100,
    stopPrice: 99,
    raw: {
      ma5: 96,
      ma20: 99,
      ema5: 97,
      ema20: 98,
      macd: 0.8,
      macdSignal: 1.1,
      rsi: 61,
    },
  }), false);
});

test("lifecycle payload builders create canonical DB states", () => {
  const signal = {
    indicators: [],
    raw: { regime: "ranging" },
    matchCount: 2,
    totalScore: 71,
    strength: "strong",
    directOrderNote: "선캐치",
    directOrderMarket: "us",
    directOrderProfileId: "us",
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
  assert.equal((openPayload.entry_signal as { directOrderNote?: string }).directOrderNote, "선캐치");
  assert.equal((openPayload.entry_signal as { directOrderMarket?: string }).directOrderMarket, "us");
  assert.equal((openPayload.entry_signal as { directOrderProfileId?: string }).directOrderProfileId, "us");

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
