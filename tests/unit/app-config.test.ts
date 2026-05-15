import test from "node:test";
import assert from "node:assert/strict";

import { buildEngineControlUpdates } from "../../src/lib/engine/app-config";

test("buildEngineControlUpdates normalizes multi-field payloads", () => {
  const updates = buildEngineControlUpdates({
    enabled: false,
    operatorDisplayName: "김동의",
    maxPositions: 7,
    stopLoss: 4,
    trailingStop: 2.5,
    sellRuleSensitivity: 8,
    morningStart: "09:10",
    marketHolidays: "2026-05-05, 2026-06-06",
    surgeMaxDailyEntriesPerStock: 4,
    surgeReentryBuyRatio: 0.75,
    surgeOpenBonus: 9,
    surgeReentryCooldownMinutes: 25,
    surgeNewsPositiveBonus: 10,
    surgeNewsNegativePenalty: 7,
    surgeNewsRiskCooldownMinutes: 120,
  }, "2026-05-04T00:00:00.000Z");

  assert.deepEqual(updates, [
    { key: "engine_enabled", value: false, updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "operator_display_name", value: "김동의", updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "max_positions", value: 7, updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "stop_loss", value: 4, updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "trailing_stop", value: 2.5, updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "morning_start", value: "09:10", updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "sell_rule_sensitivity", value: 8, updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "market_holidays", value: ["2026-05-05", "2026-06-06"], updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "surge_max_daily_entries_per_stock", value: 4, updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "surge_reentry_buy_ratio", value: 0.75, updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "surge_open_bonus", value: 9, updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "surge_reentry_cooldown_minutes", value: 25, updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "surge_news_positive_bonus", value: 10, updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "surge_news_negative_penalty", value: 7, updated_at: "2026-05-04T00:00:00.000Z" },
    { key: "surge_news_risk_cooldown_minutes", value: 120, updated_at: "2026-05-04T00:00:00.000Z" },
  ]);
});

test("buildEngineControlUpdates rejects invalid payloads", () => {
  assert.throws(() => buildEngineControlUpdates({ operatorDisplayName: "" }), /비어 있을 수 없습니다/);
  assert.throws(() => buildEngineControlUpdates({ maxPositions: 0 }), /1~20 정수/);
  assert.throws(() => buildEngineControlUpdates({ morningStart: "9:30" }), /HH:MM 형식/);
  assert.throws(() => buildEngineControlUpdates({ marketHolidays: ["2026/05/05"] }), /YYYY-MM-DD/);
  assert.throws(() => buildEngineControlUpdates({ sellRuleSensitivity: 11 }), /1~10 정수/);
  assert.throws(() => buildEngineControlUpdates({ surgeReentryBuyRatio: 1.2 }), /0.1~1 범위/);
  assert.throws(() => buildEngineControlUpdates({ surgeReentryCooldownMinutes: 130 }), /0~120 정수/);
  assert.throws(() => buildEngineControlUpdates({ surgeNewsPositiveBonus: 25 }), /0~20 정수/);
  assert.throws(() => buildEngineControlUpdates({ surgeNewsRiskCooldownMinutes: 300 }), /0~240 정수/);
});
