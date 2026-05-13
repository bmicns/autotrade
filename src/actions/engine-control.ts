"use server";

import { getSupabaseConfigError } from "@/lib/supabase/api-client";
import { buildEngineControlUpdates, upsertAppConfigEntries } from "@/lib/engine/app-config";

function checkAdminSecret() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET 미설정");
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) throw new Error(supabaseError);
}

async function saveAppConfig(input: Parameters<typeof buildEngineControlUpdates>[0]) {
  checkAdminSecret();
  const updates = buildEngineControlUpdates(input);
  await upsertAppConfigEntries(updates, { actor: "session", source: "server-action" });
  return { ok: true };
}

export async function setEngineEnabled(enabled: boolean) {
  return saveAppConfig({ enabled });
}

export async function setMaxPositions(max_positions: number) {
  return saveAppConfig({ maxPositions: max_positions });
}

export async function setMaxPerSector(max_per_sector: number) {
  return saveAppConfig({ maxPerSector: max_per_sector });
}

export async function saveTradeSettings(s: Partial<{
  maxTradesPerDay: number;
  stopLoss: number;
  trailingStop: number;
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
  dailyLossLimit: number;
  maxHoldDays: number;
}>) {
  return saveAppConfig({
    maxTradesPerDay: s.maxTradesPerDay,
    stopLoss: s.stopLoss,
    trailingStop: s.trailingStop,
    morningStart: s.morningStart,
    morningEnd: s.morningEnd,
    afternoonStart: s.afternoonStart,
    afternoonEnd: s.afternoonEnd,
    dailyLossLimit: s.dailyLossLimit,
    maxHoldDays: s.maxHoldDays,
  });
}

export async function setMarketCrashThreshold(threshold: number) {
  return saveAppConfig({ marketCrashThreshold: threshold });
}

export async function setSignalThresholds(thresholds: {
  rsiBuy?: number;
  rsiSell?: number;
  strongScore?: number;
  weakScore?: number;
  sellRuleSensitivity?: number;
}) {
  return saveAppConfig(thresholds);
}

export async function setSellRuleSensitivity(sellRuleSensitivity: number) {
  return saveAppConfig({ sellRuleSensitivity });
}

export async function setStrategyAllocations(allocations: {
  watchlistPullback?: number;
  surgeMomentum?: number;
  institutionalFollow?: number;
}) {
  return saveAppConfig(allocations);
}

export async function setMarketHolidays(holidays: string[] | string) {
  return saveAppConfig({ marketHolidays: holidays });
}

export async function saveSurgeSettings(settings: Partial<{
  surgeMaxDailyEntriesPerStock: number;
  surgeReentryBuyRatio: number;
  surgeTrailingPartialExitRatio: number;
  surgeTightStopLoss: number;
  surgeTightTrailingStop: number;
  surgeOpenBonus: number;
  surgeMorningBonus: number;
  surgeLatePenalty: number;
  surgeReentryCooldownMinutes: number;
  surgeNewsPositiveBonus: number;
  surgeNewsNegativePenalty: number;
  surgeNewsRiskCooldownMinutes: number;
  learningRiskAdjustmentsEnabled: boolean;
  manualUsBuyNoteTemplates: string[] | string;
  manualUsSellNoteTemplates: string[] | string;
}>) {
  return saveAppConfig(settings);
}
