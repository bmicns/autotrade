"use client";

import { useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/ui/sparkline";
import { Icon } from "@/components/ui/icons";

export function HomeTab() {
  const holdings = useAppStore((s) => s.holdings);
  const prices = useAppStore((s) => s.prices);
  const kisConnected = useAppStore((s) => s.kisConnected);
  const kisLoading = useAppStore((s) => s.kisLoading);
  const kisConfig = useAppStore((s) => s.kisConfig);
  const fetchKISData = useAppStore((s) => s.fetchKISData);
  const storeTotalEval = useAppStore((s) => s.totalEval);
  const storeTotalPnl = useAppStore((s) => s.totalPnl);
  const cashBalance = useAppStore((s) => s.cashBalance);

  useEffect(() => {
    if (kisConfig.token && kisConfig.accountNo && !kisConnected && !kisLoading) {
      fetchKISData();
    }
  }, [kisConfig.token, kisConfig.accountNo, kisConnected, kisLoading, fetchKISData]);

  function getPrice(code: string) {
    const real = prices.get(code);
    if (real) return { price: real.price, change: real.changeRate };
    return { price: 0, change: 0 };
  }

  const totalKRW = storeTotalEval > 0
    ? storeTotalEval
    : holdings.reduce((sum, h) => sum + getPrice(h.code).price * h.quantity, 0) + cashBalance;

  const totalPnl = storeTotalPnl !== 0
    ? storeTotalPnl
    : holdings.reduce((sum, h) => {
        const p = getPrice(h.code);
        return p.price > 0 ? sum + (p.price - h.avgPrice) * h.quantity : sum;
      }, 0);

  const pct = totalKRW > 0 && totalPnl !== 0 ? (totalPnl / (totalKRW - totalPnl)) * 100 : 0;
  const isUp = totalPnl >= 0;

  return (
    <div>
      {/* ── 히어로 ── */}
      <div style={{ padding: "24px 20px 20px", background: COLORS.hero, textAlign: "right" }}>
        {kisLoading && (
          <div style={{ textAlign: "left", marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>KIS 데이터 로딩 중...</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 52, fontWeight: 100, color: "#fff", letterSpacing: "-2px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {totalKRW > 0 ? Math.round(totalKRW).toLocaleString("ko-KR") : "0"}
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>원</span>
        </div>

        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {totalPnl !== 0 && (
            <>
              <span style={{ fontSize: 14, fontWeight: 700, color: isUp ? COLORS.rise : "#6B9DFF", fontVariantNumeric: "tabular-nums" }}>
                {isUp ? "+" : ""}{Math.round(totalPnl).toLocaleString("ko-KR")}
              </span>
              <Badge label={`${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`} tone={isUp ? "rise" : "fall"} />
              <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.15)" }} />
            </>
          )}
          {kisConnected ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} /> KIS 실시간
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>KIS 미연결</span>
          )}
        </div>

        {/* 상태 배너 */}
        <div style={{
          marginTop: 14, padding: "9px 14px", borderRadius: 8,
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
            {kisConnected ? "KIS 모의투자 연결됨 — 실시간 데이터" : "설정에서 KIS API 키를 등록하세요"}
          </span>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: kisConnected ? "#22C55E" : COLORS.dim,
            boxShadow: kisConnected ? "0 0 6px #22C55E" : "none",
          }} />
        </div>
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* ── 보유 종목 ── */}
      <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" }}>
          보유 종목 ({holdings.length})
        </span>
      </div>

      {holdings.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: COLORS.dim }}>
            {kisConnected ? "보유 종목이 없습니다" : "KIS 연결 후 보유 종목이 표시됩니다"}
          </span>
        </div>
      ) : holdings.map((h) => {
        const { price, change } = getPrice(h.code);
        const up = change >= 0;
        return (
          <div key={h.code}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                  background: up ? COLORS.riseL : COLORS.fallL,
                  border: `1.5px solid ${up ? COLORS.riseB : COLORS.fallB}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name={up ? "up" : "dn"} size={17} color={up ? COLORS.rise : COLORS.fall} strokeWidth={2} />
                </div>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{h.name}</span>
                  <div style={{ marginTop: 3 }}>
                    <span style={{ fontSize: 12, color: COLORS.dim }}>{h.quantity}주 · {h.market}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {price > 0 && <Sparkline data={[price * 0.98, price * 0.99, price]} color={up ? COLORS.rise : COLORS.fall} />}
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                    {price > 0 ? price.toLocaleString("ko-KR") : "—"}
                  </span>
                  <div style={{ marginTop: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: up ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                      {price > 0 ? `${up ? "+" : ""}${change.toFixed(2)}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: COLORS.line }} />
          </div>
        );
      })}

      {/* ── 시장 뉴스 ── */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" }}>시장 뉴스</span>
      </div>
      <div style={{ padding: "20px 20px 40px", textAlign: "center" }}>
        <span style={{ fontSize: 13, color: COLORS.dim }}>정보 없음</span>
      </div>
    </div>
  );
}
