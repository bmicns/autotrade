"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/ui/sparkline";
import { Icon } from "@/components/ui/icons";
import { EngineHealthCard } from "./engine-health-card";
import { EngineStateCard } from "./engine-state-card";

interface NewsItem {
  title: string;
  source: string;
  time: string;
  url: string;
  sentiment?: "positive" | "negative" | "neutral";
  score?: number;
  summary?: string;
}

interface MarketContext {
  kospi_rate: number;
  kosdaq_rate: number;
  avg_rate: number;
  bonus: number;
  label: string;
}

export function HomeTab() {
  const [newsTab, setNewsTab] = useState<"naver" | "dart">("naver");
  const [naverNews, setNaverNews] = useState<NewsItem[]>([]);
  const [disclosures, setDisclosures] = useState<NewsItem[]>([]);
  const [aiSentiment, setAiSentiment] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [marketCtx, setMarketCtx] = useState<MarketContext | null>(null);

  const holdings = useAppStore((s) => s.holdings);
  const prices = useAppStore((s) => s.prices);
  const candles = useAppStore((s) => s.candles);
  const kisConnected = useAppStore((s) => s.kisConnected);
  const kisLoading = useAppStore((s) => s.kisLoading);
  const kisConfig = useAppStore((s) => s.kisConfig);
  const fetchKISData = useAppStore((s) => s.fetchKISData);
  const storeTotalEval = useAppStore((s) => s.totalEval);
  const storeTotalPnl = useAppStore((s) => s.totalPnl);
  const cashBalance = useAppStore((s) => s.cashBalance);

  useEffect(() => {
    if (kisConfig.appKey && kisConfig.accountNo && !kisConnected && !kisLoading) {
      fetchKISData();
    }
  }, [kisConfig.appKey, kisConfig.accountNo, kisConnected, kisLoading, fetchKISData]);

  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((d) => {
        setNaverNews(d.naverNews || []);
        setDisclosures(d.disclosures || []);
        setAiSentiment(d.aiSentiment || []);
      })
      .catch(() => {})
      .finally(() => setNewsLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/engine-log")
      .then((r) => r.json())
      .then((d) => { if (d.marketContext) setMarketCtx(d.marketContext); })
      .catch(() => {});
  }, []);

  function getPrice(code: string) {
    const real = prices.get(code);
    if (real) return { price: real.price, change: real.changeRate as number | null };
    const h = holdings.find((h) => h.code === code);
    if (h?.currentPrice) return { price: h.currentPrice, change: null as number | null };
    return { price: 0, change: null as number | null };
  }

  function getCandles(code: string, fallbackPrice: number): number[] {
    const real = candles.get(code);
    if (real && real.length >= 2) return real;
    // 실데이터 없으면 가짜 데이터 fallback
    return [fallbackPrice * 0.98, fallbackPrice * 0.99, fallbackPrice];
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

  const storePnlRate = useAppStore((s) => s.totalPnlRate);
  const pct = storePnlRate !== 0 ? storePnlRate : (totalKRW > 0 && totalPnl !== 0 ? (totalPnl / (totalKRW - totalPnl)) * 100 : 0);
  const isUp = totalPnl >= 0;

  return (
    <div>
      {/* ── 히어로 ── */}
      <div data-testid="balance" style={{
        padding: "60px 20px 10px", textAlign: "right", position: "relative" as const,
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
            {kisLoading && totalKRW === 0
              ? "—"
              : totalKRW > 0
                ? Math.round(totalKRW).toLocaleString("ko-KR")
                : "0"}
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

      {/* 시장 모멘텀 배너 */}
      {marketCtx && (
        <div style={{
          margin: "0 20px 0",
          padding: "10px 14px",
          background: marketCtx.avg_rate >= 0 ? COLORS.riseL : COLORS.fallL,
          border: `1px solid ${marketCtx.avg_rate >= 0 ? COLORS.riseB : COLORS.fallB}`,
          borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 10, marginBottom: 0,
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
            fontSize: 10, fontWeight: 600,
            padding: "2px 7px", borderRadius: 5,
            background: marketCtx.avg_rate >= 0 ? COLORS.rise : COLORS.fall,
            color: "#fff",
          }}>
            {marketCtx.label || (marketCtx.avg_rate >= 0 ? "강세" : "약세")}
          </span>
        </div>
      )}

      <EngineHealthCard />
      <EngineStateCard />

      <div style={{ height: 1, background: COLORS.line, marginTop: 10 }} />

      {/* ── 보유 종목 ── */}
      <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          보유 종목 ({holdings.length})
        </span>
      </div>

      {holdings.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <span style={{ fontSize: 14, color: COLORS.dim }}>
            {kisConnected ? "보유 종목이 없습니다" : "KIS 연결 후 보유 종목이 표시됩니다"}
          </span>
        </div>
      ) : holdings.map((h) => {
        const { price, change } = getPrice(h.code);
        const up = change !== null ? change >= 0 : (h.pnlRate ?? 0) >= 0;
        return (
          <div key={h.code}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
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
                {price > 0 && <Sparkline data={getCandles(h.code, price)} color={up ? COLORS.rise : COLORS.fall} baseline={h.avgPrice} />}
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                    {price > 0 ? price.toLocaleString("ko-KR") : "—"}
                  </span>
                  <div style={{ marginTop: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: up ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                      {price > 0 && change !== null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: COLORS.line }} />
          </div>
        );
      })}

      {/* ── 뉴스 탭 (구글 뉴스 / 공시정보) ── */}
      <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>시장 뉴스</span>
        <div style={{ display: "flex", gap: 4, background: COLORS.sub, borderRadius: 8, padding: 3 }}>
          {(["naver", "dart"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setNewsTab(t)}
              style={{
                padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: newsTab === t ? 700 : 500, fontFamily: "inherit",
                background: newsTab === t ? "#fff" : "transparent",
                color: newsTab === t ? COLORS.ink : COLORS.dim,
                boxShadow: newsTab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {t === "naver" ? "구글 뉴스" : "공시정보"}
            </button>
          ))}
        </div>
      </div>

      {newsLoading ? (
        <div style={{ padding: "30px 20px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: COLORS.dim }}>뉴스 로딩 중...</span>
        </div>
      ) : (
        <div>
          {(newsTab === "naver" ? naverNews : disclosures).map((n, i) => (
            <div key={i}>
              <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                    {n.title}
                  </span>
                  <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>{n.source}</span>
                    <span style={{ fontSize: 11, color: COLORS.dim }}>{n.time}</span>
                  </div>
                </div>
              </div>
              <div style={{ height: 1, background: COLORS.line }} />
            </div>
          ))}
        </div>
      )}

      {/* ── AI 감성 분석 ── */}
      <div style={{ padding: "24px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>AI 감성 분석</span>
      </div>
      <div style={{ padding: "0 20px 30px" }}>
        <div style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
          {/* 테이블 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", background: COLORS.sub, padding: "10px 16px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>뉴스</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>감성</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>판단</span>
          </div>
          {/* 테이블 바디 */}
          {aiSentiment.map((n, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", padding: "12px 16px", borderTop: `1px solid ${COLORS.line}`, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {n.title}
              </span>
              <div style={{ textAlign: "center" }}>
                <span style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                  background: n.sentiment === "positive" ? COLORS.riseL : n.sentiment === "negative" ? COLORS.fallL : COLORS.sub,
                  color: n.sentiment === "positive" ? COLORS.rise : n.sentiment === "negative" ? COLORS.fall : COLORS.dim,
                  border: `1px solid ${n.sentiment === "positive" ? COLORS.riseB : n.sentiment === "negative" ? COLORS.fallB : COLORS.line}`,
                }}>
                  {n.sentiment === "positive" ? "긍정" : n.sentiment === "negative" ? "부정" : "중립"}
                </span>
              </div>
              <span style={{ fontSize: 11, color: COLORS.mid, textAlign: "right" }}>{n.summary}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
