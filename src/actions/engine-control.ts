"use server";

import { supabase } from "@/lib/supabase/api-client";

function checkAdminSecret() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET 미설정");
}

export async function setEngineEnabled(enabled: boolean) {
  checkAdminSecret();
  if (typeof enabled !== "boolean") throw new Error("enabled 필드는 boolean이어야 합니다");

  const { error } = await supabase
    .from("app_config")
    .upsert({ key: "engine_enabled", value: enabled, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function setMaxPositions(max_positions: number) {
  checkAdminSecret();
  const val = Number(max_positions);
  if (!Number.isInteger(val) || val < 1 || val > 20) {
    throw new Error("max_positions는 1~20 정수여야 합니다");
  }
  const { error } = await supabase
    .from("app_config")
    .upsert({ key: "max_positions", value: val, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function setMaxPerSector(max_per_sector: number) {
  checkAdminSecret();
  const val = Number(max_per_sector);
  if (!Number.isInteger(val) || val < 1 || val > 10) {
    throw new Error("max_per_sector는 1~10 정수여야 합니다");
  }
  const { error } = await supabase
    .from("app_config")
    .upsert({ key: "max_per_sector", value: val, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function saveTradeSettings(s: Partial<{
  maxAmountPerTrade: number;
  maxTradesPerDay: number;
  stopLoss: number;
  takeProfit: number;
  takeProfitRatio: number;
  trailingStop: number;
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
  dailyLossLimit: number;
  maxHoldDays: number;
}>) {
  checkAdminSecret();
  const mapping: Array<[string, number | string | undefined]> = [
    ["max_amount_per_trade", s.maxAmountPerTrade],
    ["max_trades_per_day",   s.maxTradesPerDay],
    ["stop_loss",            s.stopLoss],
    ["take_profit",          s.takeProfit],
    ["take_profit_ratio",    s.takeProfitRatio],
    ["trailing_stop",        s.trailingStop],
    ["morning_start",        s.morningStart],
    ["morning_end",          s.morningEnd],
    ["afternoon_start",      s.afternoonStart],
    ["afternoon_end",        s.afternoonEnd],
    ["daily_loss_limit",     s.dailyLossLimit],
    ["max_hold_days",        s.maxHoldDays],
  ];
  for (const [key, value] of mapping) {
    if (value === undefined) continue;
    const { error } = await supabase
      .from("app_config")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }
  return { ok: true };
}

export async function setMarketCrashThreshold(threshold: number) {
  checkAdminSecret();
  const val = Number(threshold);
  if (isNaN(val) || val > 0 || val < -20) {
    throw new Error("market_crash_threshold는 -20 ~ 0 사이 숫자여야 합니다");
  }
  const { error } = await supabase
    .from("app_config")
    .upsert({ key: "market_crash_threshold", value: val, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function setSignalThresholds(thresholds: {
  rsiBuy?: number;
  rsiSell?: number;
  strongScore?: number;
  weakScore?: number;
}) {
  checkAdminSecret();

  const { rsiBuy, rsiSell, strongScore, weakScore } = thresholds;

  if (rsiBuy !== undefined) {
    const val = Number(rsiBuy);
    if (!Number.isInteger(val) || val < 1 || val > 99) throw new Error("rsiBuy는 1~99 정수여야 합니다");
  }
  if (rsiSell !== undefined) {
    const val = Number(rsiSell);
    if (!Number.isInteger(val) || val < 1 || val > 99) throw new Error("rsiSell은 1~99 정수여야 합니다");
  }
  if (strongScore !== undefined) {
    const val = Number(strongScore);
    if (!Number.isInteger(val) || val < 1 || val > 100) throw new Error("strongScore는 1~100 정수여야 합니다");
  }
  if (weakScore !== undefined) {
    const val = Number(weakScore);
    if (!Number.isInteger(val) || val < 1 || val > 100) throw new Error("weakScore는 1~100 정수여야 합니다");
  }

  const mapping: Array<[string, number | undefined]> = [
    ["rsi_buy",      rsiBuy      !== undefined ? Number(rsiBuy)      : undefined],
    ["rsi_sell",     rsiSell     !== undefined ? Number(rsiSell)     : undefined],
    ["strong_score", strongScore !== undefined ? Number(strongScore) : undefined],
    ["weak_score",   weakScore   !== undefined ? Number(weakScore)   : undefined],
  ];

  for (const [key, value] of mapping) {
    if (value === undefined) continue;
    const { error } = await supabase
      .from("app_config")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }

  return { ok: true };
}
