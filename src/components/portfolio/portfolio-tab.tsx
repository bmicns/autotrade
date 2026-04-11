"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Sparkline } from "@/components/ui/sparkline";
import { Donut } from "@/components/ui/donut";

interface PositionInfo {
  stock_code: string;
  entry_date: string;
}

export function PortfolioTab() {
  const holdings = useAppStore((s) => s.holdings);
  const prices = useAppStore((s) => s.prices);
  const kisConnected = useAppStore((s) => s.kisConnected);
  const cashBalance = useAppStore((s) => s.cashBalance);
  const storeTotalEval = useAppStore((s) => s.totalEval);
  const [positionMap, setPositionMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetch("/api/positions")
      .then((r) => r.json())
      .then((data: PositionInfo[]) => {
        if (Array.isArray(data)) {
          const m = new Map<string, string>();
          data.forEach((p) => m.set(p.stock_code, p.entry_date));
          setPositionMap(m);
        }
      })
      .catch(() => {});
  }, []);

  const MAX_HOLD_DAYS = 5;

  function calcHoldInfo(code: string): { holdDays: number; dday: number } | null {
    const entryDate = positionMap.get(code);
    if (!entryDate) return null;
    const holdDays = Math.max(1, Math.ceil((Date.now() - new Date(entryDate).getTime()) / 86400000));
    return { holdDays, dday: MAX_HOLD_DAYS - holdDays };
  }

  const enriched = holdings.map((h) => {
    const real = prices.get(h.code);
    const cur = real?.price ?? 0;
    const pct = h.avgPrice > 0 && cur > 0 ? ((cur - h.avgPrice) / h.avgPrice) * 100 : 0;
    return { ...h, cur, pct, up: pct >= 0 };
  });

  const totalStock = enriched.reduce((s, h) => s + h.cur * h.quantity, 0);
  const total = storeTotalEval > 0 ? storeTotalEval : totalStock + cashBalance;

  if (holdings.length === 0) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={COLORS.dim} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.21 15.89A10 10 0 118 2.83" /><path d="M22 12A10 10 0 0012 2v10z" />
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>포트폴리오 정보 없음</span>
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 13, color: COLORS.dim }}>
            {kisConnected ? "보유 종목이 없습니다" : "KIS 연결 후 포트폴리오가 표시됩니다"}
          </span>
        </div>
        {cashBalance > 0 && (
          <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}`, display: "inline-block" }}>
            <span style={{ fontSize: 12, color: COLORS.dim }}>예수금 </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{Math.round(cashBalance).toLocaleString("ko-KR")}원</span>
          </div>
        )}
      </div>
    );
  }

  const stockRatio = total > 0 ? Math.round((totalStock / total) * 100) : 0;

  return (
    <div>
      {/* 요약 */}
      <div style={{ padding: 20, display: "flex", gap: 20, alignItems: "center", borderBottom: `1px solid ${COLORS.line}` }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Donut ratio={stockRatio} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.rise }}>{stockRatio}%</span>
            <div style={{ marginTop: 1 }}><span style={{ fontSize: 10, color: COLORS.dim }}>주식</span></div>
          </div>
        </div>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>총 평가금액</span>
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>{Math.round(total).toLocaleString("ko-KR")}</span>
            <span style={{ fontSize: 12, color: COLORS.mid }}> 원</span>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 20 }}>
            <div>
              <span style={{ fontSize: 12, color: COLORS.dim }}>주식</span>
              <div><span style={{ fontSize: 12, fontWeight: 700, color: COLORS.rise }}>{stockRatio}%</span></div>
            </div>
            <div>
              <span style={{ fontSize: 12, color: COLORS.dim }}>예수금</span>
              <div><span style={{ fontSize: 12, fontWeight: 700, color: COLORS.fall }}>{100 - stockRatio}%</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* 보유 종목 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>보유 종목 ({enriched.length})</span>
      </div>
      {enriched.map((h) => {
        const holdInfo = calcHoldInfo(h.code);
        const isDanger = holdInfo !== null && holdInfo.dday <= 1;
        return (
          <div key={h.code}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                  background: h.up ? COLORS.riseL : COLORS.fallL,
                  border: `1.5px solid ${h.up ? COLORS.riseB : COLORS.fallB}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: h.up ? COLORS.rise : COLORS.fall }}>{h.code.slice(0, 4)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{h.name}</span>
                    {holdInfo !== null && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
                        background: isDanger ? COLORS.fall : holdInfo.dday <= 2 ? COLORS.dim : COLORS.hero,
                        color: "#fff",
                      }}>
                        {holdInfo.dday <= 0 ? "청산" : `D-${holdInfo.dday}`}
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <span style={{ fontSize: 12, color: COLORS.dim }}>
                      {h.quantity}주 · 평균 {h.avgPrice.toLocaleString()}
                      {holdInfo !== null && ` · ${holdInfo.holdDays}일째`}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                {h.cur > 0 && <Sparkline data={[h.cur * 0.98, h.cur * 0.99, h.cur]} color={h.up ? COLORS.rise : COLORS.fall} />}
                <div style={{ textAlign: "right", minWidth: 72 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                    {h.cur > 0 ? h.cur.toLocaleString() : "—"}
                  </span>
                  <div style={{ marginTop: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: h.up ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                      {h.cur > 0 ? `${h.up ? "+" : ""}${h.pct.toFixed(2)}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: COLORS.line }} />
          </div>
        );
      })}
    </div>
  );
}
