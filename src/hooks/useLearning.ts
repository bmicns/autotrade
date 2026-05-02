"use client";

import { useState, useCallback } from "react";
import type { LearningSnapshot } from "@/lib/learning";

export interface LearningState {
  snapshot: LearningSnapshot | null;
  isExpired: boolean;
  tradeMemoryCount?: number;
}

export function useLearning() {
  const [learning, setLearning] = useState<LearningState | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLearning = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/learn").then((r) => r.json());
      setLearning(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  return { learning, loading, fetchLearning };
}
