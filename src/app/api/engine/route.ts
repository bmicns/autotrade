import { NextResponse } from "next/server";
import { loadLatestLearning, applyLearning, buildLearningRiskAdjustments } from "@/lib/learning";
import { type EngineConfig, type StepContext } from "@/lib/engine/types";
import { resolveAvailableCash, resolveBalanceCashAmount } from "@/lib/engine/balance-summary";
import { cleanupStalePendingOrders, logEngineRun, reconcileBrokerPositionDrift, syncBrokerHoldingsToPositions } from "@/lib/engine/db";
import { supabase } from "@/lib/supabase/api-client";
import { runStep0, runStep1, runStep15 } from "@/lib/engine/steps";
import { END_OF_DAY_TIME, ENGINE_CONSECUTIVE_ERROR_HALT_COUNT, ENGINE_CONSECUTIVE_TOKEN_ERROR_HALT_COUNT } from "@/lib/engine/constants";
import { getEngineSkipReason, getKstNowParts } from "@/lib/engine/market-calendar";
import { runStep2, runStep3, runStep4 } from "@/lib/engine/steps-scan";
import { getBalance } from "@/lib/engine/kis";
import { compareBrokerHoldingsWithDb } from "@/lib/engine/broker-sync";
import { summarizePendingOrders } from "@/lib/engine/read-model";
import { resolveRuntimeTradingBlockers } from "@/lib/engine/engine-safety";
import { summarizeEntryPressure, summarizeSectorExposure } from "@/lib/engine/risk-budget";
import { summarizeOperationalAlerts } from "@/lib/engine/alert-priority";
import { resolveConfiguredPerStockEntryLimit } from "@/lib/engine/surge-strategy";
import { sendDailyReport, sendEngineErrorAlert } from "@/lib/engine/notify";
import { CURRENT_SELL_ACTION_TYPES } from "@/lib/engine/lifecycle";
import { getKisCredentialCandidates, persistKisConfig, type RuntimeKisConfig } from "@/lib/kis/runtime-config";
import { KISError } from "@/lib/kis/api";
import { resolveKisAccessToken } from "@/lib/kis/runtime-token";
import { validateRequiredEnv } from "@/lib/config-validator";
import { withRetry } from "@/lib/engine/retry";
import { applyEngineAppConfig, DEFAULT_ENGINE_CONFIG, readEngineControlSnapshot } from "@/lib/engine/control";
import { resolveEngineLockState } from "@/lib/engine/recovery";
import { resolveRecentFailureHalt } from "@/lib/engine/run-health";
import { requireCronBearerAuth } from "@/lib/request-guard";
import { recordEngineEvent } from "@/lib/engine/event-log";

async function markEngineStage(stage: string, payload: Record<string, unknown> = {}) {
  await recordEngineEvent({
    eventType: "engine_stage_marker",
    stockCode: null,
    entityTable: "operations",
    entityId: null,
    payload: {
      stage,
      ...payload,
      marked_at: new Date().toISOString(),
    },
  });
}

async function loadRecentFailureHaltReason(): Promise<string | null> {
  const { data } = await supabase
    .from("engine_runs")
    .select("error, actions")
    .order("run_at", { ascending: false })
    .limit(Math.max(ENGINE_CONSECUTIVE_ERROR_HALT_COUNT, ENGINE_CONSECUTIVE_TOKEN_ERROR_HALT_COUNT, 3));

  return resolveRecentFailureHalt(data ?? []);
}

async function loadRecentOrderFailureSummary() {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("engine_state_events")
    .select("payload")
    .eq("event_type", "order_failure_recorded")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []).reduce((summary, row) => {
    const payload = (row.payload as Record<string, unknown> | null) ?? null;
    const category = String(payload?.category ?? "unknown");
    if (category === "account") summary.account += 1;
    else if (category === "capacity") summary.capacity += 1;
    else if (category === "retryable") summary.retryable += 1;
    else summary.unknown += 1;
    return summary;
  }, { account: 0, capacity: 0, retryable: 0, unknown: 0 });
}

function formatKisFailureMessage(error: unknown): string {
  if (error instanceof KISError) {
    const code = error.kisCode ? ` ${error.kisCode}` : "";
    return `${error.status}${code} ${error.detail}`.trim();
  }
  if (error instanceof Error) return error.message;
  return "토큰 오류";
}

function formatKisCandidateLabel(candidate: { source: "env" | "db"; profileId: string }) {
  return `${candidate.source}/${candidate.profileId}`;
}

async function reconcilePostTradeBrokerState(config: EngineConfig) {
  const balanceData = await getBalance(config);
  const brokerHoldings = (balanceData?.output1 ?? []) as Array<Record<string, string>>;
  const actions: Array<{ type: string; code: string; detail: string }> = [];

  const restoredPositions = await syncBrokerHoldingsToPositions(brokerHoldings);
  for (const restored of restoredPositions) {
    actions.push({
      type: "position_reconciled",
      code: restored.code,
      detail: `실주문 후 정합성 복구: 실잔고 기준 포지션 복구 ${restored.qty}주`,
    });
  }

  const driftResolution = await reconcileBrokerPositionDrift(brokerHoldings);
  for (const adjusted of driftResolution.qtyAdjusted) {
    actions.push({
      type: "position_reconciled",
      code: adjusted.code,
      detail: `실주문 후 정합성 복구: 실잔고 기준 수량 보정 ${adjusted.fromQty}주 -> ${adjusted.toQty}주`,
    });
  }
  for (const orphaned of driftResolution.orphanedClosed) {
    actions.push({
      type: "position_reconciled",
      code: orphaned.code,
      detail: `실주문 후 정합성 복구: 브로커 미보유 포지션 정리 ${orphaned.qty}주`,
    });
  }

  return actions;
}

async function resolveKisCredentials(): Promise<
  | { ok: true; creds: RuntimeKisConfig; token: string; source: "env" | "db"; profileId: string }
  | { ok: false; detail: string }
> {
  const candidates = (await getKisCredentialCandidates()).map(({ source, config, profileId }) => ({ source, creds: config, profileId }));
  if (candidates.length === 0) {
    return { ok: false, detail: "KIS 자격증명 미설정 (kis_config / env)" };
  }

  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      if (candidate.source === "env") {
        await persistKisConfig(candidate.creds, candidate.profileId);
      }
      const token = await withRetry(
        () => resolveKisAccessToken(candidate.profileId, candidate.creds.appKey, candidate.creds.appSecret),
        { maxAttempts: 3, baseDelayMs: 1000 },
      );
      return { ok: true, creds: candidate.creds, token, source: candidate.source, profileId: candidate.profileId };
    } catch (e) {
      failures.push(`${formatKisCandidateLabel(candidate)}:${formatKisFailureMessage(e)}`);
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
export async function runEngineRequest() {
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
  const recoveryActions: Array<{ type: string; code: string; detail: string }> = [];
  const lockState = resolveEngineLockState(lockRow?.value);
  if (lockState.locked && lockState.lockedAt) {
    return NextResponse.json({ skipped: true, reason: `engine_lock: 이미 실행 중 (since: ${lockState.lockedAt})` });
  }
  if (lockState.stale && lockState.lockedAt) {
    recoveryActions.push({
      type: "stale_lock_recovered",
      code: "",
      detail: `stale engine_lock 자동 회복 · ${lockState.ageMinutes ?? "?"}분 경과`,
    });
  }

  // 3. 엔진 락 획득
  const now = new Date().toISOString();
  await supabase.from("app_config").upsert({ key: "engine_lock", value: now, updated_at: now });

  try {
    // 4. cleanupStaleSignals (기존)
    await cleanupStaleSignals();
    const stalePendingOrderCleanup = await cleanupStalePendingOrders();
    if (stalePendingOrderCleanup.cleanedCount > 0) {
      recoveryActions.push({
        type: "stale_pending_orders_cleaned",
        code: "",
        detail: `stale pending order 자동 정리 ${stalePendingOrderCleanup.cleanedCount}건`,
      });
    }
    
    // 5. getEngineSkipReason (기존)
    const { data: appConfigs } = await supabase.from("app_config").select("key, value");
    const cfgMap = new Map((appConfigs || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    const skipReason = getEngineSkipReason(cfgMap);
    if (skipReason) {
      await logEngineRun(0, [...recoveryActions, { type: "skipped", code: "", detail: skipReason }], 0, 0);
      return NextResponse.json({ skipped: true, reason: skipReason });
    }

    // 6. resolveKisCredentials (withRetry 적용)
    const resolved = await resolveKisCredentials();
    if (!resolved.ok) {
      const detail = `KIS 토큰 발급 실패: ${resolved.detail}`;
      await logEngineRun(0, [...recoveryActions, { type: "token_error", code: "", detail }], 0, 0, detail);
      return NextResponse.json({ error: "토큰 발급 실패", detail: resolved.detail }, { status: 500 });
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

    // 7. 엔진 실행
    return await runEngine(config, recoveryActions);
  } finally {
    // 8. 락 해제 (정상 완료 / 오류 모두)
    const releaseTime = new Date().toISOString();
    try { await supabase.from("app_config").upsert({ key: "engine_lock", value: "", updated_at: releaseTime }); } catch { /* ignore */ }
  }
}

export async function GET(req: Request) {
  const guard = requireCronBearerAuth(req);
  if (guard) return guard;

  return runEngineRequest();
}

// KOSPI 등락률 기준 추세장 판정 임계값 (일평균 변동률 고려: 0.5%면 확실한 상승 모멘텀)
const KOSPI_TRENDING_THRESHOLD = 0.5;
const AVAILABLE_CASH_BUDGET_RATIO = 0.7;

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
    const sellCount = allActions.filter((a) => CURRENT_SELL_ACTION_TYPES.has(a.type)).length;
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
      const cashBal   = resolveBalanceCashAmount(balSummary);
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
async function runEngine(
  config: EngineConfig,
  recoveryActions: Array<{ type: string; code: string; detail: string }> = [],
) {
  const startTime = Date.now();
  let scannedCount = 0;

  try {
    await markEngineStage("run_engine_started");
    const { data: appConfigs } = await supabase.from("app_config").select("key, value");
    const cfgMap = new Map((appConfigs || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    await markEngineStage("app_config_loaded", { config_count: cfgMap.size });

    const skipReason = getEngineSkipReason(cfgMap);
    if (skipReason) {
      await markEngineStage("engine_skipped", { reason: skipReason });
      await logEngineRun(0, [...recoveryActions, { type: "skipped", code: "", detail: skipReason }], 0, 0);
      return NextResponse.json({ skipped: true, reason: skipReason });
    }

    const failureHaltReason = await loadRecentFailureHaltReason();
    if (failureHaltReason) {
      await markEngineStage("failure_halt", { reason: failureHaltReason });
      await logEngineRun(0, [...recoveryActions, { type: "risk_halt", code: "", detail: failureHaltReason }], 0, 0, failureHaltReason);
      await sendEngineErrorAlert(`자동 정지: ${failureHaltReason}`, 0).catch(() => {});
      return NextResponse.json({ halted: true, reason: failureHaltReason }, { status: 503 });
    }

  const { maxPositions, maxPerSector, strategyAllocations } = applyEngineAppConfig(config, cfgMap);

    let learning = null;
    try { learning = await loadLatestLearning(); } catch { /* 학습 로딩 실패 시 기본값 사용 */ }
    let riskAdjustments = undefined;
    try { riskAdjustments = await buildLearningRiskAdjustments(180); } catch { /* 학습 보정 실패 시 무시 */ }
    const learningRiskEnabled = config.learningRiskAdjustmentsEnabled !== false;
    const applied = applyLearning(
      learning,
      config,
      learningRiskEnabled
        ? riskAdjustments
        : { surgeEntryTagPenalties: {}, timeBucketPenalties: {}, newsKeywordPenalties: {} },
    );
    await markEngineStage("learning_applied", { learning_loaded: !!learning, learning_risk_enabled: learningRiskEnabled });

    const balanceData = await getBalance(config);
    await markEngineStage("balance_loaded", {
      holdings_count: Array.isArray(balanceData?.output1) ? balanceData.output1.length : 0,
      balance_row_count: Array.isArray(balanceData?.output2) ? balanceData.output2.length : 0,
    });
    const balanceSummary = (balanceData?.output2 ?? [])[0] ?? {};
    const totalCapital = Number(balanceSummary.tot_evlu_amt) || 0;
    const availableCash = resolveAvailableCash(balanceSummary);
    const capitalBase = availableCash > 0
      ? Math.floor(availableCash * AVAILABLE_CASH_BUDGET_RATIO)
      : totalCapital > 0
        ? totalCapital
        : (config.maxPerTrade ?? 1_000_000);

    const staleApprovedCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const staleProcessingCutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const [openPositionsRes, staleSignalsRes, pendingOrdersRes, recentOrderFailureSummary, todayEntryEventsRes] = await Promise.all([
      supabase
        .from("positions")
        .select("stock_code, stock_name, entry_qty, partial_exit_qty, sector")
        .eq("status", "open"),
      supabase
        .from("pending_signals")
        .select("id, status")
        .or(`and(status.eq.approved,created_at.lt.${staleApprovedCutoff}),and(status.eq.processing,created_at.lt.${staleProcessingCutoff})`)
        .limit(20),
      supabase.from("pending_orders").select("id, created_at").limit(50),
      loadRecentOrderFailureSummary(),
      supabase
        .from("engine_state_events")
        .select("stock_code, payload")
        .eq("event_type", "pending_order_saved")
        .gte("created_at", getKstNowParts().date)
        .limit(200),
    ]);
    await markEngineStage("pretrade_state_loaded", {
      open_positions_count: openPositionsRes.data?.length ?? 0,
      stale_signal_count: staleSignalsRes.data?.length ?? 0,
      pending_order_count: pendingOrdersRes.data?.length ?? 0,
      today_entry_event_count: todayEntryEventsRes.data?.length ?? 0,
    });

    let openPositionsRows = (openPositionsRes.data ?? []) as Array<Record<string, unknown>>;
    const brokerMismatch = compareBrokerHoldingsWithDb(
      (balanceData?.output1 ?? []) as Array<Record<string, unknown>>,
      openPositionsRows,
    );
    let brokerMismatchCount =
      brokerMismatch.missingInDb.length + brokerMismatch.qtyMismatch.length + brokerMismatch.orphanedDb.length;
    const pretradeReconcileActions: Array<{ type: string; code: string; detail: string }> = [];

    if (brokerMismatchCount > 0) {
      await markEngineStage("pretrade_reconcile_started", { broker_mismatch_count: brokerMismatchCount });
      const brokerHoldings = (balanceData?.output1 ?? []) as Array<Record<string, string>>;
      const restoredPositions = await syncBrokerHoldingsToPositions(brokerHoldings);
      for (const restored of restoredPositions) {
        pretradeReconcileActions.push({
          type: "position_reconciled",
          code: restored.code,
          detail: `사전 정합성 복구: 실잔고 기준 포지션 복구 ${restored.qty}주`,
        });
      }

      const driftResolution = await reconcileBrokerPositionDrift(brokerHoldings);
      for (const adjusted of driftResolution.qtyAdjusted) {
        pretradeReconcileActions.push({
          type: "position_reconciled",
          code: adjusted.code,
          detail: `사전 정합성 복구: 실잔고 기준 수량 보정 ${adjusted.fromQty}주 -> ${adjusted.toQty}주`,
        });
      }
      for (const orphaned of driftResolution.orphanedClosed) {
        pretradeReconcileActions.push({
          type: "position_reconciled",
          code: orphaned.code,
          detail: `사전 정합성 복구: 브로커 미보유 포지션 정리 ${orphaned.qty}주`,
        });
      }

      const { data: openPositionsAfterRecovery } = await supabase
        .from("positions")
        .select("stock_code, stock_name, entry_qty, partial_exit_qty, sector")
        .eq("status", "open");
      openPositionsRows = (openPositionsAfterRecovery ?? []) as Array<Record<string, unknown>>;

      const postRecoveryMismatch = compareBrokerHoldingsWithDb(
        (balanceData?.output1 ?? []) as Array<Record<string, unknown>>,
        openPositionsRows,
      );
      brokerMismatchCount =
        postRecoveryMismatch.missingInDb.length +
        postRecoveryMismatch.qtyMismatch.length +
        postRecoveryMismatch.orphanedDb.length;
      await markEngineStage("pretrade_reconcile_completed", { broker_mismatch_count: brokerMismatchCount });
    }

    const staleSignalCount = staleSignalsRes.data?.length ?? 0;
    const stalePendingOrderCount = summarizePendingOrders(
      ((pendingOrdersRes.data ?? []) as Array<{ id: string; created_at: string }>).map((row) => ({
        id: row.id,
        stock_code: "",
        stock_name: null,
        order_no: "",
        order_qty: 0,
        limit_price: 0,
        signal_score: null,
        strategy_key: null,
        created_at: row.created_at,
      })),
    ).pendingOrderStaleCount;
    const ctx: StepContext = {
      config, applied,
      maxPerTrade:    capitalBase,
      totalCapital:   capitalBase,
      availableCash,
      maxDailyTrades: config.maxDailyTrades ?? 5,
      maxPositions,
      maxPerSector,
      partialExitRatio: applied.partialExitRatio,
      dailyLossLimit:  config.dailyLossLimit ?? -3,
      strongScore: config.strongScore ?? 70,
      weakScore:   config.weakScore   ?? 40,
      rsiBuy:      config.rsiBuy      ?? 30,
      rsiSell:     config.rsiSell     ?? 70,
      strategyAllocations,
      customWeights: applied.weights,
    };
    await markEngineStage("step_context_ready", { capital_base: capitalBase, available_cash: availableCash });

    const step0 = await runStep0(ctx);
    await markEngineStage("step0_completed", {
      halted: step0.halted,
      action_count: step0.actions.length,
      market_bonus: step0.marketTrend?.bonus ?? null,
    });

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
      await markEngineStage("step0_halted", { reason: step0.haltReason ?? null });
      const durationMs = Date.now() - startTime;
      await logEngineRun(0, [...recoveryActions, ...pretradeReconcileActions, ...step0.actions], 0, durationMs);
      return NextResponse.json({ timestamp: new Date().toISOString(), tradeCount: 0, halted: true, reason: step0.haltReason });
    }

    const step1 = await runStep1(ctx);
    await markEngineStage("step1_completed", {
      trade_count: step1.tradeCount,
      holding_count: step1.holdings.length,
      action_count: step1.actions.length,
    });
    let tradeCount = step1.tradeCount;
    let reconcileRecoveryAction:
      | {
          type: string;
          code: string;
          detail: string;
        }
      | null = null;

    if (brokerMismatchCount > 0) {
      const { data: openPositionsAfterStep1 } = await supabase
        .from("positions")
        .select("stock_code, stock_name, entry_qty, partial_exit_qty, sector")
        .eq("status", "open");
      const postStep1Mismatch = compareBrokerHoldingsWithDb(
        step1.holdings as Array<Record<string, unknown>>,
        (openPositionsAfterStep1 ?? []) as Array<Record<string, unknown>>,
      );
      const postStep1MismatchCount =
        postStep1Mismatch.missingInDb.length + postStep1Mismatch.qtyMismatch.length + postStep1Mismatch.orphanedDb.length;

      if (postStep1MismatchCount > 0) {
        await markEngineStage("post_step1_reconcile_halt", { broker_mismatch_count: postStep1MismatchCount });
        const reason = `브로커-DB 정합성 불일치 ${postStep1MismatchCount}건`;
        const actions = [
          ...recoveryActions,
          ...pretradeReconcileActions,
          ...step0.actions,
          ...step1.actions,
          {
            type: "risk_halt",
            code: "",
            detail: `${reason} (손절/리컨실 후에도 미해소)`,
          },
        ];
        const durationMs = Date.now() - startTime;
        await logEngineRun(tradeCount, actions, scannedCount, durationMs, reason);
        await sendEngineErrorAlert(
          `자동 정지: ${reason}`,
          durationMs,
          summarizeOperationalAlerts(actions.map((action) => action.detail)),
        ).catch(() => {});
        return NextResponse.json({ halted: true, reason }, { status: 503 });
      }

      reconcileRecoveryAction = {
        type: "position_reconciled",
        code: "",
        detail: `리컨실 자동복구 완료 ${brokerMismatchCount}건 후 손절 평가 계속`,
      };
    }

    const tradingBlockers = resolveRuntimeTradingBlockers({
      brokerMismatchCount,
      stalePendingOrderCount,
      staleSignalCount,
      recentOrderFailures: recentOrderFailureSummary,
      sectorOverload: (() => {
        const control = readEngineControlSnapshot(cfgMap);
        const sectorExposure = summarizeSectorExposure(
          openPositionsRows as Array<{ sector?: unknown }>,
          control.max_per_sector,
        );
        const first = sectorExposure.overloadedSectors[0];
        return {
          count: sectorExposure.overloadedCount,
          firstSector: first?.sector ?? null,
          firstCount: first?.count ?? null,
          maxPerSector: control.max_per_sector,
        };
      })(),
      entryPressure: (() => {
        const control = readEngineControlSnapshot(cfgMap);
        const summary = summarizeEntryPressure(
          ((todayEntryEventsRes.data ?? []) as Array<{ stock_code?: unknown; payload?: Record<string, unknown> | null }>).map((row) => ({
            stock_code: row.stock_code,
            strategy_key: row.payload?.strategy_key ?? null,
          })),
          (strategyKey) => resolveConfiguredPerStockEntryLimit(strategyKey as "surge_momentum" | null, control.surge_max_daily_entries_per_stock),
        );
        const first = summary.stocks[0];
        return {
          overflowCount: summary.overflowCount,
          firstCode: first?.code ?? null,
          firstCount: first?.count ?? null,
          firstLimit: first?.limit ?? null,
        };
      })(),
    });

    if (tradingBlockers.length > 0) {
      await markEngineStage("runtime_blockers_halt", { blocker_count: tradingBlockers.length });
      const actions = tradingBlockers.map((blocker) => ({
        type: "risk_halt",
        code: "",
        detail: blocker.detail,
      }));
      const reason = tradingBlockers.map((blocker) => blocker.detail).join(" / ");
      const durationMs = Date.now() - startTime;
      await logEngineRun(
        tradeCount,
        [...recoveryActions, ...pretradeReconcileActions, ...step0.actions, ...step1.actions, ...(reconcileRecoveryAction ? [reconcileRecoveryAction] : []), ...actions],
        0,
        durationMs,
        reason,
      );
      await sendEngineErrorAlert(
        `자동 정지: ${reason}`,
        durationMs,
        summarizeOperationalAlerts([
          ...pretradeReconcileActions.map((action) => action.detail),
          ...step0.actions.map((action) => action.detail),
          ...step1.actions.map((action) => action.detail),
          ...(reconcileRecoveryAction ? [reconcileRecoveryAction.detail] : []),
          ...tradingBlockers.map((blocker) => blocker.detail),
        ]),
      ).catch(() => {});
      return NextResponse.json({ halted: true, reason, tradeCount }, { status: 503 });
    }

    const step15 = await runStep15(ctx, step1.holdings, tradeCount);
    tradeCount = step15.tradeCount;
    await markEngineStage("step15_completed", {
      trade_count: tradeCount,
      action_count: step15.actions.length,
    });

    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const { data: snapshots } = await supabase.from("market_snapshots").select("*").eq("date", today);
    const snapshotMap = new Map<string, { open_price: number; snapshot_price: number; snapshot_volume: number }>();
    for (const s of snapshots || []) {
      snapshotMap.set(s.stock_code, { open_price: Number(s.open_price), snapshot_price: Number(s.snapshot_price), snapshot_volume: Number(s.snapshot_volume) });
    }
    await markEngineStage("market_snapshots_loaded", { snapshot_count: snapshotMap.size });

    const step2 = await runStep2(ctx, step1.holdings, step0.marketTrend, snapshotMap, tradeCount);
    tradeCount = step2.tradeCount;
    scannedCount += step2.scannedCount;
    await markEngineStage("step2_completed", {
      trade_count: tradeCount,
      scanned_count: scannedCount,
      action_count: step2.actions.length,
    });

    const step3 = await runStep3(ctx, step1.holdings, step0.marketTrend, tradeCount);
    tradeCount = step3.tradeCount;
    scannedCount += step3.scannedCount;
    await markEngineStage("step3_completed", {
      trade_count: tradeCount,
      scanned_count: scannedCount,
      action_count: step3.actions.length,
    });

    const step4 = await runStep4(ctx, step1.holdings, step0.marketTrend, tradeCount);
    tradeCount = step4.tradeCount;
    scannedCount += step4.scannedCount;
    await markEngineStage("step4_completed", {
      trade_count: tradeCount,
      scanned_count: scannedCount,
      action_count: step4.actions.length,
    });
    const postTradeReconcileActions = await reconcilePostTradeBrokerState(config);
    await markEngineStage("post_trade_reconcile_completed", { action_count: postTradeReconcileActions.length });

    const learningRiskAction = {
      type: learningRiskEnabled ? "learning_risk_enabled" : "learning_risk_disabled",
      code: "",
      detail: learningRiskEnabled ? "학습 리스크 보정 ON" : "학습 리스크 보정 OFF",
    };
    const allActions = [
      ...recoveryActions,
      learningRiskAction,
      ...pretradeReconcileActions,
      ...step0.actions,
      ...step1.actions,
      ...(reconcileRecoveryAction ? [reconcileRecoveryAction] : []),
      ...step15.actions,
      ...step2.actions,
      ...step3.actions,
      ...step4.actions,
      ...postTradeReconcileActions,
    ];
    const durationMs = Date.now() - startTime;
    await logEngineRun(tradeCount, allActions, scannedCount, durationMs);
    await markEngineStage("engine_run_logged", {
      trade_count: tradeCount,
      scanned_count: scannedCount,
      duration_ms: durationMs,
    });

    if (getKstNowParts().hhmm >= END_OF_DAY_TIME) {
      await runEndOfDay(config, allActions, cfgMap, today);
      await markEngineStage("end_of_day_completed");
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
          partialExitRatio: applied.partialExitRatio,
          targetRiskAmount: applied.targetRiskAmount,
          atrMultipliers: applied.atrMultipliers,
          riskAdjustments: applied.riskAdjustments,
          learningRiskEnabled,
        },
        strategyAllocations,
      } : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "엔진 실행 실패";
    const durationMs = Date.now() - startTime;
    await markEngineStage("engine_run_failed", { error: msg.slice(0, 200), duration_ms: durationMs });
    await logEngineRun(0, [], scannedCount, durationMs, msg);
    await sendEngineErrorAlert(msg, durationMs).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
