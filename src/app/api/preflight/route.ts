import { NextResponse } from "next/server";
import { compareBrokerHoldingsWithDb } from "@/lib/engine/broker-sync";
import { compareClosedPositionPnl } from "@/lib/engine/pnl-audit";
import { getEngineLockState, isEngineEnabled } from "@/lib/engine/app-config";
import { DEFAULT_ENGINE_CONFIG, readEngineControlSnapshot, resolveEngineHealth } from "@/lib/engine/control";
import { resolveAvailableCash } from "@/lib/engine/balance-summary";
import { summarizeEntryPressure, summarizeRiskBudget, summarizeSectorExposure } from "@/lib/engine/risk-budget";
import { getKstNowParts, getMarketClosureReason } from "@/lib/engine/market-calendar";
import { resolveConfiguredPerStockEntryLimit } from "@/lib/engine/surge-strategy";
import { summarizePendingOrders } from "@/lib/engine/read-model";
import { validateAdminAuthEnv, validateRequiredEnv } from "@/lib/config-validator";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { getBalance, getOrderHistory, getTokenDetails } from "@/lib/kis/api";
import { KIS_RUNTIME_MODE, NEXIO_ENV } from "@/lib/constants";
import { getKisProfileLabel, maskKisAccountNo } from "@/lib/kis/profile";
import { summarizeManualIntentHealth, summarizeOrderLifecycle, summarizeOrderTimelineRisk } from "@/lib/engine/order-timeline";
import { applyRehearsalEvidence, normalizeRehearsalChecklist, summarizeRehearsalChecklist, type RehearsalEvidenceMap } from "@/lib/operations/rehearsal-checklist";
import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";

type CheckStatus = "pass" | "warn" | "fail";
type CheckImpact = "advisory" | "ops_blocker" | "trading_blocker";

type PreflightCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  impact: CheckImpact;
  blocksTrading: boolean;
  metadata?: Record<string, unknown>;
};

type EngineStateEventRow = {
  event_type?: string | null;
  created_at?: string | null;
  payload?: Record<string, unknown> | null;
};

const BROKER_RECONCILE_GRACE_MS = 2 * 60 * 1000;

function summarizeRecentOrderFailures(rows: EngineStateEventRow[]) {
  const cutoffMs = Date.now() - 60 * 60 * 1000;
  return rows.reduce((summary, row) => {
    if (String(row.event_type ?? "") !== "order_failure_recorded") return summary;
    const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : NaN;
    if (!Number.isFinite(createdAtMs) || createdAtMs < cutoffMs) return summary;
    const category = String(row.payload?.category ?? "unknown");
    summary.total += 1;
    if (category === "account") summary.account += 1;
    else if (category === "capacity") summary.capacity += 1;
    else if (category === "retryable") summary.retryable += 1;
    else summary.unknown += 1;
    return summary;
  }, { total: 0, account: 0, capacity: 0, retryable: 0, unknown: 0 });
}

function summarizeStatus(checks: PreflightCheck[]): CheckStatus {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

function summarizeReadiness(checks: PreflightCheck[]) {
  const blockingChecks = checks.filter((check) => check.blocksTrading);
  const advisoryWarnChecks = checks.filter((check) => !check.blocksTrading && check.status === "warn");
  return {
    autoTradingReady: blockingChecks.length === 0,
    livePromotionReady: blockingChecks.length === 0 && advisoryWarnChecks.length === 0,
    blockingCount: blockingChecks.length,
    advisoryWarnCount: advisoryWarnChecks.length,
  };
}

function getCheckPriority(check: PreflightCheck) {
  if (check.blocksTrading && check.status === "fail") return 0;
  if (check.blocksTrading) return 1;
  if (check.status === "warn" && check.impact === "ops_blocker") return 2;
  if (check.status === "warn") return 3;
  return 4;
}

function sortChecks(checks: PreflightCheck[]) {
  return [...checks].sort((a, b) => {
    const priorityDiff = getCheckPriority(a) - getCheckPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    return a.label.localeCompare(b.label, "ko");
  });
}

async function persistIssuedToken(token: string, tokenExpiry: string | null) {
  await supabase
    .from("kis_config")
    .update({
      token,
      token_expiry: tokenExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");
}

export async function GET() {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const closedCutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const rehearsalCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const staleApprovedCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const staleProcessingCutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const kstNow = getKstNowParts();

  try {
    const engineEnvCheck = validateRequiredEnv();
    const adminAuthEnvCheck = validateAdminAuthEnv();
    const activeConfig = await getActiveKisConfig();
    const tokenRowPromise = supabase.from("kis_config").select("token, token_expiry").eq("id", "default").maybeSingle();
    const latestRunPromise = supabase.from("engine_runs").select("run_at, error").order("run_at", { ascending: false }).limit(1).maybeSingle();
    const appConfigsPromise = supabase.from("app_config").select("key, value");
    const watchlistPromise = supabase.from("watchlist").select("code").eq("active", true);
    const positionsPromise = supabase
      .from("positions")
      .select("stock_code, stock_name, entry_qty, partial_exit_qty, sector")
      .eq("status", "open");
    const closedPositionsPromise = supabase
      .from("positions")
      .select("id, stock_code, stock_name, exit_date, exit_reason, pnl_amount, pnl_percent")
      .eq("status", "closed")
      .gte("exit_date", closedCutoff)
      .order("exit_date", { ascending: false })
      .limit(100);
    const closedMemoriesPromise = supabase
      .from("trade_memory")
      .select("id, stock_code, stock_name, closed_at, exit_reason, pnl_amount, pnl_percent")
      .not("closed_at", "is", null)
      .gte("closed_at", closedCutoff)
      .order("closed_at", { ascending: false })
      .limit(100);
    const staleSignalsPromise = supabase
      .from("pending_signals")
      .select("id, status")
      .or(`and(status.eq.approved,created_at.lt.${staleApprovedCutoff}),and(status.eq.processing,created_at.lt.${staleProcessingCutoff})`)
      .limit(20);
    const pendingOrdersPromise = supabase.from("pending_orders").select("id, created_at").limit(50);
    const rehearsalPromise = supabase.from("app_config").select("value").eq("key", "rehearsal_checklist").maybeSingle();
    const recentManualSignalsPromise = supabase
      .from("pending_signals")
      .select("id, created_at, resolved_at")
      .eq("source", "manual")
      .gte("created_at", rehearsalCutoff)
      .order("created_at", { ascending: false })
      .limit(20);
    const recentEventsPromise = supabase
      .from("engine_state_events")
      .select("event_type, created_at, payload")
      .gte("created_at", rehearsalCutoff)
      .order("created_at", { ascending: false })
      .limit(200);
    const marketSnapshotsPromise = supabase.from("market_snapshots").select("id").eq("date", kstNow.date).limit(1);
    const todayRunsPromise = supabase.from("engine_runs").select("trade_count").gte("created_at", kstNow.date);
    const todayClosedPromise = supabase.from("positions").select("pnl_amount, pnl_percent").eq("status", "closed").gte("exit_date", kstNow.date);
    const todayEntryEventsPromise = supabase
      .from("engine_state_events")
      .select("stock_code, payload")
      .eq("event_type", "pending_order_saved")
      .gte("created_at", kstNow.date)
      .limit(200);

    const [engineEnabled, engineLock, tokenRow, latestRunRes, appConfigsRes, watchlistRes, positionsRes, closedPositionsRes, closedMemoriesRes, staleSignalsRes, pendingOrdersRes, rehearsalRow, recentManualSignalsRes, recentEventsRes, marketSnapshotsRes, todayRunsRes, todayClosedRes, todayEntryEventsRes] = await Promise.all([
      isEngineEnabled(),
      getEngineLockState(),
      tokenRowPromise,
      latestRunPromise,
      appConfigsPromise,
      watchlistPromise,
      positionsPromise,
      closedPositionsPromise,
      closedMemoriesPromise,
      staleSignalsPromise,
      pendingOrdersPromise,
      rehearsalPromise,
      recentManualSignalsPromise,
      recentEventsPromise,
      marketSnapshotsPromise,
      todayRunsPromise,
      todayClosedPromise,
      todayEntryEventsPromise,
    ]);

    let kisConnected = false;
    let kisDetail = "활성 KIS 설정 없음";
    let kisOrderAuthStatus: CheckStatus = "warn";
    let kisOrderAuthDetail = "저장 토큰 없음";
    let brokerMismatchCount = 0;
    let brokerReconcilePlan = {
      missingInDbCount: 0,
      qtyAdjustmentCount: 0,
      orphanedClosureCount: 0,
    };
    let availableCash = 0;
    let totalCapital = 0;

    if (activeConfig) {
      const storedToken = typeof tokenRow.data?.token === "string" && tokenRow.data.token ? tokenRow.data.token : null;
      let runtimeToken = storedToken;
      try {
        if (!runtimeToken) {
          const fresh = await getTokenDetails(activeConfig.config.appKey, activeConfig.config.appSecret);
          runtimeToken = fresh.token;
          await persistIssuedToken(fresh.token, fresh.tokenExpiry);
          kisDetail = `${activeConfig.source} 설정 사용 · 저장 토큰 없이 재발급 성공`;
        }

        let balance;
        try {
          balance = await getBalance({ ...activeConfig.config, token: runtimeToken });
        } catch {
          const fresh = await getTokenDetails(activeConfig.config.appKey, activeConfig.config.appSecret);
          runtimeToken = fresh.token;
          await persistIssuedToken(fresh.token, fresh.tokenExpiry);
          kisDetail = `${activeConfig.source} 설정 사용 · 저장 토큰 실패 후 재발급 성공`;
          balance = await getBalance({ ...activeConfig.config, token: runtimeToken });
        }

        kisConnected = true;
        const balanceSummary = (balance.output2 ?? [])[0] ?? {};
        totalCapital = Number(balanceSummary.tot_evlu_amt) || 0;
        availableCash = resolveAvailableCash(balanceSummary);
        if (!kisDetail.includes("재발급 성공")) {
          kisDetail = `${activeConfig.source} 설정 사용`;
        }
        try {
          await getOrderHistory({ ...activeConfig.config, token: runtimeToken });
          kisOrderAuthStatus = "pass";
          kisOrderAuthDetail = "주문 계좌 인증 가능";
        } catch (orderError: unknown) {
          const detail = orderError instanceof Error ? orderError.message : "주문 인증 확인 실패";
          kisOrderAuthStatus = detail.includes("계좌번호와 요청 계좌번호") ? "fail" : "warn";
          kisOrderAuthDetail = detail.slice(0, 120);
        }
        brokerMismatchCount = (() => {
          const summary = compareBrokerHoldingsWithDb(
            (balance.output1 ?? []) as Array<Record<string, unknown>>,
            (positionsRes.data ?? []) as Array<Record<string, unknown>>,
          );
          brokerReconcilePlan = {
            missingInDbCount: summary.missingInDb.length,
            qtyAdjustmentCount: summary.qtyMismatch.length,
            orphanedClosureCount: summary.orphanedDb.length,
          };
          return summary.missingInDb.length + summary.qtyMismatch.length + summary.orphanedDb.length;
        })();
      } catch (error: unknown) {
        kisDetail = error instanceof Error ? error.message.slice(0, 120) : "잔고 조회 실패";
      }
    }

    const pnlAudit = compareClosedPositionPnl(closedPositionsRes.data ?? [], closedMemoriesRes.data ?? []);
    const staleSignalCount = staleSignalsRes.data?.length ?? 0;
    const pendingOrderCount = pendingOrdersRes.data?.length ?? 0;
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
    const rehearsalEvidence: RehearsalEvidenceMap = {};
    const recentManualSignalAt =
      (recentManualSignalsRes.data ?? [])
        .map((row) => (typeof row.resolved_at === "string" && row.resolved_at) || (typeof row.created_at === "string" && row.created_at) || null)
        .find((value): value is string => !!value) ?? null;
    if (recentManualSignalAt) rehearsalEvidence.manual_buy = recentManualSignalAt;

    for (const row of (recentEventsRes.data ?? []) as EngineStateEventRow[]) {
      const eventType = String(row.event_type ?? "");
      const createdAt = row.created_at ?? null;
      if (!createdAt) continue;
      if (eventType === "manual_buy_queued" && !rehearsalEvidence.manual_buy) rehearsalEvidence.manual_buy = createdAt;
      if (eventType === "manual_sell_executed" && !rehearsalEvidence.manual_sell) rehearsalEvidence.manual_sell = createdAt;
      if (eventType === "position_reconciled" && !rehearsalEvidence.reconcile) rehearsalEvidence.reconcile = createdAt;
      if (
        ["position_opened", "buy", "approved_buy", "split_buy_1", "split_buy_2", "surge_buy", "surge_reentry_buy"].includes(eventType)
        && !rehearsalEvidence.auto_entry
      ) {
        const source = typeof row.payload?.source === "string" ? row.payload.source : null;
        const signalSource = typeof row.payload?.signal_source === "string" ? row.payload.signal_source : null;
        if (source !== "manual_buy" && signalSource !== "manual") rehearsalEvidence.auto_entry = createdAt;
      }
      if (eventType === "position_closed") {
        const exitReason = typeof row.payload?.exit_reason === "string" ? row.payload.exit_reason : null;
        if (exitReason === "manual_sell" && !rehearsalEvidence.manual_sell) rehearsalEvidence.manual_sell = createdAt;
        if (exitReason && exitReason !== "manual_sell" && !rehearsalEvidence.auto_exit) rehearsalEvidence.auto_exit = createdAt;
      }
    }

    const rehearsalSummary = summarizeRehearsalChecklist(
      applyRehearsalEvidence(
        normalizeRehearsalChecklist(rehearsalRow.data?.value),
        rehearsalEvidence,
      ),
    );
    const recentOrderFailures = summarizeRecentOrderFailures((recentEventsRes.data ?? []) as EngineStateEventRow[]);
    const recentReconcileAt =
      ((recentEventsRes.data ?? []) as EngineStateEventRow[])
        .find((row) => String(row.event_type ?? "") === "position_reconciled" && typeof row.created_at === "string" && row.created_at)
        ?.created_at ?? null;
    const recentReconcileAgeMs = recentReconcileAt ? Date.now() - new Date(recentReconcileAt).getTime() : null;
    const brokerReconcileInGrace =
      brokerMismatchCount > 0 &&
      recentReconcileAgeMs !== null &&
      Number.isFinite(recentReconcileAgeMs) &&
      recentReconcileAgeMs >= 0 &&
      recentReconcileAgeMs <= BROKER_RECONCILE_GRACE_MS;
    const recentOrderTimelines = summarizeOrderLifecycle((recentEventsRes.data ?? []) as Array<{
      event_type?: string | null;
      stock_code?: string | null;
      entity_id?: string | null;
      payload?: Record<string, unknown> | null;
      created_at?: string | null;
    }>);
    const recentOrderTimelineRisk = summarizeOrderTimelineRisk(recentOrderTimelines);
    const recentManualIntent = summarizeManualIntentHealth(recentOrderTimelines);
    const cfgMap = new Map((appConfigsRes.data ?? []).map((row: { key: string; value: unknown }) => [row.key, row.value]));
    const control = readEngineControlSnapshot(cfgMap);
    const marketClosed = !!getMarketClosureReason(cfgMap);
    const observerWindowOpen = !marketClosed && kstNow.hhmm >= 900 && kstNow.hhmm <= 1030;
    const hasTodaySnapshot = (marketSnapshotsRes.data?.length ?? 0) > 0;
    const hasStoredToken = !!tokenRow.data?.token;
    const tokenExpiry = typeof tokenRow.data?.token_expiry === "string" && tokenRow.data.token_expiry ? tokenRow.data.token_expiry : null;
    const tokenExpiryMs = tokenExpiry ? new Date(tokenExpiry).getTime() : null;
    const tokenRemainingMinutes = tokenExpiryMs && Number.isFinite(tokenExpiryMs)
      ? Math.floor((tokenExpiryMs - Date.now()) / 60000)
      : null;
    const watchlistCount = watchlistRes.data?.length ?? 0;
    const openPositionCount = positionsRes.data?.length ?? 0;
    const todayTradeCount = (todayRunsRes.data ?? []).reduce((sum: number, row: { trade_count?: unknown }) => sum + (Number(row.trade_count) || 0), 0);
    const todayRealizedPnlAmount = (todayClosedRes.data ?? []).reduce((sum: number, row: { pnl_amount?: unknown }) => sum + (Number(row.pnl_amount) || 0), 0);
    const todayRealizedLossPct = totalCapital > 0
      ? (todayRealizedPnlAmount / totalCapital) * 100
      : (todayClosedRes.data ?? []).reduce((sum: number, row: { pnl_percent?: unknown }) => sum + (Number(row.pnl_percent) || 0), 0);
    const maxPerTradeAmount = cfgMap.has("max_amount_per_trade")
      ? Number(cfgMap.get("max_amount_per_trade")) * 10000
      : DEFAULT_ENGINE_CONFIG.maxPerTrade;
    const riskBudget = summarizeRiskBudget({
      dailyLossLimitPct: control.daily_loss_limit,
      todayRealizedLossPct,
      maxPositions: control.max_positions,
      openPositionCount,
      maxDailyTrades: control.max_trades_per_day,
      todayTradeCount,
      maxPerTradeAmount,
      availableCash,
    });
    const sectorExposure = summarizeSectorExposure(
      (positionsRes.data ?? []) as Array<{ sector?: unknown }>,
      control.max_per_sector,
    );
    const entryPressure = summarizeEntryPressure(
      ((todayEntryEventsRes.data ?? []) as Array<{ stock_code?: unknown; payload?: Record<string, unknown> | null }>).map((row) => ({
        stock_code: row.stock_code,
        strategy_key: row.payload?.strategy_key ?? null,
      })),
      (strategyKey) => resolveConfiguredPerStockEntryLimit(strategyKey as "surge_momentum" | null, control.surge_max_daily_entries_per_stock),
    );
    const health = resolveEngineHealth({
      lastRunAt: latestRunRes.data?.run_at ?? null,
      hasError: !!latestRunRes.data?.error,
    });

    const checks: PreflightCheck[] = [
      {
        key: "engine_env",
        label: "엔진 운영 환경변수",
        status: engineEnvCheck.ok ? "pass" : "fail",
        detail: engineEnvCheck.ok
          ? engineEnvCheck.warnings.length > 0
            ? `필수값 정상 · KIS env 경고 ${engineEnvCheck.warnings.length}건`
            : "필수값 정상"
          : `누락: ${engineEnvCheck.missing.join(", ")}`,
        impact: "trading_blocker",
        blocksTrading: !engineEnvCheck.ok,
      },
      {
        key: "admin_auth_env",
        label: "관리자 인증 환경변수",
        status: adminAuthEnvCheck.ok ? "pass" : "fail",
        detail: adminAuthEnvCheck.ok ? "로그인/세션 필수값 정상" : `누락: ${adminAuthEnvCheck.missing.join(", ")}`,
        impact: "ops_blocker",
        blocksTrading: !adminAuthEnvCheck.ok,
      },
      {
        key: "daily_loss_budget",
        label: "일손실 한도",
        status: riskBudget.dailyLossReached ? "fail" : riskBudget.dailyLossWarning ? "warn" : "pass",
        detail: riskBudget.dailyLossReached
          ? `실현손실 ${todayRealizedPnlAmount.toLocaleString("ko-KR")}원 (${todayRealizedLossPct.toFixed(2)}%) · 한도 ${control.daily_loss_limit.toFixed(2)}% 초과`
          : riskBudget.dailyLossWarning
            ? `실현손실 ${todayRealizedPnlAmount.toLocaleString("ko-KR")}원 (${todayRealizedLossPct.toFixed(2)}%) · 한도 ${control.daily_loss_limit.toFixed(2)}% 근접`
            : `실현손실 ${todayRealizedPnlAmount.toLocaleString("ko-KR")}원 (${todayRealizedLossPct.toFixed(2)}%) / 한도 ${control.daily_loss_limit.toFixed(2)}%`,
        impact: riskBudget.dailyLossReached ? "trading_blocker" : "advisory",
        blocksTrading: riskBudget.dailyLossReached,
      },
      {
        key: "position_capacity",
        label: "포지션 수용량",
        status: riskBudget.positionSlotsRemaining === 0 ? "warn" : "pass",
        detail: riskBudget.positionSlotsRemaining === 0
          ? `보유 ${openPositionCount}/${control.max_positions} · 신규 진입 슬롯 없음`
          : `보유 ${openPositionCount}/${control.max_positions} · 신규 슬롯 ${riskBudget.positionSlotsRemaining}개`,
        impact: "advisory",
        blocksTrading: false,
      },
      {
        key: "daily_trade_capacity",
        label: "당일 진입 여유",
        status: riskBudget.tradeSlotsRemaining === 0 ? "warn" : "pass",
        detail: riskBudget.tradeSlotsRemaining === 0
          ? `당일 체결 ${todayTradeCount}/${control.max_trades_per_day} · 추가 진입 여유 없음`
          : `당일 체결 ${todayTradeCount}/${control.max_trades_per_day} · 잔여 ${riskBudget.tradeSlotsRemaining}회`,
        impact: "advisory",
        blocksTrading: false,
      },
      {
        key: "cash_capacity",
        label: "신규 진입 현금",
        status: !kisConnected ? "warn" : riskBudget.hasCashForFreshEntry ? "pass" : "warn",
        detail: !kisConnected
          ? "KIS 연결 후 재확인 필요"
          : riskBudget.hasCashForFreshEntry
            ? `가용현금 ${availableCash.toLocaleString("ko-KR")}원 · 1회 한도 ${maxPerTradeAmount.toLocaleString("ko-KR")}원`
            : `가용현금 ${availableCash.toLocaleString("ko-KR")}원 · 1회 한도 대비 ${riskBudget.cashShortfallAmount.toLocaleString("ko-KR")}원 부족`,
        impact: "advisory",
        blocksTrading: false,
      },
      {
        key: "sector_exposure",
        label: "섹터 집중도",
        status: sectorExposure.overloadedCount > 0 ? "fail" : "pass",
        detail: sectorExposure.overloadedCount > 0
          ? sectorExposure.overloadedSectors
              .slice(0, 3)
              .map((item) => `${item.sector} ${item.count}/${control.max_per_sector}`)
              .join(" · ")
          : `섹터당 최대 ${control.max_per_sector}종목 기준 충족`,
        impact: "trading_blocker",
        blocksTrading: sectorExposure.overloadedCount > 0,
      },
      {
        key: "entry_pressure",
        label: "종목 반복진입",
        status: entryPressure.overflowCount > 0 ? "fail" : entryPressure.saturatedCount > 0 ? "warn" : "pass",
        detail: entryPressure.saturatedCount === 0
          ? "이상징후 없음"
          : entryPressure.stocks
              .slice(0, 3)
              .map((item) => `${item.code} ${item.count}/${item.limit}`)
              .join(" · "),
        impact: entryPressure.overflowCount > 0 ? "trading_blocker" : "ops_blocker",
        blocksTrading: entryPressure.overflowCount > 0,
      },
      {
        key: "runtime_mode",
        label: "런타임 모드",
        status: KIS_RUNTIME_MODE === "paper" ? "warn" : "pass",
        detail: KIS_RUNTIME_MODE === "paper" ? "모의투자 모드" : KIS_RUNTIME_MODE,
        impact: "advisory",
        blocksTrading: false,
      },
      {
        key: "engine_enabled",
        label: "엔진 활성화",
        status: engineEnabled ? "pass" : "fail",
        detail: engineEnabled ? "engine_enabled=true" : "engine_enabled=false",
        impact: "trading_blocker",
        blocksTrading: !engineEnabled,
      },
      {
        key: "engine_lock",
        label: "엔진 락",
        status: engineLock.locked ? "warn" : "pass",
        detail: engineLock.locked ? `실행 중 (${engineLock.lockedAt})` : "락 없음",
        impact: "ops_blocker",
        blocksTrading: engineLock.locked,
      },
      {
        key: "engine_health",
        label: "엔진 헬스",
        status: health.status === "error" ? "fail" : health.status === "stale" ? "warn" : "pass",
        detail: health.lastRunAt ? `${health.status} · 마지막 실행 ${health.lastRunAt}` : "실행 기록 없음",
        impact: health.status === "stale" ? "ops_blocker" : "trading_blocker",
        blocksTrading: health.status === "error" || health.status === "stale",
      },
      {
        key: "kis_health",
        label: "KIS 연결",
        status: kisConnected ? "pass" : "fail",
        detail: kisConnected ? kisDetail : `연결 실패 · ${kisDetail}`,
        impact: "trading_blocker",
        blocksTrading: !kisConnected,
      },
      {
        key: "kis_token",
        label: "저장 액세스 토큰",
        status: !hasStoredToken
          ? "warn"
          : tokenRemainingMinutes !== null && tokenRemainingMinutes <= 0
            ? "warn"
            : tokenRemainingMinutes !== null && tokenRemainingMinutes < 60
              ? "warn"
              : "pass",
        detail: !hasStoredToken
          ? "저장 토큰 없음"
          : tokenRemainingMinutes === null
            ? "kis_config 저장 토큰 존재"
            : tokenRemainingMinutes <= 0
              ? `저장 토큰 만료 (${tokenExpiry}) · 엔진 실행 시 재발급 시도`
              : `저장 토큰 ${tokenRemainingMinutes}분 후 만료 · 엔진 실행 시 재발급`,
        impact: "advisory",
        blocksTrading: false,
      },
      {
        key: "kis_order_auth",
        label: "KIS 주문 인증",
        status: kisOrderAuthStatus,
        detail: kisOrderAuthDetail,
        impact: kisOrderAuthStatus === "warn" ? "ops_blocker" : "trading_blocker",
        blocksTrading: kisOrderAuthStatus !== "pass",
      },
      {
        key: "watchlist",
        label: "활성 watchlist",
        status: watchlistCount > 0 ? "pass" : "warn",
        detail: watchlistCount > 0 ? `${watchlistCount}종목 활성` : "활성 종목 없음",
        impact: "ops_blocker",
        blocksTrading: watchlistCount === 0,
      },
      {
        key: "observer_snapshot",
        label: "장초반 스냅샷",
        status: hasTodaySnapshot ? "pass" : observerWindowOpen ? "warn" : "pass",
        detail: hasTodaySnapshot
          ? `${kstNow.date} 스냅샷 존재`
          : observerWindowOpen
            ? "당일 market_snapshots 없음"
            : "현재 시간대 점검 제외",
        impact: "advisory",
        blocksTrading: false,
      },
      {
        key: "broker_reconcile",
        label: "브로커-DB 정합성",
        status: brokerMismatchCount === 0 ? "pass" : brokerReconcileInGrace ? "warn" : "fail",
        detail: brokerMismatchCount === 0
          ? "불일치 없음"
          : brokerReconcileInGrace
            ? `불일치 ${brokerMismatchCount}건 · DB복구 ${brokerReconcilePlan.missingInDbCount} · 수량보정 ${brokerReconcilePlan.qtyAdjustmentCount} · 고아정리 ${brokerReconcilePlan.orphanedClosureCount} · 복구 직후 재확인 중`
            : `불일치 ${brokerMismatchCount}건 · DB복구 ${brokerReconcilePlan.missingInDbCount} · 수량보정 ${brokerReconcilePlan.qtyAdjustmentCount} · 고아정리 ${brokerReconcilePlan.orphanedClosureCount}`,
        impact: brokerReconcileInGrace ? "ops_blocker" : "trading_blocker",
        blocksTrading: brokerMismatchCount > 0 && !brokerReconcileInGrace,
        metadata: brokerMismatchCount > 0 ? brokerReconcilePlan : undefined,
      },
      {
        key: "pnl_audit",
        label: "손익 대사",
        status: pnlAudit.mismatchCount === 0 ? "pass" : "warn",
        detail: pnlAudit.mismatchCount === 0 ? "불일치 없음" : `불일치 ${pnlAudit.mismatchCount}건`,
        impact: "advisory",
        blocksTrading: false,
      },
      {
        key: "stale_signals",
        label: "오래된 pending 신호",
        status: staleSignalCount === 0 ? "pass" : "warn",
        detail: staleSignalCount === 0 ? "이상 없음" : `${staleSignalCount}건 정리 필요 · pending_signals 확인 후 만료/거절 정리`,
        impact: "ops_blocker",
        blocksTrading: staleSignalCount > 0,
      },
      {
        key: "pending_orders",
        label: "미체결 주문",
        status: pendingOrderCount === 0 ? "pass" : stalePendingOrderCount > 0 ? "fail" : "warn",
        detail: pendingOrderCount === 0
          ? "잔여 없음"
          : stalePendingOrderCount > 0
            ? `${pendingOrderCount}건 중 stale ${stalePendingOrderCount}건 정리 필요 · reconcile 또는 주문취소 확인`
            : `${pendingOrderCount}건 모니터링 중 · 체결/잔량 취소 여부 확인`,
        impact: stalePendingOrderCount > 0 ? "trading_blocker" : "advisory",
        blocksTrading: stalePendingOrderCount > 0,
      },
      {
        key: "recent_order_lifecycle",
        label: "최근 주문 lifecycle",
        status: recentOrderTimelineRisk.lifecycleRiskCount > 0 ? "warn" : "pass",
        detail: recentOrderTimelineRisk.lifecycleRiskCount > 0
          ? `부분체결 ${recentOrderTimelineRisk.partialCount}건 · timeout ${recentOrderTimelineRisk.timeoutCount}건 · stale정리 ${recentOrderTimelineRisk.staleCleanupCount}건 · 주문 타임라인에서 잔량 정리 확인`
          : "이상징후 없음",
        impact: "advisory",
        blocksTrading: false,
      },
      {
        key: "manual_intent_flow",
        label: "수동 intent 흐름",
        status: recentManualIntent.blockedCount > 0 ? "warn" : recentManualIntent.queuedCount > 0 || recentManualIntent.pendingCount > 0 ? "warn" : "pass",
        detail: recentManualIntent.blockedCount > 0 || recentManualIntent.queuedCount > 0 || recentManualIntent.pendingCount > 0 || recentManualIntent.expiredCount > 0
          ? [
              recentManualIntent.queuedCount > 0 ? `등록대기 ${recentManualIntent.queuedCount}건 · 승인/엔진 처리 확인` : null,
              recentManualIntent.pendingCount > 0 ? `주문진행 ${recentManualIntent.pendingCount}건 · 체결 또는 잔량 취소 확인` : null,
              recentManualIntent.rejectedCount > 0 ? `거절 ${recentManualIntent.rejectedCount}건 · 수동 intent 취소 사유 확인` : null,
              recentManualIntent.failedCount > 0 ? `실패 ${recentManualIntent.failedCount}건 · 주문 실패 원인 확인` : null,
              recentManualIntent.expiredCount > 0 ? `종결 ${recentManualIntent.expiredCount}건 · 주문 접수/만료 이력 확인` : null,
            ].filter(Boolean).join(" · ")
          : "이상징후 없음",
        impact: "advisory",
        blocksTrading: false,
      },
      {
        key: "recent_order_failures",
        label: "최근 주문 실패",
        status: recentOrderFailures.account > 0 ? "fail" : recentOrderFailures.total > 0 ? "warn" : "pass",
        detail: recentOrderFailures.total === 0
          ? "최근 실패 이력 없음"
          : [
              recentOrderFailures.account > 0 ? `계좌 ${recentOrderFailures.account}건 · 계좌/프로필 설정 확인` : null,
              recentOrderFailures.capacity > 0 ? `한도 ${recentOrderFailures.capacity}건 · 주문 가능 금액 확인` : null,
              recentOrderFailures.retryable > 0 ? `재시도 ${recentOrderFailures.retryable}건 · 일시 장애 여부 확인` : null,
              recentOrderFailures.unknown > 0 ? `기타 ${recentOrderFailures.unknown}건 · engine-log 상세 확인` : null,
            ].filter(Boolean).join(" · "),
        impact: recentOrderFailures.account > 0 ? "trading_blocker" : recentOrderFailures.total > 0 ? "ops_blocker" : "advisory",
        blocksTrading: recentOrderFailures.account > 0,
      },
      {
        key: "rehearsal",
        label: "소액 리허설",
        status: rehearsalSummary.completed ? "pass" : "warn",
        detail: rehearsalSummary.completed
          ? "체크리스트 완료"
          : `${rehearsalSummary.completedCount}/${rehearsalSummary.totalCount} 완료`,
        impact: "ops_blocker",
        blocksTrading: !rehearsalSummary.completed,
      },
    ];
    const sortedChecks = sortChecks(checks);
    const readiness = summarizeReadiness(sortedChecks);
    const runtimeContext = {
      environment: NEXIO_ENV,
      runtimeMode: KIS_RUNTIME_MODE,
      activeProfileId: activeConfig?.profileId ?? null,
      activeProfileLabel: activeConfig ? getKisProfileLabel(activeConfig.profileId) : null,
      activeSource: activeConfig?.source ?? null,
      activeAccountMask: activeConfig ? maskKisAccountNo(activeConfig.config.accountNo) : null,
    };

    return NextResponse.json({
      status: summarizeStatus(sortedChecks),
      checkedAt: new Date().toISOString(),
      runtimeContext,
      readiness,
      checks: sortedChecks,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "프리플라이트 조회 실패" },
      { status: 500 },
    );
  }
}
