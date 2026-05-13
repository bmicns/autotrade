import { supabase } from "@/lib/supabase/api-client";
import type { PendingOrder } from "@/lib/engine/db";
import { resolveEngineHealth } from "@/lib/engine/control";
import { getKstNowParts } from "@/lib/engine/market-calendar";
import { compareClosedPositionPnl } from "@/lib/engine/pnl-audit";
import { summarizeOperationalAlerts } from "@/lib/engine/alert-priority";
import { KIS_RUNTIME_MODE, NEXIO_ENV } from "@/lib/constants";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { getKisProfileLabel, maskKisAccountNo } from "@/lib/kis/profile";
import { summarizeManualIntentHealth, summarizeOrderLifecycle, summarizeOrderTimelineRisk } from "@/lib/engine/order-timeline";
import {
  buildEngineStateSnapshotFromRows,
  selectPendingSignalsForScope,
  type EngineStateSnapshot,
} from "@/lib/engine/snapshot-model";

const ORDER_FAILURE_ACTION_TYPES = new Set([
  "buy_failed",
  "approved_buy_failed",
  "surge_buy_failed",
  "sell_failed",
  "order_account_error",
  "order_capacity_error",
]);

export async function readEngineStateSnapshot(): Promise<EngineStateSnapshot> {
  const todayKst = getKstNowParts().date;
  const pnlAuditCutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const [positionsRes, ordersRes, signalsRes, eventsRes, configRes, latestRunRes, recentRunsRes, closedPositionsRes, closedMemoriesRes, todayRunsRes, todayClosedRes, activeKisConfig] = await Promise.all([
    supabase
      .from("positions")
      .select("id, stock_code, stock_name, phase, status, entry_price, entry_qty, entry_date, entry_signal")
      .eq("status", "open")
      .order("entry_date", { ascending: true }),
    supabase
      .from("pending_orders")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(20),
    supabase
      .from("pending_signals")
      .select("id, stock_code, stock_name, status, signal_score, signal_comment, source, created_at, resolved_at, signal_data")
      .in("status", ["pending", "approved", "processing", "failed", "expired", "rejected"])
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("engine_state_events")
      .select("id, event_type, stock_code, entity_table, entity_id, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("app_config")
      .select("key, value")
      .in("key", ["engine_enabled", "engine_lock"]),
    supabase
      .from("engine_runs")
      .select("run_at, error")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("engine_runs")
      .select("run_at, error, actions")
      .order("run_at", { ascending: false })
      .limit(5),
    supabase
      .from("positions")
      .select("id, stock_code, stock_name, exit_date, exit_reason, pnl_amount, pnl_percent")
      .eq("status", "closed")
      .gte("exit_date", pnlAuditCutoff)
      .order("exit_date", { ascending: false })
      .limit(50),
    supabase
      .from("trade_memory")
      .select("id, stock_code, stock_name, closed_at, exit_reason, pnl_amount, pnl_percent")
      .not("closed_at", "is", null)
      .gte("closed_at", pnlAuditCutoff)
      .order("closed_at", { ascending: false })
      .limit(50),
    supabase
      .from("engine_runs")
      .select("trade_count")
      .gte("created_at", todayKst),
    supabase
      .from("positions")
      .select("pnl_amount")
      .eq("status", "closed")
      .gte("exit_date", todayKst),
    getActiveKisConfig(),
  ]);

  const cfgMap = new Map((configRes.data ?? []).map((row: { key: string; value: unknown }) => [row.key, row.value]));
  const lockValue = cfgMap.get("engine_lock");
  const engineLockAt = typeof lockValue === "string" && lockValue ? lockValue : null;
  const engineLocked = !!(engineLockAt && Date.now() - new Date(engineLockAt).getTime() < 5 * 60 * 1000);
  const healthStatus = resolveEngineHealth({
    lastRunAt: latestRunRes.data?.run_at ?? null,
    hasError: !!latestRunRes.data?.error,
  });
  const alerts: string[] = [];
  const recentEvents = (eventsRes.data ?? []) as Array<Record<string, unknown>>;
  const lastReconcileEvent = recentEvents.find((row) => String(row.event_type) === "position_reconciled");
  const reconcilePayload = (lastReconcileEvent?.payload as Record<string, unknown> | undefined) ?? undefined;
  const reconcileMismatch = reconcilePayload?.mismatches as
    | { missingInDb?: unknown[]; qtyMismatch?: unknown[]; orphanedDb?: unknown[] }
    | undefined;
  const reconcilePlanPayload = reconcilePayload?.mismatchesBefore as
    | { missingInDb?: unknown[]; qtyMismatch?: unknown[]; orphanedDb?: unknown[] }
    | undefined;
  const reconcileDetailPayload = reconcilePayload?.action
    ? reconcilePayload
    : undefined;
  const brokerMissingInDbCount =
    (reconcileMismatch?.missingInDb?.length ?? reconcilePlanPayload?.missingInDb?.length ?? 0);
  const brokerQtyAdjustmentCount =
    (reconcileMismatch?.qtyMismatch?.length ?? reconcilePlanPayload?.qtyMismatch?.length ?? 0);
  const brokerOrphanedClosureCount =
    (reconcileMismatch?.orphanedDb?.length ?? reconcilePlanPayload?.orphanedDb?.length ?? 0);
  let brokerMismatchCount =
    brokerMissingInDbCount + brokerQtyAdjustmentCount + brokerOrphanedClosureCount;
  if (reconcileDetailPayload && brokerMismatchCount === 0) {
    if (String(reconcileDetailPayload.action ?? "") === "qty_adjusted") brokerMismatchCount = 1;
    if (String(reconcileDetailPayload.action ?? "") === "orphan_closed") brokerMismatchCount = 1;
  }
  if (brokerMismatchCount > 0) {
    alerts.push(`리컨실 불일치 ${brokerMismatchCount}건`);
  }

  const failedManualSell = recentEvents.find((row) => {
    if (String(row.event_type) !== "manual_sell_executed") return false;
    const payload = (row.payload as Record<string, unknown> | null) ?? null;
    return payload?.success === false;
  });
  if (failedManualSell) {
    alerts.push("최근 수동매도 실패 이력 있음");
  }

  const recentOrderFailureEvents = recentEvents.filter((row) => String(row.event_type) === "order_failure_recorded");
  const accountOrderFailureCount = recentOrderFailureEvents.reduce((count, row) => {
    const payload = (row.payload as Record<string, unknown> | null) ?? null;
    return String(payload?.category ?? "") === "account" ? count + 1 : count;
  }, 0);
  const retryableOrderFailureCount = recentOrderFailureEvents.reduce((count, row) => {
    const payload = (row.payload as Record<string, unknown> | null) ?? null;
    return String(payload?.category ?? "") === "retryable" ? count + 1 : count;
  }, 0);
  if (accountOrderFailureCount > 0) {
    alerts.push(`최근 주문 계좌 오류 ${accountOrderFailureCount}건`);
  } else if (retryableOrderFailureCount > 0) {
    alerts.push(`최근 재시도성 주문 실패 ${retryableOrderFailureCount}건`);
  }

  const [latestRun] = recentRunsRes.data ?? [];
  if (latestRun?.error) {
    alerts.push(`최근 엔진 오류: ${String(latestRun.error).slice(0, 40)}`);
  } else {
    const haltAction = Array.isArray(latestRun?.actions)
      ? (latestRun.actions as Array<{ type?: string; detail?: string }>).find((action) =>
          ["risk_halt", "daily_loss_halt", "market_crash_halt"].includes(String(action.type ?? ""))
        )
      : null;
    if (haltAction) {
      alerts.push(`최근 정지: ${String(haltAction.detail ?? haltAction.type ?? "")}`);
    }
  }

  const recentOrderFailureCount = (recentRunsRes.data ?? []).reduce((count, run) => {
    if (!Array.isArray(run.actions)) return count;
    const failed = (run.actions as Array<{ type?: string }>).some((action) => ORDER_FAILURE_ACTION_TYPES.has(String(action.type ?? "")));
    return failed ? count + 1 : count;
  }, 0);
  if (recentOrderFailureCount > 0) {
    alerts.push(`최근 주문 실패 실행 ${recentOrderFailureCount}회`);
  }

  const pnlAudit = compareClosedPositionPnl(closedPositionsRes.data ?? [], closedMemoriesRes.data ?? []);
  if (pnlAudit.mismatchCount > 0) {
    alerts.push(`손익 대사 불일치 ${pnlAudit.mismatchCount}건`);
  }

  const todayTradeCount = (todayRunsRes.data ?? []).reduce((sum, row) => sum + (Number(row.trade_count) || 0), 0);
  const todayRealizedPnl = (todayClosedRes.data ?? []).reduce((sum, row) => sum + (Number(row.pnl_amount) || 0), 0);
  const stalePendingOrderCount = (ordersRes.data ?? []).reduce((count, row) => {
    const createdAt = new Date(String(row.created_at ?? "")).getTime();
    if (!Number.isFinite(createdAt)) return count;
    return Date.now() - createdAt >= 30 * 60 * 1000 ? count + 1 : count;
  }, 0);
  const recentPartialFillCount = recentEvents.reduce((count, row) => (
    String(row.event_type) === "pending_order_partially_filled" ? count + 1 : count
  ), 0);
  const recentTimeoutCleanupCount = recentEvents.reduce((count, row) => {
    if (String(row.event_type) !== "pending_order_deleted") return count;
    const payload = (row.payload as Record<string, unknown> | null) ?? null;
    return String(payload?.resolution ?? "") === "timeout" ? count + 1 : count;
  }, 0);
  const recentOrderFailureCountFromEvents = recentEvents.reduce((count, row) => (
    String(row.event_type) === "order_failure_recorded" ? count + 1 : count
  ), 0);
  const recentOrderTimelines = summarizeOrderLifecycle(recentEvents as Array<Record<string, unknown>>);
  const recentOrderTimelineRisk = summarizeOrderTimelineRisk(recentOrderTimelines);
  const recentManualIntent = summarizeManualIntentHealth(recentOrderTimelines);
  if (stalePendingOrderCount > 0) {
    alerts.push(`stale 대기 주문 ${stalePendingOrderCount}건`);
  }
  if (recentOrderTimelineRisk.lifecycleRiskCount > 0) {
    alerts.push(`최근 주문 lifecycle 경고 ${recentOrderTimelineRisk.lifecycleRiskCount}건`);
  }
  if (recentManualIntent.blockedCount > 0) {
    alerts.push(`최근 수동 intent 차단 ${recentManualIntent.blockedCount}건`);
  } else if (recentManualIntent.queuedCount > 0 || recentManualIntent.pendingCount > 0) {
    alerts.push(`수동 intent 진행 중 ${recentManualIntent.queuedCount + recentManualIntent.pendingCount}건`);
  }
  const alertSummary = summarizeOperationalAlerts(alerts);

  return buildEngineStateSnapshotFromRows({
    positions: (positionsRes.data ?? []) as Array<Record<string, unknown>>,
    orders: (ordersRes.data ?? []) as PendingOrder[],
    signals: (signalsRes.data ?? []) as Array<Record<string, unknown>>,
    events: (eventsRes.data ?? []) as Array<Record<string, unknown>>,
    runtime: {
      engineEnabled: !(cfgMap.get("engine_enabled") === false || cfgMap.get("engine_enabled") === "false"),
      engineLocked,
      engineLockAt,
      environment: NEXIO_ENV,
      kisRuntime: {
        mode: KIS_RUNTIME_MODE,
        profileId: activeKisConfig?.profileId ?? null,
        profileLabel: activeKisConfig ? getKisProfileLabel(activeKisConfig.profileId) : null,
        source: activeKisConfig?.source ?? null,
        accountMask: activeKisConfig ? maskKisAccountNo(activeKisConfig.config.accountNo) : null,
      },
      healthStatus,
      alerts,
      alertPriority: alertSummary.priority,
      alertHeadline: alertSummary.headline,
    },
    summary: {
      recentPartialFillCount,
      recentLifecycleRiskCount: recentOrderTimelineRisk.lifecycleRiskCount,
      recentManualOrderCount: recentOrderTimelineRisk.manualOrderCount,
      recentTimeoutCleanupCount,
      recentOrderFailureCount: recentOrderFailureCountFromEvents,
      todayTradeCount,
      todayRealizedPnl,
      brokerMismatchCount,
      brokerMissingInDbCount,
      brokerQtyAdjustmentCount,
      brokerOrphanedClosureCount,
    },
  });
}

export { buildEngineStateSnapshotFromRows, selectPendingSignalsForScope, type EngineStateSnapshot };
