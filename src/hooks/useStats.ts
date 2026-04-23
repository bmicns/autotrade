"use client";

import { useState, useCallback } from "react";
import type { PerformanceStats } from "@/lib/analytics";
import type { LearningSnapshot } from "@/lib/learning";
import type { StockStat } from "@/components/stats/stock-stats-section";

export type Period = "1w" | "1m" | "3m" | "all";

export interface StatsData extends PerformanceStats {
  dataSource?: "db" | "engine_runs" | "empty";
  positions?: Array<{
    id: string; stock_code: string; stock_name: string | null;
    entry_price: number; exit_price: number | null; entry_date: string;
    exit_date: string | null; exit_reason: string | null;
    pnl_amount: number | null; pnl_percent: number | null;
    hold_days: number | null; status: string; signal_strength: string | null;
  }>;
}

export interface LearningData {
  snapshot: LearningSnapshot | null;
  isExpired: boolean;
  history: LearningSnapshot[];
  abStats?: { avgBase: number; avgLearned: number; sampleSize: number };
}

export function useStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [learningData, setLearningData] = useState<LearningData | null>(null);
  const [stockStats, setStockStats] = useState<StockStat[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async (period: Period) => {
    setLoading(true);
    try {
      const [statsRes, learnRes, stocksRes] = await Promise.all([
        fetch(`/api/stats?period=${period}`),
        fetch("/api/learn?history=5&recentTrades=30"),
        fetch("/api/stats/stocks"),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (learnRes.ok) setLearningData(await learnRes.json());
      if (stocksRes.ok) setStockStats(await stocksRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  return { stats, learningData, stockStats, loading, fetchStats };
}
