"use client";

import { useState, useCallback } from "react";
import { useAppStore } from "@/lib/store";

// POST /api/kis/price 응답 output 스펙 (nexio.design.md §3.1)
export interface KISPriceOutput {
  stck_prpr: string;    // 현재가
  hts_kor_isnm: string; // 종목명
  prdy_vrss: string;    // 전일대비
  prdy_ctrt: string;    // 전일대비율 (%)
  acml_vol: string;     // 누적거래량
  stck_hgpr: string;    // 당일최고가
  stck_lwpr: string;    // 당일최저가
  stck_oprc: string;    // 시가
}

/**
 * KIS 현재가 조회 훅 — POST /api/kis/price
 * 자격증명을 Request Body로 전송. URL 파라미터에 appSecret 노출 금지 (v7.1).
 */
export function useKISPrice() {
  const kisConfig = useAppStore((s) => s.kisConfig);
  const [prices, setPrices] = useState<Map<string, KISPriceOutput>>(new Map());
  const [loading, setLoading] = useState(false);

  const fetchPrice = useCallback(async (code: string): Promise<KISPriceOutput | null> => {
    const { appKey, appSecret, token, accountNo, accountProductCode } = kisConfig;
    if (!appKey || !appSecret || !token) return null;

    try {
      const res = await fetch("/api/kis/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          appKey,
          appSecret,
          token,
          accountNo: accountNo || "",
          accountProductCode: accountProductCode || "01",
        }),
      });
      if (res.status === 400) return null;
      if (!res.ok) return null;
      const json = await res.json();
      return (json.output as KISPriceOutput) ?? null;
    } catch {
      return null;
    }
  }, [kisConfig]);

  /**
   * 여러 종목 시세 일괄 조회 (Promise.allSettled — 개별 실패가 전체를 막지 않음)
   */
  const fetchPrices = useCallback(async (codes: string[]) => {
    if (!kisConfig.appKey || !kisConfig.token) return;
    setLoading(true);
    const results = await Promise.allSettled(
      codes.map(async (code) => ({ code, output: await fetchPrice(code) }))
    );
    const map = new Map<string, KISPriceOutput>();
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.output) {
        map.set(r.value.code, r.value.output);
      }
    }
    setPrices(map);
    setLoading(false);
  }, [kisConfig.appKey, kisConfig.token, fetchPrice]);

  return { prices, loading, fetchPrice, fetchPrices };
}
