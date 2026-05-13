"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Sparkline } from "@/components/ui/sparkline";
import { Donut } from "@/components/ui/donut";
import { PortfolioSnapshot } from "@/components/portfolio/portfolio-snapshot";

const INITIAL_NOW_MS = Date.now();

interface PositionInfo {
  stock_code: string;
  entry_date: string;
  direct_order_note?: string | null;
  direct_order_market?: string | null;
}

interface OverseasHolding {
  symbol: string;
  name: string;
  exchangeCode: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  pnlAmount: number;
  pnlRate: number;
  currency: string;
  kind: "stock" | "etf";
}

interface Props {
  marketMode?: "kr" | "us";
}

export function PortfolioTab({ marketMode = "kr" }: Props) {
  const holdings = useAppStore((s) => s.holdings);
  const prices = useAppStore((s) => s.prices);
  const candles = useAppStore((s) => s.candles);
  const kisConnected = useAppStore((s) => s.kisConnected);
  const cashBalance = useAppStore((s) => s.cashBalance);
  const storeTotalEval = useAppStore((s) => s.totalEval);
  const [positionMap, setPositionMap] = useState<Map<string, PositionInfo>>(new Map());
  const [overseasHoldings, setOverseasHoldings] = useState<OverseasHolding[]>([]);
  const [overseasConfigured, setOverseasConfigured] = useState(false);
  const [overseasConnected, setOverseasConnected] = useState(false);
  useEffect(() => {
    fetch("/api/positions")
      .then((r) => r.json())
      .then((data: PositionInfo[]) => {
        if (Array.isArray(data)) {
          const m = new Map<string, PositionInfo>();
          data.forEach((p) => m.set(p.stock_code, p));
          setPositionMap(m);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/kis/overseas-holdings")
      .then((r) => r.json())
      .then((data: {
        configured?: boolean;
        connected?: boolean;
        holdings?: OverseasHolding[];
      }) => {
        setOverseasConfigured(Boolean(data.configured));
        setOverseasConnected(Boolean(data.connected));
        setOverseasHoldings(Array.isArray(data.holdings) ? data.holdings : []);
      })
      .catch(() => {
        setOverseasConfigured(false);
        setOverseasConnected(false);
        setOverseasHoldings([]);
      });
  }, []);

  const MAX_HOLD_DAYS = 5;

  function calcHoldInfo(code: string): { holdDays: number; dday: number } | null {
    const entryDate = positionMap.get(code)?.entry_date;
    if (!entryDate) return null;
    const holdDays = Math.max(1, Math.ceil((INITIAL_NOW_MS - new Date(entryDate).getTime()) / 86400000));
    return { holdDays, dday: MAX_HOLD_DAYS - holdDays };
  }

  const enriched = holdings.map((h) => {
    const real = prices.get(h.code);
    const cur = real?.price ?? h.currentPrice ?? 0;
    const pct = cur > 0 && h.avgPrice > 0
      ? ((cur - h.avgPrice) / h.avgPrice) * 100
      : (h.pnlRate ?? 0);
    const position = positionMap.get(h.code);
    return {
      ...h,
      cur,
      pct,
      up: pct >= 0,
      directOrderNote: position?.direct_order_note ?? null,
      directOrderMarket: position?.direct_order_market ?? null,
    };
  });

  const totalStock = enriched.reduce((s, h) => s + h.cur * h.quantity, 0);
  const total = storeTotalEval > 0 ? storeTotalEval : totalStock + cashBalance;
  const hasDomesticHoldings = holdings.length > 0;
  const hasOverseasHoldings = overseasHoldings.length > 0;
  const overseasTotalUsd = overseasHoldings.reduce((sum, item) => sum + item.currentPrice * item.quantity, 0);

  if (!hasDomesticHoldings && !hasOverseasHoldings) {
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
            {kisConnected || overseasConfigured ? "보유 종목이 없습니다" : "KIS 연결 후 포트폴리오가 표시됩니다"}
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
    <div data-testid="portfolio">
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

      {marketMode === "kr" && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>국내 보유 ({enriched.length})</span>
          </div>
          <PortfolioSnapshot />
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
                    {h.directOrderNote && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 999,
                        background: "#EFF6FF",
                        color: "#1D4ED8",
                        border: "1px solid #BFDBFE",
                      }}>
                        {h.directOrderNote}
                      </span>
                    )}
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
                {h.cur > 0 && (
                  <Sparkline
                    data={(() => { const c = candles.get(h.code); return c && c.length >= 2 ? c : [h.cur * 0.98, h.cur * 0.99, h.cur]; })()}
                    color={h.up ? COLORS.rise : COLORS.fall}
                    baseline={h.avgPrice}
                  />
                )}
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
        </>
      )}

      {marketMode === "us" && (
        <>
          <div style={{ padding: "20px 20px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
                해외 보유 ({overseasHoldings.length})
              </span>
              <span style={{ fontSize: 11, color: overseasConnected ? COLORS.hero : COLORS.dim }}>
                {overseasConfigured ? `USD ${overseasTotalUsd.toFixed(2)}` : "미국 계좌 미설정"}
              </span>
            </div>
          </div>
          {overseasHoldings.length > 0 ? overseasHoldings.map((holding) => {
        const isUp = holding.pnlRate >= 0;
        return (
          <div key={`${holding.symbol}:${holding.exchangeCode}`}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  flexShrink: 0,
                  background: isUp ? COLORS.riseL : COLORS.fallL,
                  border: `1.5px solid ${isUp ? COLORS.riseB : COLORS.fallB}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: isUp ? COLORS.rise : COLORS.fall }}>{holding.symbol.slice(0, 4)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{holding.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: COLORS.sub, color: COLORS.dim }}>
                      {holding.kind === "etf" ? "ETF" : "STOCK"}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: COLORS.hero, color: "#fff" }}>
                      {holding.exchangeCode}
                    </span>
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <span style={{ fontSize: 12, color: COLORS.dim }}>
                      {holding.symbol} · {holding.quantity}주 · 평균 ${holding.averagePrice.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 92 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                  ${holding.currentPrice > 0 ? holding.currentPrice.toFixed(2) : "—"}
                </span>
                <div style={{ marginTop: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isUp ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                    {holding.currentPrice > 0 ? `${isUp ? "+" : ""}${holding.pnlRate.toFixed(2)}%` : "—"}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: COLORS.line }} />
          </div>
        );
      }) : (
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ padding: "14px 16px", borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 12, color: COLORS.dim }}>
                  {overseasConfigured
                    ? overseasConnected
                      ? "미국 보유 종목이 없습니다."
                      : "미국 계좌 연결 확인 중입니다."
                    : "미국 계좌 프로필(us)을 설정하면 여기서 해외 보유를 확인할 수 있습니다."}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
