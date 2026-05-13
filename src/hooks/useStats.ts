"use client";

import { useState, useCallback } from "react";
import type { PerformanceStats } from "@/lib/analytics";
import type { StockStat } from "@/components/stats/stock-stats-section";

export type Period = "1w" | "1m" | "3m" | "all";

export interface StatsData extends PerformanceStats {
  dataSource?: "db" | "engine_runs" | "empty";
  positions?: Array<{
    id: string; stock_code: string; stock_name: string | null;
    entry_price: number; exit_price: number | null; entry_date: string;
    entry_signal: Record<string, unknown> | null;
    exit_date: string | null; exit_reason: string | null;
    partial_exit_qty: number | null;
    pnl_amount: number | null; pnl_percent: number | null;
    hold_days: number | null; status: string; signal_strength: string | null;
    strategy_key: string | null;
  }>;
}

export interface LearningData {
  snapshot: LearningSnapshot | null;
  isExpired: boolean;
  history: LearningSnapshot[];
  abStats?: { avgBase: number; avgLearned: number; sampleSize: number };
  tradeMemoryCount?: number;
  datasetSummary?: {
    sampleCount: number;
    winRate: number;
    avgPnl: number;
    avgHoldDays: number;
    strategyStats: Array<{ key: string; count: number; winRate: number; avgPnl: number; stopLossRate: number }>;
    surgeEntryStats: Array<{ tag: string; count: number; winRate: number; avgPnl: number; stopLossRate: number }>;
    timeBucketStats: Array<{ bucket: string; count: number; winRate: number; avgPnl: number; stopLossRate: number }>;
    keywordStats: Array<{ keyword: string; count: number; winRate: number; avgPnl: number; stopLossRate: number }>;
    riskHints: Array<{ label: string; count: number; winRate: number; stopLossRate: number; avgPnl: number; reason: string }>;
  };
}

interface LearningSnapshot {
  id: string;
  created_at: string;
  sample_size: number;
  confidence: "none" | "low" | "medium" | "high";
  weights_trending: Record<string, number> | null;
  weights_ranging: Record<string, number> | null;
  weights_source: string;
  atr_mult_stop: number;
  atr_mult_trailing: number;
  atr_source: string;
  target_risk_amount: number;
  take_profit_ratio: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  is_active: boolean;
  expires_at: string;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLearningSnapshot(value: unknown): LearningSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    created_at: String(row.created_at ?? ""),
    sample_size: asNumber(row.sample_size),
    confidence: (row.confidence as LearningSnapshot["confidence"]) ?? "none",
    weights_trending: (row.weights_trending as Record<string, number> | null) ?? null,
    weights_ranging: (row.weights_ranging as Record<string, number> | null) ?? null,
    weights_source: String(row.weights_source ?? "default"),
    atr_mult_stop: asNumber(row.atr_mult_stop),
    atr_mult_trailing: asNumber(row.atr_mult_trailing),
    atr_source: String(row.atr_source ?? "default"),
    target_risk_amount: asNumber(row.target_risk_amount),
    take_profit_ratio: asNumber(row.take_profit_ratio, 50),
    win_rate: asNumber(row.win_rate),
    avg_win: asNumber(row.avg_win),
    avg_loss: asNumber(row.avg_loss),
    is_active: Boolean(row.is_active),
    expires_at: String(row.expires_at ?? ""),
  };
}

function normalizeLearningData(value: unknown): LearningData {
  const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const history = Array.isArray(row.history) ? row.history.map(normalizeLearningSnapshot).filter(Boolean) as LearningSnapshot[] : [];
  return {
    snapshot: normalizeLearningSnapshot(row.snapshot),
    isExpired: Boolean(row.isExpired),
    history,
    abStats: row.abStats && typeof row.abStats === "object"
      ? {
          avgBase: asNumber((row.abStats as Record<string, unknown>).avgBase),
          avgLearned: asNumber((row.abStats as Record<string, unknown>).avgLearned),
          sampleSize: asNumber((row.abStats as Record<string, unknown>).sampleSize),
        }
      : undefined,
    tradeMemoryCount: row.tradeMemoryCount === undefined ? undefined : asNumber(row.tradeMemoryCount),
    datasetSummary: row.datasetSummary && typeof row.datasetSummary === "object"
      ? {
          sampleCount: asNumber((row.datasetSummary as Record<string, unknown>).sampleCount),
          winRate: asNumber((row.datasetSummary as Record<string, unknown>).winRate),
          avgPnl: asNumber((row.datasetSummary as Record<string, unknown>).avgPnl),
          avgHoldDays: asNumber((row.datasetSummary as Record<string, unknown>).avgHoldDays),
          strategyStats: Array.isArray((row.datasetSummary as Record<string, unknown>).strategyStats)
            ? ((row.datasetSummary as Record<string, unknown>).strategyStats as Array<Record<string, unknown>>).map((item) => ({
                key: String(item.key ?? "unclassified"),
                count: asNumber(item.count),
                winRate: asNumber(item.winRate),
                avgPnl: asNumber(item.avgPnl),
                stopLossRate: asNumber(item.stopLossRate),
              }))
            : [],
          surgeEntryStats: Array.isArray((row.datasetSummary as Record<string, unknown>).surgeEntryStats)
            ? ((row.datasetSummary as Record<string, unknown>).surgeEntryStats as Array<Record<string, unknown>>).map((item) => ({
                tag: String(item.tag ?? "unknown"),
                count: asNumber(item.count),
                winRate: asNumber(item.winRate),
                avgPnl: asNumber(item.avgPnl),
                stopLossRate: asNumber(item.stopLossRate),
              }))
            : [],
          timeBucketStats: Array.isArray((row.datasetSummary as Record<string, unknown>).timeBucketStats)
            ? ((row.datasetSummary as Record<string, unknown>).timeBucketStats as Array<Record<string, unknown>>).map((item) => ({
                bucket: String(item.bucket ?? "기타"),
                count: asNumber(item.count),
                winRate: asNumber(item.winRate),
                avgPnl: asNumber(item.avgPnl),
                stopLossRate: asNumber(item.stopLossRate),
              }))
            : [],
          keywordStats: Array.isArray((row.datasetSummary as Record<string, unknown>).keywordStats)
            ? ((row.datasetSummary as Record<string, unknown>).keywordStats as Array<Record<string, unknown>>).map((item) => ({
                keyword: String(item.keyword ?? ""),
                count: asNumber(item.count),
                winRate: asNumber(item.winRate),
                avgPnl: asNumber(item.avgPnl),
                stopLossRate: asNumber(item.stopLossRate),
              }))
            : [],
          riskHints: Array.isArray((row.datasetSummary as Record<string, unknown>).riskHints)
            ? ((row.datasetSummary as Record<string, unknown>).riskHints as Array<Record<string, unknown>>).map((item) => ({
                label: String(item.label ?? ""),
                count: asNumber(item.count),
                winRate: asNumber(item.winRate),
                stopLossRate: asNumber(item.stopLossRate),
                avgPnl: asNumber(item.avgPnl),
                reason: String(item.reason ?? ""),
              }))
            : [],
        }
      : undefined,
  };
}

function normalizeStatsData(value: unknown): StatsData {
  const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const positions = Array.isArray(row.positions) ? row.positions : [];
  return {
    totalTrades: asNumber(row.totalTrades),
    openPositions: asNumber(row.openPositions),
    closedTrades: asNumber(row.closedTrades),
    winCount: asNumber(row.winCount),
    lossCount: asNumber(row.lossCount),
    winRate: asNumber(row.winRate),
    avgReturn: asNumber(row.avgReturn),
    totalPnl: asNumber(row.totalPnl),
    profitFactor: asNumber(row.profitFactor),
    maxDrawdown: asNumber(row.maxDrawdown),
    avgHoldDays: asNumber(row.avgHoldDays),
    bestTrade: row.bestTrade && typeof row.bestTrade === "object"
      ? {
          code: String((row.bestTrade as Record<string, unknown>).code ?? ""),
          name: String((row.bestTrade as Record<string, unknown>).name ?? ""),
          pnl: asNumber((row.bestTrade as Record<string, unknown>).pnl),
        }
      : null,
    worstTrade: row.worstTrade && typeof row.worstTrade === "object"
      ? {
          code: String((row.worstTrade as Record<string, unknown>).code ?? ""),
          name: String((row.worstTrade as Record<string, unknown>).name ?? ""),
          pnl: asNumber((row.worstTrade as Record<string, unknown>).pnl),
        }
      : null,
    indicatorAccuracy: Array.isArray(row.indicatorAccuracy) ? row.indicatorAccuracy as PerformanceStats["indicatorAccuracy"] : [],
    monthlyBreakdown: Array.isArray(row.monthlyBreakdown) ? row.monthlyBreakdown as PerformanceStats["monthlyBreakdown"] : [],
    exitReasonBreakdown: Array.isArray(row.exitReasonBreakdown) ? row.exitReasonBreakdown as PerformanceStats["exitReasonBreakdown"] : [],
    strategyBreakdown: Array.isArray(row.strategyBreakdown) ? row.strategyBreakdown as PerformanceStats["strategyBreakdown"] : [],
    positions: positions.map((item) => {
      const pos = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return {
        id: String(pos.id ?? ""),
        stock_code: String(pos.stock_code ?? ""),
        stock_name: pos.stock_name == null ? null : String(pos.stock_name),
        entry_price: asNumber(pos.entry_price),
        exit_price: pos.exit_price == null ? null : asNumber(pos.exit_price),
        entry_date: String(pos.entry_date ?? ""),
        entry_signal: pos.entry_signal && typeof pos.entry_signal === "object"
          ? pos.entry_signal as Record<string, unknown>
          : null,
        exit_date: pos.exit_date == null ? null : String(pos.exit_date),
        exit_reason: pos.exit_reason == null ? null : String(pos.exit_reason),
        partial_exit_qty: pos.partial_exit_qty == null ? null : asNumber(pos.partial_exit_qty),
        pnl_amount: pos.pnl_amount == null ? null : asNumber(pos.pnl_amount),
        pnl_percent: pos.pnl_percent == null ? null : asNumber(pos.pnl_percent),
        hold_days: pos.hold_days == null ? null : asNumber(pos.hold_days),
        status: String(pos.status ?? "open"),
        signal_strength: pos.signal_strength == null ? null : String(pos.signal_strength),
        strategy_key: pos.strategy_key == null ? null : String(pos.strategy_key),
      };
    }),
  };
}

function normalizeStockStats(value: unknown): StockStat[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      stock_code: String(row.stock_code ?? ""),
      stock_name: String(row.stock_name ?? ""),
      trade_count: asNumber(row.trade_count),
      win_count: asNumber(row.win_count),
      win_rate: asNumber(row.win_rate),
      avg_pnl: asNumber(row.avg_pnl),
      total_pnl: asNumber(row.total_pnl),
      fitness_score: asNumber(row.fitness_score),
      fitness_label: (row.fitness_label as StockStat["fitness_label"]) ?? "neutral",
      last_trade: String(row.last_trade ?? ""),
    };
  });
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
      if (statsRes.ok) setStats(normalizeStatsData(await statsRes.json()));
      else setStats(null);
      if (learnRes.ok) setLearningData(normalizeLearningData(await learnRes.json()));
      else setLearningData(null);
      if (stocksRes.ok) setStockStats(normalizeStockStats(await stocksRes.json()));
      else setStockStats([]);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  return { stats, learningData, stockStats, loading, fetchStats };
}
