import test from "node:test";
import assert from "node:assert/strict";

import { getEngineSkipReason, parseMarketHolidays, resolveEffectiveMarketWindows } from "../../src/lib/engine/market-calendar";

test("parseMarketHolidays handles JSON and CSV", () => {
  assert.deepEqual(parseMarketHolidays('["2026-05-05","2026-05-06"]'), ["2026-05-05", "2026-05-06"]);
  assert.deepEqual(parseMarketHolidays("2026-05-05,\n2026-05-06"), ["2026-05-05", "2026-05-06"]);
});

test("getEngineSkipReason returns holiday and market-hour guards", () => {
  const cfgMap = new Map<string, unknown>([["market_holidays", ["2026-05-05"]]]);
  assert.match(
    getEngineSkipReason(cfgMap, new Date("2026-05-05T02:00:00.000Z")) ?? "",
    /휴장일 스킵/,
  );
  assert.match(
    getEngineSkipReason(new Map(), new Date("2026-05-03T23:00:00.000Z")) ?? "",
    /장 외 시간/,
  );
});

test("resolveEffectiveMarketWindows upgrades legacy split market window to continuous KRX hours", () => {
  const windows = resolveEffectiveMarketWindows(new Map([
    ["morning_start", "09:30"],
    ["morning_end", "11:30"],
    ["afternoon_start", "13:00"],
    ["afternoon_end", "14:50"],
  ]));

  assert.deepEqual(windows, {
    morningStart: "09:00",
    morningEnd: "15:20",
    afternoonStart: "15:21",
    afternoonEnd: "15:21",
  });
});

test("getEngineSkipReason keeps 11:42 KST inside continuous market hours for legacy config", () => {
  const cfgMap = new Map<string, unknown>([
    ["morning_start", "09:30"],
    ["morning_end", "11:30"],
    ["afternoon_start", "13:00"],
    ["afternoon_end", "14:50"],
  ]);

  assert.equal(getEngineSkipReason(cfgMap, new Date("2026-05-08T02:42:00.000Z")), null);
});
