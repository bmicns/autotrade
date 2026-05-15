import { recordEngineEvent } from "./event-log";
import { supabase } from "../supabase/api-client";

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface AppConfigChangeEntry {
  key: string;
  value: unknown;
  updated_at: string;
}

export interface EngineControlInput {
  enabled?: boolean;
  operatorDisplayName?: string;
  maxPositions?: number;
  maxPerSector?: number;
  stopLoss?: number;
  trailingStop?: number;
  partialExitRatio?: number;
  maxTradesPerDay?: number;
  dailyLossLimit?: number;
  maxHoldDays?: number;
  morningStart?: string;
  morningEnd?: string;
  afternoonStart?: string;
  afternoonEnd?: string;
  rsiBuy?: number;
  rsiSell?: number;
  strongScore?: number;
  weakScore?: number;
  sellRuleSensitivity?: number;
  marketCrashThreshold?: number;
  watchlistPullback?: number;
  surgeMomentum?: number;
  institutionalFollow?: number;
  marketHolidays?: string[] | string;
  surgeMaxDailyEntriesPerStock?: number;
  surgeReentryBuyRatio?: number;
  surgeTrailingPartialExitRatio?: number;
  surgeTightStopLoss?: number;
  surgeTightTrailingStop?: number;
  surgeOpenBonus?: number;
  surgeMorningBonus?: number;
  surgeLatePenalty?: number;
  surgeReentryCooldownMinutes?: number;
  surgeNewsPositiveBonus?: number;
  surgeNewsNegativePenalty?: number;
  surgeNewsRiskCooldownMinutes?: number;
  learningRiskAdjustmentsEnabled?: boolean;
  manualUsBuyNoteTemplates?: string[] | string;
  manualUsSellNoteTemplates?: string[] | string;
}

function asFiniteNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label}는 숫자여야 합니다`);
  }
  return parsed;
}

function asIntegerInRange(value: unknown, min: number, max: number, label: string): number {
  const parsed = asFiniteNumber(value, label);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label}는 ${min}~${max} 정수여야 합니다`);
  }
  return parsed;
}

function asNumberInRange(value: unknown, min: number, max: number, label: string): number {
  const parsed = asFiniteNumber(value, label);
  if (parsed < min || parsed > max) {
    throw new Error(`${label}는 ${min}~${max} 범위여야 합니다`);
  }
  return parsed;
}

function asTime(value: unknown, label: string): string {
  const parsed = String(value ?? "");
  if (!TIME_RE.test(parsed)) {
    throw new Error(`${label}는 HH:MM 형식이어야 합니다`);
  }
  return parsed;
}

function asShortText(value: unknown, maxLength: number, label: string): string {
  const parsed = String(value ?? "").trim();
  if (!parsed) {
    throw new Error(`${label}는 비어 있을 수 없습니다`);
  }
  if (parsed.length > maxLength) {
    throw new Error(`${label}는 ${maxLength}자 이하여야 합니다`);
  }
  return parsed;
}

function parseHolidayValues(raw: string[] | string): string[] {
  const values = Array.isArray(raw)
    ? raw.map((value) => String(value).trim()).filter(Boolean)
    : String(raw)
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean);

  for (const value of values) {
    if (!DATE_RE.test(value)) {
      throw new Error("marketHolidays는 YYYY-MM-DD 형식이어야 합니다");
    }
  }

  return values;
}

function parseTemplateValues(raw: string[] | string, label: string): string[] {
  const values = Array.isArray(raw)
    ? raw.map((value) => String(value).trim()).filter(Boolean)
    : String(raw)
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean);

  const unique = Array.from(new Set(values)).slice(0, 12);
  for (const value of unique) {
    if (value.length > 20) {
      throw new Error(`${label} 각 항목은 20자 이하여야 합니다`);
    }
  }
  return unique;
}

export function buildEngineControlUpdates(input: Partial<EngineControlInput>, updatedAt = new Date().toISOString()): AppConfigChangeEntry[] {
  const updates: AppConfigChangeEntry[] = [];

  if ("enabled" in input) {
    if (typeof input.enabled !== "boolean") throw new Error("enabled는 boolean이어야 합니다");
    updates.push({ key: "engine_enabled", value: input.enabled, updated_at: updatedAt });
  }
  if ("operatorDisplayName" in input) updates.push({ key: "operator_display_name", value: asShortText(input.operatorDisplayName, 24, "operatorDisplayName"), updated_at: updatedAt });
  if ("maxPositions" in input) updates.push({ key: "max_positions", value: asIntegerInRange(input.maxPositions, 1, 20, "maxPositions"), updated_at: updatedAt });
  if ("maxPerSector" in input) updates.push({ key: "max_per_sector", value: asIntegerInRange(input.maxPerSector, 1, 10, "maxPerSector"), updated_at: updatedAt });
  if ("stopLoss" in input) updates.push({ key: "stop_loss", value: asNumberInRange(input.stopLoss, 0.1, 30, "stopLoss"), updated_at: updatedAt });
  if ("trailingStop" in input) updates.push({ key: "trailing_stop", value: asNumberInRange(input.trailingStop, 0.1, 30, "trailingStop"), updated_at: updatedAt });
  if ("partialExitRatio" in input) updates.push({ key: "partial_exit_ratio", value: asIntegerInRange(input.partialExitRatio, 1, 100, "partialExitRatio"), updated_at: updatedAt });
  if ("maxTradesPerDay" in input) updates.push({ key: "max_trades_per_day", value: asIntegerInRange(input.maxTradesPerDay, 1, 20, "maxTradesPerDay"), updated_at: updatedAt });
  if ("dailyLossLimit" in input) updates.push({ key: "daily_loss_limit", value: asNumberInRange(input.dailyLossLimit, 0.1, 100, "dailyLossLimit"), updated_at: updatedAt });
  if ("maxHoldDays" in input) updates.push({ key: "max_hold_days", value: asIntegerInRange(input.maxHoldDays, 1, 365, "maxHoldDays"), updated_at: updatedAt });
  if ("morningStart" in input) updates.push({ key: "morning_start", value: asTime(input.morningStart, "morningStart"), updated_at: updatedAt });
  if ("morningEnd" in input) updates.push({ key: "morning_end", value: asTime(input.morningEnd, "morningEnd"), updated_at: updatedAt });
  if ("afternoonStart" in input) updates.push({ key: "afternoon_start", value: asTime(input.afternoonStart, "afternoonStart"), updated_at: updatedAt });
  if ("afternoonEnd" in input) updates.push({ key: "afternoon_end", value: asTime(input.afternoonEnd, "afternoonEnd"), updated_at: updatedAt });
  if ("rsiBuy" in input) updates.push({ key: "rsi_buy", value: asIntegerInRange(input.rsiBuy, 1, 99, "rsiBuy"), updated_at: updatedAt });
  if ("rsiSell" in input) updates.push({ key: "rsi_sell", value: asIntegerInRange(input.rsiSell, 1, 99, "rsiSell"), updated_at: updatedAt });
  if ("strongScore" in input) updates.push({ key: "strong_score", value: asIntegerInRange(input.strongScore, 1, 100, "strongScore"), updated_at: updatedAt });
  if ("weakScore" in input) updates.push({ key: "weak_score", value: asIntegerInRange(input.weakScore, 1, 100, "weakScore"), updated_at: updatedAt });
  if ("sellRuleSensitivity" in input) updates.push({ key: "sell_rule_sensitivity", value: asIntegerInRange(input.sellRuleSensitivity, 1, 10, "sellRuleSensitivity"), updated_at: updatedAt });
  if ("marketCrashThreshold" in input) updates.push({ key: "market_crash_threshold", value: asNumberInRange(input.marketCrashThreshold, -20, 0, "marketCrashThreshold"), updated_at: updatedAt });
  if ("watchlistPullback" in input) updates.push({ key: "strategy_alloc_watchlist_pullback", value: asNumberInRange(input.watchlistPullback, 0, 100, "watchlistPullback"), updated_at: updatedAt });
  if ("surgeMomentum" in input) updates.push({ key: "strategy_alloc_surge_momentum", value: asNumberInRange(input.surgeMomentum, 0, 100, "surgeMomentum"), updated_at: updatedAt });
  if ("institutionalFollow" in input) updates.push({ key: "strategy_alloc_institutional_follow", value: asNumberInRange(input.institutionalFollow, 0, 100, "institutionalFollow"), updated_at: updatedAt });
  if ("marketHolidays" in input && input.marketHolidays !== undefined) {
    updates.push({ key: "market_holidays", value: parseHolidayValues(input.marketHolidays), updated_at: updatedAt });
  }
  if ("surgeMaxDailyEntriesPerStock" in input) updates.push({ key: "surge_max_daily_entries_per_stock", value: asIntegerInRange(input.surgeMaxDailyEntriesPerStock, 2, 10, "surgeMaxDailyEntriesPerStock"), updated_at: updatedAt });
  if ("surgeReentryBuyRatio" in input) updates.push({ key: "surge_reentry_buy_ratio", value: asNumberInRange(input.surgeReentryBuyRatio, 0.1, 1, "surgeReentryBuyRatio"), updated_at: updatedAt });
  if ("surgeTrailingPartialExitRatio" in input) updates.push({ key: "surge_trailing_partial_exit_ratio", value: asIntegerInRange(input.surgeTrailingPartialExitRatio, 10, 90, "surgeTrailingPartialExitRatio"), updated_at: updatedAt });
  if ("surgeTightStopLoss" in input) updates.push({ key: "surge_tight_stop_loss", value: asNumberInRange(input.surgeTightStopLoss, 0.5, 10, "surgeTightStopLoss"), updated_at: updatedAt });
  if ("surgeTightTrailingStop" in input) updates.push({ key: "surge_tight_trailing_stop", value: asNumberInRange(input.surgeTightTrailingStop, 0.5, 10, "surgeTightTrailingStop"), updated_at: updatedAt });
  if ("surgeOpenBonus" in input) updates.push({ key: "surge_open_bonus", value: asIntegerInRange(input.surgeOpenBonus, 0, 20, "surgeOpenBonus"), updated_at: updatedAt });
  if ("surgeMorningBonus" in input) updates.push({ key: "surge_morning_bonus", value: asIntegerInRange(input.surgeMorningBonus, 0, 20, "surgeMorningBonus"), updated_at: updatedAt });
  if ("surgeLatePenalty" in input) updates.push({ key: "surge_late_penalty", value: asIntegerInRange(input.surgeLatePenalty, 0, 20, "surgeLatePenalty"), updated_at: updatedAt });
  if ("surgeReentryCooldownMinutes" in input) updates.push({ key: "surge_reentry_cooldown_minutes", value: asIntegerInRange(input.surgeReentryCooldownMinutes, 0, 120, "surgeReentryCooldownMinutes"), updated_at: updatedAt });
  if ("surgeNewsPositiveBonus" in input) updates.push({ key: "surge_news_positive_bonus", value: asIntegerInRange(input.surgeNewsPositiveBonus, 0, 20, "surgeNewsPositiveBonus"), updated_at: updatedAt });
  if ("surgeNewsNegativePenalty" in input) updates.push({ key: "surge_news_negative_penalty", value: asIntegerInRange(input.surgeNewsNegativePenalty, 0, 20, "surgeNewsNegativePenalty"), updated_at: updatedAt });
  if ("surgeNewsRiskCooldownMinutes" in input) updates.push({ key: "surge_news_risk_cooldown_minutes", value: asIntegerInRange(input.surgeNewsRiskCooldownMinutes, 0, 240, "surgeNewsRiskCooldownMinutes"), updated_at: updatedAt });
  if ("learningRiskAdjustmentsEnabled" in input) {
    if (typeof input.learningRiskAdjustmentsEnabled !== "boolean") throw new Error("learningRiskAdjustmentsEnabled는 boolean이어야 합니다");
    updates.push({ key: "learning_risk_adjustments_enabled", value: input.learningRiskAdjustmentsEnabled, updated_at: updatedAt });
  }
  if ("manualUsBuyNoteTemplates" in input && input.manualUsBuyNoteTemplates !== undefined) {
    updates.push({ key: "manual_us_buy_note_templates", value: parseTemplateValues(input.manualUsBuyNoteTemplates, "manualUsBuyNoteTemplates"), updated_at: updatedAt });
  }
  if ("manualUsSellNoteTemplates" in input && input.manualUsSellNoteTemplates !== undefined) {
    updates.push({ key: "manual_us_sell_note_templates", value: parseTemplateValues(input.manualUsSellNoteTemplates, "manualUsSellNoteTemplates"), updated_at: updatedAt });
  }

  if (updates.length === 0) {
    throw new Error("변경할 필드가 없습니다");
  }

  return updates;
}

export async function upsertAppConfigEntries(
  updates: AppConfigChangeEntry[],
  meta?: { actor?: string; source?: string }
): Promise<void> {
  const { error } = await supabase.from("app_config").upsert(updates);
  if (error) throw new Error(error.message);

  await recordEngineEvent({
    eventType: "app_config_updated",
    stockCode: null,
    entityTable: "app_config",
    entityId: null,
    payload: {
      actor: meta?.actor ?? "unknown",
      source: meta?.source ?? "unknown",
      changes: updates.map(({ key, value }) => ({ key, value })),
    },
  });
}

export async function isEngineEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "engine_enabled")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !(data?.value === false || data?.value === "false");
}

export async function getEngineLockState(ttlMinutes = 5): Promise<{ locked: boolean; lockedAt: string | null }> {
  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "engine_lock")
    .maybeSingle();
  if (error) throw new Error(error.message);

  const lockedAt = typeof data?.value === "string" && data.value ? data.value : null;
  const locked = !!(lockedAt && Date.now() - new Date(lockedAt).getTime() < ttlMinutes * 60 * 1000);
  return { locked, lockedAt };
}
