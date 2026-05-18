"use client";

import { COLORS } from "@/lib/constants";
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
  isMobile: boolean;
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

function formatSnapshotTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
    isMobile,
  } = props;
  const now = new Date();
  const greeting = getTimeGreeting(now);
  const greetingCaption = getGreetingCaption(now);
  const snapshotTime = formatSnapshotTime(now);
  const resolvedDisplayName = (displayName ?? process.env.NEXT_PUBLIC_OPERATOR_NAME ?? "운영자").trim() || "운영자";
  const totalValueLabel = kisLoading && totalKRW === 0 ? "—" : totalKRW > 0 ? Math.round(totalKRW).toLocaleString("ko-KR") : "0";
  const pnlLabel = `${isUp ? "+" : ""}${Math.round(totalPnl).toLocaleString("ko-KR")}`;
  const returnLabel = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  const runtimePills = [
    { label: "운용 모드", value: isUsView ? "미국" : "국내" },
    { label: "데이터", value: kisConnected ? "실시간" : "오프라인" },
    { label: "기준 시각", value: snapshotTime },
  ];
  const primaryRuntimePills = runtimePills.slice(0, 2);
  const snapshotPill = runtimePills[2];
  const summaryItems = [
    { label: "보유 종목", value: `${holdingCount}개`, tone: "#FFFFFF" },
    { label: "대기 현금", value: `${Math.round(cashBalance).toLocaleString("ko-KR")}원`, tone: "#E2E8F0", noWrap: true, fontSize: 13 },
    { label: "연결 상태", value: kisConnected ? "정상 연결" : "점검 필요", tone: kisConnected ? "#86EFAC" : "#FDE68A" },
  ];

  return (
    <>
      <div data-testid="balance" style={{
        padding: isMobile ? "18px 16px 14px" : "26px 20px 16px",
        position: "relative",
        background: COLORS.hero,
        overflow: "hidden",
        backgroundImage: `radial-gradient(circle at top left, rgba(255,255,255,0.14), transparent 28%), radial-gradient(circle at bottom right, rgba(34,197,94,0.12), transparent 24%), linear-gradient(135deg, rgba(255,255,255,0.05), transparent 54%), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='17.32' viewBox='0 0 10 17.32'%3E%3Cpath d='M5 0L10 2.89V8.66L5 11.55L0 8.66V2.89Z' fill='none' stroke='%23ffffff' stroke-opacity='0.18' stroke-width='0.3'/%3E%3Cpath d='M10 5.77L15 8.66V14.43L10 17.32L5 14.43V8.66Z' fill='none' stroke='%23ffffff' stroke-opacity='0.18' stroke-width='0.3' transform='translate(-5,0)'/%3E%3C/svg%3E")`,
      }}>
        <div style={{
          position: "absolute",
          right: -60,
          top: -40,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(96,165,250,0.18), transparent 68%)",
          pointerEvents: "none",
        }} />
        {kisLoading && (
          <div style={{ textAlign: "left", marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>KIS 데이터 로딩 중...</span>
          </div>
        )}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.08fr) minmax(260px, 0.92fr)",
          gap: isMobile ? 14 : 16,
          alignItems: "stretch",
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ height: 20 }} />
            {isMobile ? (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 21, fontWeight: 800, color: "#fff", letterSpacing: "-0.045em", lineHeight: 1.15 }}>
                    {`${resolvedDisplayName}님`}
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 800, color: "#fff", letterSpacing: "-0.045em", lineHeight: 1.15 }}>
                    {greeting}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "nowrap", alignItems: "flex-start" }}>
                  {primaryRuntimePills.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 9px",
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>{item.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 25, fontWeight: 800, color: "#fff", letterSpacing: "-0.045em", lineHeight: 1.2 }}>
                {`${resolvedDisplayName}님, ${greeting}`}
              </div>
            )}
            <div style={{ marginTop: 7, maxWidth: isMobile ? 220 : 320, fontSize: isMobile ? 11 : 12, color: "rgba(255,255,255,0.68)", lineHeight: 1.65 }}>
              {greetingCaption}
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(isMobile ? [snapshotPill] : runtimePills).map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: isMobile ? "7px 9px" : "8px 10px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    minWidth: isMobile ? "100%" : "auto",
                    justifyContent: isMobile ? "space-between" : "flex-start",
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>{item.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{item.value}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: isMobile ? 6 : 8 }}>
              {summaryItems.map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: isMobile ? "11px 10px" : "12px 13px",
                    borderRadius: isMobile ? 12 : 14,
                    background: "linear-gradient(180deg, rgba(15,23,42,0.32), rgba(15,23,42,0.2))",
                    border: "1px solid rgba(255,255,255,0.08)",
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    {item.label}
                  </div>
                  <div style={{
                    marginTop: 7,
                    fontSize: isMobile ? Math.min(item.fontSize ?? 15, 13) : (item.fontSize ?? 15),
                    fontWeight: 800,
                    color: item.tone,
                    whiteSpace: item.noWrap ? "nowrap" : "normal",
                    overflow: item.noWrap ? "hidden" : "visible",
                    textOverflow: item.noWrap ? "ellipsis" : "clip",
                    lineHeight: 1.25,
                  }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            minWidth: 0,
            padding: isMobile ? "14px 14px 12px" : "16px 16px 14px",
            borderRadius: isMobile ? 18 : 20,
            background: "linear-gradient(180deg, rgba(255,255,255,0.11), rgba(255,255,255,0.04))",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 18px 36px rgba(2,6,23,0.24)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.62)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Total Equity
              </span>
              <span style={{ fontSize: 11, color: kisConnected ? "rgba(134,239,172,0.9)" : "rgba(253,230,138,0.9)", whiteSpace: "nowrap" }}>
                {kisConnected ? "KIS 실시간" : "KIS 미연결"}
              </span>
            </div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: isMobile ? 34 : 48, fontWeight: 100, color: "#fff", letterSpacing: isMobile ? "-1.7px" : "-2.4px", lineHeight: 1, fontVariantNumeric: "tabular-nums", wordBreak: "break-all" }}>
                {totalValueLabel}
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>원</span>
            </div>
            {isUsView && overseasSummary?.configured && (overseasSummary.summary?.positionCount ?? 0) > 0 && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#60A5FA" }} />
                해외 USD {overseasSummary.summary?.totalUsd.toFixed(2)}
              </div>
            )}
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: isMobile ? 6 : 8 }}>
              <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>총 손익</div>
                <div style={{ marginTop: 5, fontSize: isMobile ? 14 : 15, fontWeight: 800, color: isUp ? "#FCA5A5" : "#93C5FD", fontVariantNumeric: "tabular-nums", lineHeight: 1.25, wordBreak: "break-word" }}>
                  {totalPnl === 0 ? "0원" : `${pnlLabel}원`}
                </div>
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>수익률</div>
                <div style={{ marginTop: 5, fontSize: isMobile ? 14 : 15, fontWeight: 800, color: isUp ? "#FCA5A5" : "#93C5FD", fontVariantNumeric: "tabular-nums" }}>
                  {returnLabel}
                </div>
              </div>
            </div>
            {!kisConnected && (
              <div style={{
                marginTop: 16,
                padding: isMobile ? "10px 11px" : "10px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}>
                <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 600, color: "rgba(255,255,255,0.68)", lineHeight: 1.45 }}>
                  설정에서 KIS API 키를 등록해 실시간 계좌 상태를 연결하세요
                </span>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: COLORS.dim,
                }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {marketCtx && (
        <div style={{
          margin: isMobile ? "10px 16px 0" : "10px 20px 0",
          padding: isMobile ? "11px 12px" : "12px 14px",
          background: marketCtx.avg_rate >= 0 ? COLORS.riseL : COLORS.fallL,
          border: `1px solid ${marketCtx.avg_rate >= 0 ? COLORS.riseB : COLORS.fallB}`,
          borderRadius: 14,
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          flexDirection: isMobile ? "column" : "row",
          gap: isMobile ? 8 : 0,
          boxShadow: "0 8px 20px rgba(15,23,42,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: COLORS.dim, letterSpacing: "0.08em", textTransform: "uppercase" }}>시장 모멘텀</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: marketCtx.kospi_rate >= 0 ? COLORS.rise : COLORS.fall }}>
                KOSPI {marketCtx.kospi_rate >= 0 ? "+" : ""}{marketCtx.kospi_rate.toFixed(2)}%
              </span>
              <span style={{ fontSize: 10, color: COLORS.dim, display: isMobile ? "none" : "inline" }}>|</span>
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
