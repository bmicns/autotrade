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
  cashBalance: number;
  holdingCount: number;
  displayName: string | null;
}

function getTimeGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 6) return "늦은 시간입니다";
  if (hour < 12) return "좋은 아침입니다";
  if (hour < 18) return "좋은 오후입니다";
  return "편안한 저녁입니다";
}

function getGreetingCaption(date: Date): string {
  const hour = date.getHours();
  if (hour < 6) return "마감된 흐름까지 천천히 점검해보세요.";
  if (hour < 12) return "오늘 흐름을 차분하게 확인해보세요.";
  if (hour < 18) return "지금 장 흐름을 먼저 점검해보세요.";
  return "오늘 운용 결과를 편하게 정리해보세요.";
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
    cashBalance,
    holdingCount,
    displayName,
  } = props;
  const greeting = getTimeGreeting(new Date());
  const greetingCaption = getGreetingCaption(new Date());
  const resolvedDisplayName = (displayName ?? process.env.NEXT_PUBLIC_OPERATOR_NAME ?? "운영자").trim() || "운영자";

  return (
    <>
      <div data-testid="balance" style={{
        padding: "34px 20px 12px",
        position: "relative",
        background: COLORS.hero,
        backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.04), transparent 52%), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='17.32' viewBox='0 0 10 17.32'%3E%3Cpath d='M5 0L10 2.89V8.66L5 11.55L0 8.66V2.89Z' fill='none' stroke='%23ffffff' stroke-opacity='0.18' stroke-width='0.3'/%3E%3Cpath d='M10 5.77L15 8.66V14.43L10 17.32L5 14.43V8.66Z' fill='none' stroke='%23ffffff' stroke-opacity='0.18' stroke-width='0.3' transform='translate(-5,0)'/%3E%3C/svg%3E")`,
      }}>
        {kisLoading && (
          <div style={{ textAlign: "left", marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>KIS 데이터 로딩 중...</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "rgba(15,23,42,0.22)", border: "1px solid rgba(255,255,255,0.12)", marginLeft: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.62)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Nexio Operator Deck
              </span>
            </div>
            <div style={{ marginTop: 12, fontSize: 23, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em" }}>
              {`${resolvedDisplayName}님, ${greeting}`}
            </div>
            <div style={{ marginTop: 5, fontSize: 12, color: "rgba(255,255,255,0.68)", lineHeight: 1.6 }}>
              {greetingCaption}
            </div>
          </div>

          <div style={{ textAlign: "right", marginLeft: "auto", paddingTop: 14 }}>
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
          </div>
        </div>

        <div style={{
          marginTop: 18, marginBottom: 10, padding: "9px 14px", borderRadius: 12,
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
          {[
            { label: "보유 종목", value: `${holdingCount}개`, tone: "#FFFFFF" },
            { label: "대기 현금", value: `${Math.round(cashBalance).toLocaleString("ko-KR")}원`, tone: "#E2E8F0", noWrap: true, fontSize: 13 },
            { label: "연결 상태", value: kisConnected ? "연결" : "점검 필요", tone: kisConnected ? "#86EFAC" : "#FDE68A" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: "12px 13px",
                borderRadius: 12,
                background: "rgba(15,23,42,0.22)",
                border: "1px solid rgba(255,255,255,0.08)",
                minWidth: 0,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {item.label}
              </div>
              <div style={{ marginTop: 6, fontSize: item.fontSize ?? 15, fontWeight: 800, color: item.tone, whiteSpace: item.noWrap ? "nowrap" : "normal", overflow: item.noWrap ? "hidden" : "visible", textOverflow: item.noWrap ? "clip" : "unset" }}>
                {item.value}
              </div>
            </div>
          ))}
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
