"use client";

import { useState, useCallback } from "react";

export interface PortfolioSnapshot {
  date: string;
  totalEval: number;
  totalPnl: number;
  pnlRate: number;
}

export function usePortfolioSnapshot() {
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/portfolio-snapshot");
      if (res.ok) setSnapshots(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  return { snapshots, loading, fetchSnapshots };
}
