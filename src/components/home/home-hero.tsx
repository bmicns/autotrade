"use client";

import { COLORS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import type { MarketContext, OverseasHoldingSummary } from "./home-types";

interface HomeHeroProps {
  kisLoading: boolean;
  totalKRW: number;
  totalPnl: number;
  pct: number;
  isUp: boolean;
  kisConnected: boolean;
  isUsView: boolean;
  overseasSummary: OverseasHoldingSummary | null;
  marketCtx: MarketContext | null;
}

export function HomeHero(props: HomeHeroProps) {
  const {
    kisLoading,
    totalKRW,
    totalPnl,
    pct,
    isUp,
    kisConnected,
    isUsView,
    overseasSummary,
    marketCtx,
  } = props;

  return (
    <>
      <div data-testid="balance" style={{
        padding: "60px 20px 10px", textAlign: "right", position: "relative",
        background: COLORS.hero,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='17.32' viewBox='0 0 10 17.32'%3E%3Cpath d='M5 0L10 2.89V8.66L5 11.55L0 8.66V2.89Z' fill='none' stroke='%23ffffff' stroke-opacity='0.18' stroke-width='0.3'/%3E%3Cpath d='M10 5.77L15 8.66V14.43L10 17.32L5 14.43V8.66Z' fill='none' stroke='%23ffffff' stroke-opacity='0.18' stroke-width='0.3' transform='translate(-5,0)'/%3E%3C/svg%3E")`,
      }}>
        {kisLoading && (
          <div style={{ textAlign: "left", marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>KIS 데이터 로딩 중...</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 52, fontWeight: 100, color: "#fff", letterSpacing: "-2px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {kisLoading && totalKRW === 0 ? "—" : totalKRW > 0 ? Math.round(totalKRW).toLocaleString("ko-KR") : "0"}
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
          {isUsView && overseasSummary?.configured && (overseasSummary.summary?.positionCount ?? 0) > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#60A5FA" }} />
              해외 USD {overseasSummary.summary?.totalUsd.toFixed(2)}
            </span>
          )}
        </div>

        <div style={{
          marginTop: 24, marginBottom: 10, padding: "9px 14px", borderRadius: 12,
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

      {marketCtx && (
        <div style={{
          margin: "10px 20px 0",
          padding: "10px 14px",
          background: marketCtx.avg_rate >= 0 ? COLORS.riseL : COLORS.fallL,
          border: `1px solid ${marketCtx.avg_rate >= 0 ? COLORS.riseB : COLORS.fallB}`,
          borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em" }}>시장 모멘텀</span>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: marketCtx.kospi_rate >= 0 ? COLORS.rise : COLORS.fall }}>
                KOSPI {marketCtx.kospi_rate >= 0 ? "+" : ""}{marketCtx.kospi_rate.toFixed(2)}%
              </span>
              <span style={{ fontSize: 10, color: COLORS.dim }}>|</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: marketCtx.kosdaq_rate >= 0 ? COLORS.rise : COLORS.fall }}>
                KOSDAQ {marketCtx.kosdaq_rate >= 0 ? "+" : ""}{marketCtx.kosdaq_rate.toFixed(2)}%
              </span>
            </div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5,
            background: marketCtx.avg_rate >= 0 ? COLORS.rise : COLORS.fall, color: "#fff",
          }}>
            {marketCtx.label || (marketCtx.avg_rate >= 0 ? "강세" : "약세")}
          </span>
        </div>
      )}
    </>
  );
}
