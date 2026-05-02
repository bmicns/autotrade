import { NextResponse } from "next/server";
import { loadLatestLearning, applyLearning } from "@/lib/learning";
import { KIS_API_BASE } from "@/lib/constants";
import { type EngineConfig, type StepContext } from "@/lib/engine/types";
import { logEngineRun, cleanupStalePendingOrders } from "@/lib/engine/db";
import { supabase } from "@/lib/supabase/api-client";
import { runStep0, runStep1, runStep15 } from "@/lib/engine/steps";
import { END_OF_DAY_TIME } from "@/lib/engine/constants";
import { getEngineSkipReason, getKstNowParts } from "@/lib/engine/market-calendar";
import { runStep2, runStep3, runStep4 } from "@/lib/engine/steps-scan";
import { normalizeStrategyAllocations } from "@/lib/engine/strategies";
import { getBalance } from "@/lib/engine/kis";
import { sendDailyReport, sendEngineErrorAlert } from "@/lib/engine/notify";
import { getKisCredentialCandidates, persistKisConfig, type RuntimeKisConfig } from "@/lib/kis/runtime-config";
import { validateRequiredEnv } from "@/lib/config-validator";
import { withRetry } from "@/lib/engine/retry";

async function issueKisToken(appKey: string, appSecret: string): Promise<string> {
  const tokenRes = await fetch(`${KIS_API_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret }),
  });
  if (!tokenRes.ok) {
    const errBody = await tokenRes.text().catch(() => "");
    throw new Error(`${tokenRes.status} ${errBody.slice(0, 200)}`.trim());
  }
  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

async function resolveKisCredentials(): Promise<
  | { ok: true; creds: RuntimeKisConfig; token: string; source: "env" | "db" }
  | { ok: false; detail: string }
> {
  const candidates = (await getKisCredentialCandidates()).map(({ source, config }) => ({ source, creds: config }));
  if (candidates.length === 0) {
    return { ok: false, detail: "KIS 자격증명 미설정 (kis_config / env)" };
  }

  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      const token = await withRetry(
        () => issueKisToken(candidate.creds.appKey, candidate.creds.appSecret),
        { maxAttempts: 3, baseDelayMs: 1000 }
      );
      if (candidate.source === "env") {
        await persistKisConfig(candidate.creds);
      }
      return { ok: true, creds: candidate.creds, token, source: candidate.source };
    } catch (e) {
      failures.push(`${candidate.source}:${e instanceof Error ? e.message : "토큰 오류"}`);
    }
  }

  return { ok: false, detail: failures.join(" | ") };
}

async function cleanupStaleSignals() {
  const now = new Date();
  const pendingCutoff = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
  const approvedCutoff = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

  await Promise.all([
    supabase
      .from("pending_signals")
      .update({ status: "expired", resolved_at: now.toISOString(), signal_data: { resolution_detail: "승인 대기 2시간 초과" } })
      .eq("status", "pending")
      .lt("created_at", pendingCutoff),
    supabase
      .from("pending_signals")
      .update({ status: "expired", resolved_at: now.toISOString(), signal_data: { resolution_detail: "승인 후 24시간 초과" } })
      .in("status", ["approved", "processing"])
      .lt("created_at", approvedCutoff),
  ]);
}

// ─── Cron GET ───────────────────────────────────
// 인증은 middleware.ts CRON_ROUTES에서 처리됨
export async function GET() {
  // 1. 환경변수 검증
  const envCheck = validateRequiredEnv();
  if (!envCheck.ok) {
    const errMsg = `환경변수 검증 실패: ${envCheck.missing.join(", ")}`;
    await sendEngineErrorAlert(errMsg, 0).catch(() => {
      console.error("[engine] 환경변수 누락 (Telegram 알림 실패):", envCheck.missing);
    });
    return NextResponse.json({ error: "환경변수 검증 실패", missing: envCheck.missing }, { status: 500 });
  }

  // 2. 엔진 락 확인 (5분 TTL)
  const { data: lockRow } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "engine_lock")
    .maybeSingle();
  if (lockRow?.value) {
    const lockTime = new Date(lockRow.value as string).getTime();
    if (Date.now() - lockTime < 5 * 60 * 1000) {
      return NextResponse.json({ skipped: true, reason: `engine_lock: 이미 실행 중 (since: ${lockRow.value})` });
    }
  }

  // 3. 엔진 락 획득
  const now = new Date().toISOString();
  await supabase.from("app_config").upsert({ key: "engine_lock", value: now, updated_at: now });

  try {
    // 4. cleanupStaleSignals (기존)
    await cleanupStaleSignals();

    // 5. cleanupStalePendingOrders (신규)
    await cleanupStalePendingOrders();

    // 6. getEngineSkipReason (기존)
    const { data: appConfigs } = await supabase.from("app_config").select("key, value");
    const cfgMap = new Map((appConfigs || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    const skipReason = getEngineSkipReason(cfgMap);
    if (skipReason) {
      await logEngineRun(0, [{ type: "skipped", code: "", detail: skipReason }], 0, 0);
      return NextResponse.json({ skipped: true, reason: skipReason });
    }

    // 7. resolveKisCredentials (withRetry 적용)
    const resolved = await resolveKisCredentials();
    if (!resolved.ok) {
      await logEngineRun(0, [{ type: "token_error", code: "", detail: `KIS 토큰 발급 실패: ${resolved.detail}` }], 0, 0, "토큰 발급 실패");
      return NextResponse.json({ error: "토큰 발급 실패" }, { status: 500 });
    }

    const { data: watchlistData } = await supabase.from("watchlist").select("code").eq("active", true);
    const watchlist = (watchlistData || []).map((w: { code: string }) => w.code);

    const config: EngineConfig = {
      appKey: resolved.creds.appKey,
      appSecret: resolved.creds.appSecret,
      accountNo: resolved.creds.accountNo,
      token: resolved.token,
      ...DEFAULT_ENGINE_CONFIG,
      watchlist,
    };

    // 8. 엔진 실행
    return await runEngine(config);
  } finally {
    // 9. 락 해제 (정상 완료 / 오류 모두)
    const releaseTime = new Date().toISOString();
    try { await supabase.from("app_config").upsert({ key: "engine_lock", value: null, updated_at: releaseTime }); } catch { /* ignore */ }
  }
}

// KOSPI 등락률 기준 추세장 판정 임계값 (일평균 변동률 고려: 0.5%면 확실한 상승 모멘텀)
const KOSPI_TRENDING_THRESHOLD = 0.5;

const DEFAULT_ENGINE_CONFIG = {
  stopLoss: -5,
  takeProfit: 5,
  trailingStop: -3,
  maxPerTrade: 1_000_000,
  maxDailyTrades: 5,
  takeProfitRatio: 50,
  dailyLossLimit: -3,
  dynamicRisk: true,
  maxHoldDays: 5,
} as const;

// ─── app_config → EngineConfig 반영 ────────────────
function applyAppConfig(
  config: EngineConfig,
  cfgMap: Map<string, unknown>
): {
  maxPositions: number;
  maxPerSector: number;
  strategyAllocations: ReturnType<typeof normalizeStrategyAllocations>;
} {
  if (cfgMap.has("stop_loss"))            config.stopLoss            = -Math.abs(Number(cfgMap.get("stop_loss")));
  if (cfgMap.has("take_profit"))          config.takeProfit          =   Number(cfgMap.get("take_profit"));
  if (cfgMap.has("take_profit_ratio"))    config.takeProfitRatio     =   Number(cfgMap.get("take_profit_ratio"));
  if (cfgMap.has("trailing_stop"))        config.trailingStop        = -Math.abs(Number(cfgMap.get("trailing_stop")));
  if (cfgMap.has("max_amount_per_trade")) config.maxPerTrade         =   Number(cfgMap.get("max_amount_per_trade")) * 10000;
  if (cfgMap.has("max_trades_per_day"))   config.maxDailyTrades      =   Number(cfgMap.get("max_trades_per_day"));
  if (cfgMap.has("daily_loss_limit"))     config.dailyLossLimit      = -Math.abs(Number(cfgMap.get("daily_loss_limit")));
  if (cfgMap.has("max_hold_days"))        config.maxHoldDays         =   Number(cfgMap.get("max_hold_days"));
  if (cfgMap.has("rsi_buy"))              config.rsiBuy              =   Number(cfgMap.get("rsi_buy"));
  if (cfgMap.has("rsi_sell"))             config.rsiSell             =   Number(cfgMap.get("rsi_sell"));
  if (cfgMap.has("strong_score"))         config.strongScore         =   Number(cfgMap.get("strong_score"));
  if (cfgMap.has("weak_score"))           config.weakScore           =   Number(cfgMap.get("weak_score"));
  if (cfgMap.has("market_crash_threshold")) config.marketCrashThreshold = Number(cfgMap.get("market_crash_threshold"));

  if (cfgMap.has("trending_rsi_buy") || cfgMap.has("trending_strong_score")) {
    config.trendingParams = {
      rsiBuy:      Number(cfgMap.get("trending_rsi_buy")      ?? config.rsiBuy      ?? 30),
      rsiSell:     Number(cfgMap.get("trending_rsi_sell")     ?? config.rsiSell     ?? 70),
      strongScore: Number(cfgMap.get("trending_strong_score") ?? config.strongScore ?? 70),
      weakScore:   Number(cfgMap.get("trending_weak_score")   ?? config.weakScore   ?? 40),
    };
  }
  if (cfgMap.has("ranging_rsi_buy") || cfgMap.has("ranging_strong_score")) {
    config.rangingParams = {
      rsiBuy:      Number(cfgMap.get("ranging_rsi_buy")      ?? config.rsiBuy      ?? 30),
      rsiSell:     Number(cfgMap.get("ranging_rsi_sell")     ?? config.rsiSell     ?? 70),
      strongScore: Number(cfgMap.get("ranging_strong_score") ?? config.strongScore ?? 70),
      weakScore:   Number(cfgMap.get("ranging_weak_score")   ?? config.weakScore   ?? 40),
    };
  }

  const strategyAllocations = normalizeStrategyAllocations({
    watchlist_pullback: cfgMap.get("strategy_alloc_watchlist_pullback"),
    surge_momentum: cfgMap.get("strategy_alloc_surge_momentum"),
    institutional_follow: cfgMap.get("strategy_alloc_institutional_follow"),
  });

  return {
    maxPositions: Number(cfgMap.get("max_positions") ?? 5) || 5,
    maxPerSector: Number(cfgMap.get("max_per_sector") ?? 2),
    strategyAllocations,
  };
}

// ─── 일일 리포트 + 포트폴리오 스냅샷 저장 ───────────
async function runEndOfDay(
  config: EngineConfig,
  allActions: { type: string }[],
  cfgMap: Map<string, unknown>,
  todayKst: string
): Promise<void> {
  const lastReportDate = cfgMap.get("last_daily_report_date");
  if (lastReportDate === todayKst) return;

  try {
    const [closedData, runsData] = await Promise.all([
      supabase.from("positions").select("*").eq("status", "closed").gte("exit_date", todayKst),
      supabase.from("engine_runs").select("trade_count, scanned_count").gte("created_at", todayKst),
    ]);
    const closedPositions = closedData.data ?? [];
    const runs = runsData.data ?? [];

    const buyCount  = allActions.filter((a) => ["buy", "approved_buy", "split_buy_1", "split_buy_2", "surge_buy"].includes(a.type)).length;
    const sellCount = allActions.filter((a) => ["stop_loss", "take_profit", "max_hold_sell"].includes(a.type)).length;
    const realizedPnlAmt = closedPositions.reduce((s: number, p: Record<string, unknown>) => s + (Number(p.pnl_amount) || 0), 0);
    const realizedPnlPct = closedPositions.reduce((s: number, p: Record<string, unknown>) => s + (Number(p.pnl_percent) || 0), 0);
    const totalScanned   = runs.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.scanned_count) || 0), 0);

    const { data: openPosData } = await supabase.from("positions").select("id").eq("status", "open");
    const openPositions = openPosData?.length ?? 0;

    await sendDailyReport({
      date: todayKst,
      tradeCount: buyCount + sellCount,
      buyCount, sellCount,
      realizedPnlAmt, realizedPnlPct,
      openPositions, engineRuns: runs.length,
      scannedCount: totalScanned,
      details: closedPositions.map((p: Record<string, unknown>) => ({
        name: (p.stock_name ?? p.stock_code) as string,
        code: p.stock_code as string,
        pnlAmt: Number(p.pnl_amount) || 0,
        pnlPct: Number(p.pnl_percent) || 0,
        reason: (p.exit_reason ?? "") as string,
      })),
    });

    await supabase.from("app_config").upsert({ key: "last_daily_report_date", value: todayKst, updated_at: new Date().toISOString() });

    try {
      const balRes = await getBalance(config);
      const balSummary = (balRes?.output2 ?? [])[0] ?? {};
      const totalEval = Number(balSummary.tot_evlu_amt) || 0;
      const cashBal   = Number(balSummary.dnca_tot_amt) || 0;
      const totalPnl  = closedPositions.reduce((s: number, p: Record<string, unknown>) => s + (Number(p.pnl_amount) || 0), 0);
      if (totalEval > 0) {
        await supabase.from("portfolio_snapshots").upsert(
          { date: todayKst, total_eval: Math.round(totalEval), total_pnl: Math.round(totalPnl), cash_balance: Math.round(cashBal), open_positions: openPositions },
          { onConflict: "date" }
        );
      }
    } catch (snapErr) {
      const msg = snapErr instanceof Error ? snapErr.message : "스냅샷 저장 실패";
      await logEngineRun(0, [{ type: "snapshot_failed", code: "", detail: msg }], 0, 0, msg);
    }
  } catch (reportErr) {
    const msg = reportErr instanceof Error ? reportErr.message : "일일 리포트 발송 실패";
    await logEngineRun(0, [{ type: "report_failed", code: "", detail: msg }], 0, 0, msg);
  }
}

// ─── 엔진 오케스트레이터 ─────────────────────────
async function runEngine(config: EngineConfig) {
  const startTime = Date.now();
  let scannedCount = 0;

  try {
    const { data: appConfigs } = await supabase.from("app_config").select("key, value");
    const cfgMap = new Map((appConfigs || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));

    const skipReason = getEngineSkipReason(cfgMap);
    if (skipReason) {
      await logEngineRun(0, [{ type: "skipped", code: "", detail: skipReason }], 0, 0);
      return NextResponse.json({ skipped: true, reason: skipReason });
    }

    const { maxPositions, maxPerSector, strategyAllocations } = applyAppConfig(config, cfgMap);

    let learning = null;
    try { learning = await loadLatestLearning(); } catch { /* 학습 로딩 실패 시 기본값 사용 */ }
    const applied = applyLearning(learning, config);

    const ctx: StepContext = {
      config, applied,
      maxPerTrade:    config.maxPerTrade    ?? 1000000,
      maxDailyTrades: config.maxDailyTrades ?? 5,
      maxPositions,
      maxPerSector,
      takeProfitRatio: applied.takeProfitRatio,
      dailyLossLimit:  config.dailyLossLimit ?? -3,
      strongScore: config.strongScore ?? 70,
      weakScore:   config.weakScore   ?? 40,
      rsiBuy:      config.rsiBuy      ?? 30,
      rsiSell:     config.rsiSell     ?? 70,
      strategyAllocations,
      customWeights: applied.weights,
    };

    const step0 = await runStep0(ctx);

    if (step0.marketTrend) {
      const isTrending = step0.marketTrend.kospiRate > KOSPI_TRENDING_THRESHOLD;
      const regimeP = isTrending ? config.trendingParams : config.rangingParams;
      if (regimeP) {
        ctx.rsiBuy      = regimeP.rsiBuy;
        ctx.rsiSell     = regimeP.rsiSell;
        ctx.strongScore = regimeP.strongScore;
        ctx.weakScore   = regimeP.weakScore;
      }
    }
    if (step0.halted) {
      const durationMs = Date.now() - startTime;
      await logEngineRun(0, step0.actions, 0, durationMs);
      return NextResponse.json({ timestamp: new Date().toISOString(), tradeCount: 0, halted: true, reason: step0.haltReason });
    }

    const step1 = await runStep1(ctx, step0.marketTrend);
    let tradeCount = step1.tradeCount;

    const step15 = await runStep15(ctx, step1.holdings, tradeCount);
    tradeCount = step15.tradeCount;

    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const { data: snapshots } = await supabase.from("market_snapshots").select("*").eq("date", today);
    const snapshotMap = new Map<string, { open_price: number; snapshot_price: number; snapshot_volume: number }>();
    for (const s of snapshots || []) {
      snapshotMap.set(s.stock_code, { open_price: Number(s.open_price), snapshot_price: Number(s.snapshot_price), snapshot_volume: Number(s.snapshot_volume) });
    }

    const step2 = await runStep2(ctx, step1.holdings, step0.marketTrend, snapshotMap, tradeCount);
    tradeCount = step2.tradeCount;
    scannedCount += step2.scannedCount;

    const step3 = await runStep3(ctx, step1.holdings, step0.marketTrend, tradeCount);
    tradeCount = step3.tradeCount;
    scannedCount += step3.scannedCount;

    const step4 = await runStep4(ctx, step1.holdings, step0.marketTrend, tradeCount);
    tradeCount = step4.tradeCount;
    scannedCount += step4.scannedCount;

    const allActions = [...step0.actions, ...step1.actions, ...step15.actions, ...step2.actions, ...step3.actions, ...step4.actions];
    const durationMs = Date.now() - startTime;
    await logEngineRun(tradeCount, allActions, scannedCount, durationMs);

    if (getKstNowParts().hhmm >= END_OF_DAY_TIME) {
      await runEndOfDay(config, allActions, cfgMap, today);
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      tradeCount, scannedCount, durationMs, actions: allActions,
      learning: learning ? {
        confidence: learning.confidence,
        sampleSize: learning.sampleSize,
        weightsSource: applied.weights ? "learned" : "default",
        atrSource: learning.atrMultipliers.source,
        applied: {
          takeProfitRatio: applied.takeProfitRatio,
          targetRiskAmount: applied.targetRiskAmount,
          atrMultipliers: applied.atrMultipliers,
        },
        strategyAllocations,
      } : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "엔진 실행 실패";
    const durationMs = Date.now() - startTime;
    await logEngineRun(0, [], scannedCount, durationMs, msg);
    await sendEngineErrorAlert(msg, durationMs).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
