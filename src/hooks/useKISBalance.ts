"use client";

import { useState, useCallback, useEffect } from "react";
import { useAppStore } from "@/lib/store";

// POST /api/kis/balance 응답 스펙 (nexio.design.md §3.1)
export interface KISBalanceHolding {
  code: string;
  name: string;
  market: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlRate: number;
}

export interface KISBalanceData {
  holdings: KISBalanceHolding[];
  totalEval: number;
  totalPnl: number;
  totalPnlRate: number;
  cashBalance: number;
}

/**
 * KIS 잔고 조회 훅 — POST /api/kis/balance
 * kisConfig(appKey·appSecret·token·accountNo)를 Request Body로 전송.
 * URL 파라미터에 자격증명을 노출하지 않는다 (v7.1 보안 개선).
 */
export function useKISBalance() {
  const kisConfig = useAppStore((s) => s.kisConfig);
  const [data, setData] = useState<KISBalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    const { appKey, appSecret, token, accountNo, accountProductCode } = kisConfig;
    if (!appKey || !appSecret || !accountNo) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kis/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appKey, appSecret, token: token ?? "", accountNo, accountProductCode: accountProductCode || "01" }),
      });
      const json = await res.json();

      if (res.status === 400) {
        setError(json.error ?? "appKey, appSecret, token, accountNo 필수");
        return;
      }
      if (res.status === 401) {
        setError(json.error ?? "토큰이 만료되었습니다");
        return;
      }
      if (!res.ok) {
        setError(json.error ?? "잔고 조회 실패");
        return;
      }
      setData(json as KISBalanceData);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [kisConfig]);

  // kisConfig 준비 시 자동 조회
  useEffect(() => {
    if (kisConfig.appKey && kisConfig.accountNo) {
      fetchBalance();
    }
  }, [kisConfig.appKey, kisConfig.accountNo, fetchBalance]);

  return { data, loading, error, refetch: fetchBalance };
}
