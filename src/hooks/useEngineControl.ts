"use client";

import { useState, useCallback } from "react";
import type { SignalThresholds } from "@/components/strategy/signal-edit-sheet";

interface StrategyAllocations {
  watchlist_pullback: number;
  surge_momentum: number;
  institutional_follow: number;
}

const DEFAULT_THRESHOLDS: SignalThresholds = { rsiBuy: 30, rsiSell: 70, strongScore: 70, weakScore: 40 };
const DEFAULT_ALLOCATIONS: StrategyAllocations = { watchlist_pullback: 40, surge_momentum: 25, institutional_follow: 35 };

export function useEngineControl() {
  const [thresholds, setThresholds] = useState<SignalThresholds>(DEFAULT_THRESHOLDS);
  const [allocations, setAllocations] = useState<StrategyAllocations>(DEFAULT_ALLOCATIONS);
  const [holidays, setHolidays] = useState("");
  const [loaded, setLoaded] = useState(false);

  const fetchEngineControl = useCallback(async () => {
    try {
      const d = await fetch("/api/engine-control").then((r) => r.json());
      setThresholds({
        rsiBuy:      d.rsi_buy      ?? DEFAULT_THRESHOLDS.rsiBuy,
        rsiSell:     d.rsi_sell     ?? DEFAULT_THRESHOLDS.rsiSell,
        strongScore: d.strong_score ?? DEFAULT_THRESHOLDS.strongScore,
        weakScore:   d.weak_score   ?? DEFAULT_THRESHOLDS.weakScore,
      });
      setAllocations({
        watchlist_pullback:   d.strategy_allocations?.watchlist_pullback   ?? DEFAULT_ALLOCATIONS.watchlist_pullback,
        surge_momentum:       d.strategy_allocations?.surge_momentum       ?? DEFAULT_ALLOCATIONS.surge_momentum,
        institutional_follow: d.strategy_allocations?.institutional_follow ?? DEFAULT_ALLOCATIONS.institutional_follow,
      });
      setHolidays(Array.isArray(d.market_holidays) ? d.market_holidays.join("\n") : "");
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  return { thresholds, setThresholds, allocations, holidays, loaded, fetchEngineControl };
}
