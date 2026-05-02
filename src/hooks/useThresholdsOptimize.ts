"use client";

import { useState, useCallback } from "react";
import type { OptimizeResult } from "@/components/strategy/signal-optimize-sheet";

export function useThresholdsOptimize() {
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  const optimize = useCallback(async () => {
    setOptimizing(true);
    setOptimizeError(null);
    setOptimizeResult(null);
    try {
      const res = await fetch("/api/optimize-thresholds");
      const data = await res.json();
      if (!res.ok) { setOptimizeError(data.error ?? "최적화 실패"); return; }
      if (data.sampleSize < 5) {
        setOptimizeError(`매매 데이터가 부족합니다 (${data.sampleSize}건 / 최소 5건)`);
        return;
      }
      setOptimizeResult(data as OptimizeResult);
    } catch { setOptimizeError("네트워크 오류가 발생했습니다"); }
    finally { setOptimizing(false); }
  }, []);

  return { optimize, optimizing, optimizeResult, optimizeError, setOptimizeResult };
}
