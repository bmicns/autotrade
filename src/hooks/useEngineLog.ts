"use client";

import { useState, useCallback } from "react";

interface EngineRun {
  run_at: string;
  trade_count: number;
  scanned_count: number;
  duration_ms: number;
  error: string | null;
  actions: { type: string; code: string; name?: string; detail: string }[];
}

interface HealthStatus {
  status: "healthy" | "stale" | "error" | "unknown";
  lastRunAt: string | null;
  minutesSinceLastRun: number | null;
}

interface MarketContext {
  kospi_rate: number;
  kosdaq_rate: number;
  avg_rate: number;
  bonus: number;
  label: string;
}

export function useEngineLog(limit = 5) {
  const [runs, setRuns] = useState<EngineRun[]>([]);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [marketContext, setMarketContext] = useState<MarketContext | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchEngineLog = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch(`/api/engine-log?limit=${limit}`).then((r) => r.json());
      if (Array.isArray(d.runs)) setRuns(d.runs);
      if (d.healthStatus)  setHealthStatus(d.healthStatus);
      if (d.marketContext) setMarketContext(d.marketContext);
    } catch { /* ignore */ }
    setLoading(false);
  }, [limit]);

  return { runs, healthStatus, marketContext, loading, fetchEngineLog };
}
