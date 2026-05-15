"use client";

import { useCallback, useState } from "react";

export interface EngineStatePosition {
  id: string;
  stockCode: string;
  stockName: string | null;
  phase: string | null;
  status: string;
  entryPrice: number;
  entryQty: number;
  entryDate: string;
  strategyKey: string | null;
}

export interface EngineStateResponse {
  openPositions: EngineStatePosition[];
  pendingOrders: { id: string; stock_code: string; stock_name: string | null; order_qty: number; limit_price: number; strategy_key: string | null }[];
  pendingSignals: { id: string; stockCode: string; stockName: string | null; status: string; score: number | null; strategyKey: string | null; createdAt: string }[];
  recentEvents: { id: string; eventType: string; stockCode: string | null; entityTable: string; payload: Record<string, unknown> | null; createdAt: string }[];
  runtime: {
    engineEnabled: boolean;
    engineLocked: boolean;
    engineLockAt: string | null;
    engineLockStale: boolean;
    engineLockAgeMinutes: number | null;
    environment: "dev" | "paper" | "prod";
    kisRuntime: {
      brokerId: string | null;
      brokerLabel: string | null;
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
    recentStaleCleanupCount: number;
    recentOrderFailureCount: number;
    todayTradeCount: number;
    todayRealizedPnl: number;
    brokerMismatchCount: number;
    brokerMissingInDbCount: number;
    brokerQtyAdjustmentCount: number;
    brokerOrphanedClosureCount: number;
  };
}

export function useEngineState() {
  const [state, setState] = useState<EngineStateResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchEngineState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/engine-state");
      if (res.ok) setState(await res.json());
    } catch {
      // Ignore transient state fetch failures.
    }
    setLoading(false);
  }, []);

  return { state, loading, fetchEngineState };
}
