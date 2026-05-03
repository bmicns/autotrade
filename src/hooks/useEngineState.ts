"use client";

import { useCallback, useState } from "react";

interface EngineStatePosition {
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

interface EngineStateResponse {
  openPositions: EngineStatePosition[];
  pendingOrders: { id: string; stock_code: string; stock_name: string | null; order_qty: number; limit_price: number; strategy_key: string | null }[];
  pendingSignals: { id: string; stockCode: string; stockName: string | null; status: string; score: number | null; strategyKey: string | null; createdAt: string }[];
  recentEvents: { id: string; eventType: string; stockCode: string | null; createdAt: string }[];
  summary: { openPositionCount: number; pendingOrderCount: number; pendingSignalCount: number };
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
