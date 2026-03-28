"use client";

import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Sparkline } from "@/components/ui/sparkline";
import { Donut } from "@/components/ui/donut";

export function PortfolioTab() {
  const holdings = useAppStore((s) => s.holdings);
  const prices = useAppStore((s) => s.prices);
  const kisConnected = useAppStore((s) => s.kisConnected);
  const cashBalance = useAppStore((s) => s.cashBalance);

  const enriched = holdings.map((h) => {
    const real = prices.get(h.code);
    const cur = real?.price ?? 0;
    const pct = h.avgPrice > 0 && cur > 0 ? ((cur - h.avgPrice) / h.avgPrice) * 100 : 0;
    return { ...h, cur, pct, up: pct >= 0 };
  });

  const totalStock = enriched.reduce((s, h) => s + h.cur * h.quantity, 0);
  const total = totalStock + cashBalance;

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
          <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>총 평가금액</span>
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
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>보유 종목 ({enriched.length})</span>
      </div>
      {enriched.map((h) => (
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
                <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{h.name}</span>
                <div style={{ marginTop: 3 }}>
                  <span style={{ fontSize: 12, color: COLORS.dim }}>{h.quantity}주 · 평균 {h.avgPrice.toLocaleString()}</span>
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
      ))}
    </div>
  );
}
