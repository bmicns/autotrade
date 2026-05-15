"use client";

import type { CSSProperties } from "react";
import { COLORS } from "@/lib/constants";
import { Sparkline } from "@/components/ui/sparkline";
import { Icon } from "@/components/ui/icons";
import type { NewsItem } from "@/lib/news";
import type { OverseasHoldingSummary } from "./home-types";

interface KrHolding {
  code: string;
  name: string;
  quantity: number;
  market: string;
  currentPrice?: number;
  avgPrice: number;
  pnlRate?: number;
}

interface HoldingsSectionProps {
  marketMode: "kr" | "us";
  holdings: KrHolding[];
  kisConnected: boolean;
  mobileHoldingScrollStyle?: CSSProperties;
  overseasSummary: OverseasHoldingSummary | null;
  getPrice: (code: string) => { price: number; change: number | null };
  getCandles: (code: string, fallbackPrice: number) => number[];
  getHoldingNews: (...aliases: string[]) => NewsItem[];
}

export function HoldingsSection({
  marketMode,
  holdings,
  kisConnected,
  mobileHoldingScrollStyle,
  overseasSummary,
  getPrice,
  getCandles,
  getHoldingNews,
}: HoldingsSectionProps) {
  const isKrView = marketMode === "kr";
  const isUsView = marketMode === "us";

  return (
    <>
      {isKrView && (
        <>
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
          ) : (
            <div style={mobileHoldingScrollStyle}>
              {holdings.map((h) => {
                const { price, change } = getPrice(h.code);
                const up = change !== null ? change >= 0 : (h.pnlRate ?? 0) >= 0;
                const holdingNews = getHoldingNews(h.name);
                const purchaseChange = typeof h.pnlRate === "number"
                  ? h.pnlRate
                  : (price > 0 && h.avgPrice > 0 ? ((price - h.avgPrice) / h.avgPrice) * 100 : null);
                const purchaseUp = (purchaseChange ?? 0) >= 0;

                return (
                  <div key={h.code}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                          background: up ? COLORS.riseL : COLORS.fallL,
                          border: `1.5px solid ${up ? COLORS.riseB : COLORS.fallB}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <Icon name={up ? "up" : "dn"} size={17} color={up ? COLORS.rise : COLORS.fall} strokeWidth={2} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {h.name}
                          </div>
                          <div style={{ marginTop: 0 }}>
                            <span style={{ fontSize: 10, fontWeight: 500, color: COLORS.dim }}>{h.quantity}주 · {h.market}</span>
                          </div>
                          {holdingNews.length > 0 && (
                            <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                              {holdingNews.map((item) => (
                                <div key={`${h.code}-${item.url}`} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                  <span style={{
                                    flexShrink: 0,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: item.sentiment === "positive" ? COLORS.rise : item.sentiment === "negative" ? COLORS.fall : COLORS.dim,
                                    background: item.sentiment === "positive" ? COLORS.riseL : item.sentiment === "negative" ? COLORS.fallL : COLORS.sub,
                                    border: `1px solid ${item.sentiment === "positive" ? COLORS.riseB : item.sentiment === "negative" ? COLORS.fallB : COLORS.line}`,
                                    borderRadius: 999,
                                    padding: "2px 6px",
                                  }}>
                                    {item.sentiment === "positive" ? "호재" : item.sentiment === "negative" ? "악재" : "중립"}
                                  </span>
                                  <span style={{ fontSize: 11, color: COLORS.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                                    {item.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 86 }}>
                          {price > 0 && <Sparkline data={getCandles(h.code, price)} color={purchaseUp ? COLORS.rise : COLORS.fall} baseline={h.avgPrice} w={42} h={24} />}
                          <div style={{ textAlign: "right", minWidth: 36 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim }}>손익</div>
                            <div style={{ marginTop: 2, fontSize: 13, fontWeight: 500, color: purchaseUp ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                              {purchaseChange !== null ? `${purchaseChange >= 0 ? "+" : ""}${purchaseChange.toFixed(2)}%` : "—"}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 108, justifyContent: "flex-end" }}>
                          {price > 0 && <Sparkline data={getCandles(h.code, price)} color={up ? COLORS.rise : COLORS.fall} baseline={h.avgPrice} w={42} h={24} />}
                          <div style={{ textAlign: "right", minWidth: 58 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                              {price > 0 ? price.toLocaleString("ko-KR") : "—"}
                            </span>
                            <div style={{ marginTop: 2, fontSize: 12, fontWeight: 500, color: up ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                              {price > 0 && change !== null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ height: 1, background: COLORS.line }} />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {isUsView && overseasSummary?.configured && (
        <>
          <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              해외 보유 ({overseasSummary.holdings.length})
            </span>
            <span style={{ fontSize: 11, color: COLORS.dim }}>
              {overseasSummary.connected ? `USD ${(overseasSummary.summary?.totalUsd ?? 0).toFixed(2)}` : "연결 확인 중"}
            </span>
          </div>

          {overseasSummary.holdings.length === 0 ? (
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ padding: "14px 16px", borderRadius: 12, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 12, color: COLORS.dim }}>
                  {overseasSummary.connected ? "미국 보유 종목이 없습니다." : "미국 계좌 잔고를 확인 중입니다."}
                </span>
              </div>
            </div>
          ) : overseasSummary.holdings.map((holding) => {
            const isUp = holding.pnlRate >= 0;
            const holdingNews = getHoldingNews(holding.name, holding.symbol);
            return (
              <div key={`${holding.symbol}:${holding.exchangeCode}`}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: isUp ? COLORS.riseL : COLORS.fallL,
                      border: `1.5px solid ${isUp ? COLORS.riseB : COLORS.fallB}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: isUp ? COLORS.rise : COLORS.fall }}>{holding.symbol.slice(0, 4)}</span>
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{holding.name}</span>
                        <span style={{ fontSize: 10, color: COLORS.dim, padding: "2px 6px", borderRadius: 999, background: COLORS.sub }}>
                          {holding.kind === "etf" ? "ETF" : "STOCK"}
                        </span>
                        <span style={{ fontSize: 10, color: "#1D4ED8", padding: "2px 6px", borderRadius: 999, background: "#DBEAFE" }}>
                          {holding.exchangeCode}
                        </span>
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <span style={{ fontSize: 12, color: COLORS.dim }}>{holding.symbol} · {holding.quantity}주 · USD</span>
                      </div>
                      {holdingNews.length > 0 && (
                        <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                          {holdingNews.map((item) => (
                            <div key={`${holding.symbol}-${item.url}`} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                              <span style={{
                                flexShrink: 0,
                                fontSize: 10,
                                fontWeight: 700,
                                color: item.sentiment === "positive" ? COLORS.rise : item.sentiment === "negative" ? COLORS.fall : COLORS.dim,
                                background: item.sentiment === "positive" ? COLORS.riseL : item.sentiment === "negative" ? COLORS.fallL : COLORS.sub,
                                border: `1px solid ${item.sentiment === "positive" ? COLORS.riseB : item.sentiment === "negative" ? COLORS.fallB : COLORS.line}`,
                                borderRadius: 999,
                                padding: "2px 6px",
                              }}>
                                {item.sentiment === "positive" ? "호재" : item.sentiment === "negative" ? "악재" : "중립"}
                              </span>
                              <span style={{ fontSize: 11, color: COLORS.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                                {item.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
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
          })}
        </>
      )}
    </>
  );
}
