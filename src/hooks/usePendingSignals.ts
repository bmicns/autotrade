"use client";

import { useState, useCallback } from "react";

export interface PendingSignal {
  id: string;
  stock_code: string;
  stock_name: string | null;
  signal_score: number;
  signal_comment: string;
  source: string;
  status: string;
  created_at: string;
  signal_data?: Record<string, unknown>;
}

export interface FilterLog {
  stock_code: string;
  stock_name?: string;
  action_type: string;
  reason: string;
  run_at: string;
}

export function usePendingSignals() {
  const [signals, setSignals] = useState<PendingSignal[]>([]);
  const [recentSignals, setRecentSignals] = useState<PendingSignal[]>([]);
  const [filterLogs, setFilterLogs] = useState<FilterLog[]>([]);
  const [dartCodes, setDartCodes] = useState<Set<string>>(new Set());

  const fetchSignals = useCallback(async () => {
    try {
      const [activeRes, historyRes] = await Promise.all([
        fetch("/api/pending-signals"),
        fetch("/api/pending-signals?scope=history"),
      ]);
      if (activeRes.ok) setSignals(await activeRes.json());
      if (historyRes.ok) setRecentSignals(await historyRes.json());
    } catch { /* ignore */ }
  }, []);

  const fetchEngineLog = useCallback(async () => {
    try {
      const d = await fetch("/api/engine-log").then((r) => r.json());
      if (Array.isArray(d.filterLogs)) {
        setFilterLogs(d.filterLogs);
        const dartSet = new Set<string>();
        (d.filterLogs as FilterLog[]).forEach((l) => {
          if (l.action_type === "dart_filtered") dartSet.add(l.stock_code);
        });
        setDartCodes(dartSet);
      }
    } catch { /* ignore */ }
  }, []);

  const approveSignal = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/pending-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "approved" }),
      });
      return res.ok;
    } catch { return false; }
  }, []);

  const rejectSignal = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/pending-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "rejected" }),
      });
      return res.ok;
    } catch { return false; }
  }, []);

  const expireSignal = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/pending-signals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "expired" }),
      });
      return res.ok;
    } catch { return false; }
  }, []);

  return { signals, recentSignals, filterLogs, dartCodes, fetchSignals, fetchEngineLog, approveSignal, rejectSignal, expireSignal };
}
