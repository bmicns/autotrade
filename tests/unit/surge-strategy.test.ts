import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateSurgeEarlyEntry,
  getPerStockEntryLimit,
  resolveConfiguredPerStockEntryLimit,
  resolveSurgeBuyRatio,
  resolveSurgeIntradayEdge,
  resolveSurgeNewsRiskCooldown,
  resolveSurgeReentryCooldown,
  resolveSurgeRiskConfig,
} from "../../src/lib/engine/surge-strategy";

test("surge strategy allows more same-day entries than default", () => {
  assert.equal(getPerStockEntryLimit("watchlist_pullback"), 2);
  assert.equal(getPerStockEntryLimit("surge_momentum"), 4);
});

test("surge reentry buy ratio is larger after partial trailing exit", () => {
  assert.equal(resolveSurgeBuyRatio("initial"), 0.5);
  assert.equal(resolveSurgeBuyRatio("partial_tp"), 0.7);
  assert.equal(resolveSurgeBuyRatio("partial_tp", 0.8), 0.8);
});

test("configured surge entry limit overrides default for surge only", () => {
  assert.equal(resolveConfiguredPerStockEntryLimit("surge_momentum", 6), 6);
  assert.equal(resolveConfiguredPerStockEntryLimit("watchlist_pullback", 6), 2);
});

test("surge risk config tightens stops and uses smaller trailing partial exit", () => {
  const risk = resolveSurgeRiskConfig(-5, -3);
  assert.equal(risk.stopLoss, -2.8);
  assert.equal(risk.trailingStop, -1.4);
  assert.equal(risk.partialExitRatio, 35);
});

test("surge early entry detects breakout with accelerating intraday volume", () => {
  const signal = evaluateSurgeEarlyEntry({
    minuteCandles: [
      { time: "090100", close: 1000, high: 1005, low: 995, volume: 1000 },
      { time: "090200", close: 1002, high: 1006, low: 999, volume: 1100 },
      { time: "090300", close: 1004, high: 1008, low: 1000, volume: 1200 },
      { time: "090400", close: 1010, high: 1012, low: 1004, volume: 2400 },
      { time: "090500", close: 1018, high: 1020, low: 1008, volume: 2600 },
      { time: "090600", close: 1025, high: 1028, low: 1014, volume: 3200 },
    ],
    priceData: {
      stck_oprc: "1000",
      stck_prpr: "1025",
    },
  });

  assert.equal(signal.earlyEntry, true);
  assert.ok(signal.bonus >= 20);
  assert.ok(signal.reasons.includes("직전 고점 재돌파"));
});

test("surge intraday edge boosts open and soft-blocks late fresh entries", () => {
  const openEdge = resolveSurgeIntradayEdge(new Date("2026-05-06T09:10:00+09:00"));
  assert.equal(openEdge.bonus, 8);
  assert.equal(openEdge.allowFreshEntry, true);

  const lateEdge = resolveSurgeIntradayEdge(new Date("2026-05-06T15:10:00+09:00"));
  assert.equal(lateEdge.allowFreshEntry, false);
  assert.equal(lateEdge.bonus, -6);

  const customEdge = resolveSurgeIntradayEdge(new Date("2026-05-06T10:10:00+09:00"), {
    openBonus: 10,
    morningBonus: 7,
    latePenalty: 9,
  });
  assert.equal(customEdge.bonus, 7);
});

test("surge reentry cooldown blocks immediate retry after partial exit", () => {
  const blocked = resolveSurgeReentryCooldown({
    existingPhase: "partial_tp",
    entryDate: "2026-05-06T09:00:00+09:00",
    now: new Date("2026-05-06T09:10:00+09:00"),
    cooldownMinutes: 18,
  });
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.remainingMinutes >= 8);

  const cleared = resolveSurgeReentryCooldown({
    existingPhase: "partial_tp",
    entryDate: "2026-05-06T09:00:00+09:00",
    now: new Date("2026-05-06T09:25:00+09:00"),
    cooldownMinutes: 18,
  });
  assert.equal(cleared.blocked, false);
});

test("surge news risk cooldown blocks fresh entry shortly after bad headline", () => {
  const blocked = resolveSurgeNewsRiskCooldown({
    publishedAts: ["2026-05-06T09:00:00+09:00"],
    now: new Date("2026-05-06T09:20:00+09:00"),
    cooldownMinutes: 90,
  });
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.remainingMinutes >= 60);

  const cleared = resolveSurgeNewsRiskCooldown({
    publishedAts: ["2026-05-06T09:00:00+09:00"],
    now: new Date("2026-05-06T11:10:00+09:00"),
    cooldownMinutes: 90,
  });
  assert.equal(cleared.blocked, false);
});
