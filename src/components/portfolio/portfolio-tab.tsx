"use client";

import { COLORS, DUMMY_STOCKS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Sparkline } from "@/components/ui/sparkline";
import { Donut } from "@/components/ui/donut";

export function PortfolioTab() {
  const holdings = useAppStore((s) => s.holdings);
  const removeHolding = useAppStore((s) => s.removeHolding);
  const prices = useAppStore((s) => s.prices);
  const enriched = holdings.map((h) => {
    const real = prices.get(h.code);
    const stock = DUMMY_STOCKS.find((s) => s.code === h.code);
    const cur = real?.price ?? stock?.price ?? 0;
    const pct = h.avgPrice > 0 ? ((cur - h.avgPrice) / h.avgPrice) * 100 : 0;
    return { ...h, cur, pct, up: pct >= 0, history: stock?.history ?? [cur] };
  });

  const total = enriched.reduce((s, h) => s + h.cur * h.quantity, 0);
  const sectors = [{ name: "반도체", ratio: 65 }, { name: "IT/플랫폼", ratio: 20 }, { name: "기타", ratio: 15 }];

  return (
    <div>
      {/* 요약 */}
      <div style={{ padding: 20, display: "flex", gap: 20, alignItems: "center", borderBottom: `1px solid ${COLORS.line}` }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Donut ratio={65} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.rise }}>65%</span>
            <div style={{ marginTop: 1 }}><span style={{ fontSize: 10, color: COLORS.dim }}>반도체</span></div>
          </div>
        </div>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>총 평가금액</span>
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>{Math.round(total).toLocaleString("ko-KR")}</span>
            <span style={{ fontSize: 12, color: COLORS.mid }}> 원</span>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 20 }}>
            {sectors.map((sec) => (
              <div key={sec.name}>
                <span style={{ fontSize: 12, color: COLORS.dim }}>{sec.name}</span>
                <div><span style={{ fontSize: 12, fontWeight: 700, color: COLORS.rise }}>{sec.ratio}%</span></div>
              </div>
            ))}
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
                width: 42, height: 42, borderRadius: 10, flexShrink: 0,
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
                {h.up && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: COLORS.dim }}>트레일링 스탑</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.rise }}>고점 -3% 감시</span>
                    </div>
                    <div style={{ height: 3, background: COLORS.line, borderRadius: 2 }}>
                      <div style={{ height: "100%", width: "70%", background: COLORS.rise, borderRadius: 2 }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <Sparkline data={h.history} color={h.up ? COLORS.rise : COLORS.fall} />
              <div style={{ textAlign: "right", minWidth: 72 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>{h.cur.toLocaleString()}</span>
                <div style={{ marginTop: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: h.up ? COLORS.rise : COLORS.fall, fontVariantNumeric: "tabular-nums" }}>
                    {h.up ? "+" : ""}{h.pct.toFixed(2)}%
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
