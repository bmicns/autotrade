import test from "node:test";
import assert from "node:assert/strict";

import { getEngineSkipReason, parseMarketHolidays } from "../../src/lib/engine/market-calendar";

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
    getEngineSkipReason(new Map(), new Date("2026-05-04T00:00:00.000Z")) ?? "",
    /장 외 시간/,
  );
});
