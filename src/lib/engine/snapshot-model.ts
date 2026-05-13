import type { PendingOrder } from "@/lib/engine/db";
import {
  filterSignalsByScope,
  mapOpenPositions,
  mapPendingSignals,
  summarizeEngineState,
  type EngineStatePositionView,
  type EngineStateSignalView,
} from "./read-model";

export interface EngineStateSnapshot {
  openPositions: EngineStatePositionView[];
  pendingOrders: PendingOrder[];
  pendingSignals: EngineStateSignalView[];
  recentEvents: Array<{
    id: string;
    eventType: string;
    stockCode: string | null;
    entityTable: string;
    entityId: string | null;
    payload: Record<string, unknown> | null;
    createdAt: string;
  }>;
  runtime: {
    engineEnabled: boolean;
    engineLocked: boolean;
    engineLockAt: string | null;
    environment: "dev" | "paper" | "prod";
    kisRuntime: {
      mode: string;
      profileId: string | null;
      profileLabel: string | null;
      source: "db" | "env" | null;
      accountMask: string | null;
    };
      healthStatus: {
        status: "healthy" | "stale" | "error" | "unknown";
        lastRunAt: string | null;
        minutesSinceLastRun: number | null;
      };
      alerts: string[];
      alertPriority?: "P1" | "P2" | "P3" | null;
      alertHeadline?: string | null;
    };
  summary: {
    openPositionCount: number;
    pendingOrderCount: number;
    pendingOrderStaleCount: number;
    pendingSignalCount: number;
    recentPartialFillCount: number;
    recentLifecycleRiskCount: number;
    recentManualOrderCount: number;
    recentTimeoutCleanupCount: number;
    recentOrderFailureCount: number;
    todayTradeCount: number;
    todayRealizedPnl: number;
    brokerMismatchCount: number;
    brokerMissingInDbCount: number;
    brokerQtyAdjustmentCount: number;
    brokerOrphanedClosureCount: number;
  };
}

export function buildEngineStateSnapshotFromRows(params: {
  positions: Array<Record<string, unknown>>;
  orders: PendingOrder[];
  signals: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  runtime?: EngineStateSnapshot["runtime"];
  summary?: Partial<EngineStateSnapshot["summary"]>;
}): EngineStateSnapshot {
  const openPositions = mapOpenPositions(params.positions);
  const pendingOrders = params.orders;
  const pendingSignals = mapPendingSignals(params.signals);
  const recentEvents = params.events.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    eventType: String(row.event_type),
    stockCode: (row.stock_code as string | null) ?? null,
    entityTable: String(row.entity_table),
    entityId: (row.entity_id as string | null) ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  }));

  return {
    openPositions,
    pendingOrders,
    pendingSignals,
    recentEvents,
    runtime: params.runtime ?? {
      engineEnabled: true,
      engineLocked: false,
      engineLockAt: null,
      environment: "dev",
      kisRuntime: {
        mode: "paper",
        profileId: null,
        profileLabel: null,
        source: null,
        accountMask: null,
      },
      healthStatus: { status: "unknown", lastRunAt: null, minutesSinceLastRun: null },
      alerts: [],
      alertPriority: null,
      alertHeadline: null,
    },
    summary: {
      ...summarizeEngineState({ openPositions, pendingOrders, pendingSignals }),
      recentLifecycleRiskCount: Number(params.summary?.recentLifecycleRiskCount) || 0,
      recentManualOrderCount: Number(params.summary?.recentManualOrderCount) || 0,
      todayTradeCount: Number(params.summary?.todayTradeCount) || 0,
      todayRealizedPnl: Number(params.summary?.todayRealizedPnl) || 0,
      brokerMismatchCount: Number(params.summary?.brokerMismatchCount) || 0,
      brokerMissingInDbCount: Number(params.summary?.brokerMissingInDbCount) || 0,
      brokerQtyAdjustmentCount: Number(params.summary?.brokerQtyAdjustmentCount) || 0,
      brokerOrphanedClosureCount: Number(params.summary?.brokerOrphanedClosureCount) || 0,
    },
  };
}

export function selectPendingSignalsForScope(snapshot: EngineStateSnapshot, scope: "active" | "history") {
  return filterSignalsByScope(snapshot.pendingSignals, scope);
}
