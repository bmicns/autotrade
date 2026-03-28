"use client";

import { COLORS, DUMMY_PERF } from "@/lib/constants";

export function StatsTab() {
  const s = DUMMY_PERF;
  const maxV = Math.max(...s.indicators.map((x) => x.value));

  return (
    <div>
      {/* 이번 달 성과 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>이번 달 성과</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 16px 16px" }}>
        {[
          { l: "승률", v: `${s.winRate}%`, c: COLORS.ink },
          { l: "손익비", v: `${s.profitFactor}`, c: s.profitFactor >= 1 ? COLORS.rise : COLORS.fall },
          { l: "실현손익", v: `+${(s.totalPnl / 10000).toFixed(0)}만`, c: COLORS.rise },
          { l: "총 매매", v: `${s.totalTrades}회`, c: COLORS.ink },
          { l: "평균수익", v: `+${s.avgProfit}%`, c: COLORS.rise },
          { l: "평균손실", v: `-${s.avgLoss}%`, c: COLORS.fall },
        ].map((item, i) => (
          <div key={i} style={{ background: COLORS.sub, borderRadius: 10, padding: 14, border: `1px solid ${COLORS.line}` }}>
            <span style={{ fontSize: 12, color: COLORS.dim }}>{item.l}</span>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: item.c, fontVariantNumeric: "tabular-nums" }}>{item.v}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* 지표별 기여도 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>지표별 기여도</span>
      </div>
      <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column" as const, gap: 12 }}>
        {s.indicators.map((ind, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{ind.name}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.rise }}>{ind.value}%</span>
            </div>
            <div style={{ height: 6, background: COLORS.line, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(ind.value / maxV) * 100}%`, background: `linear-gradient(to right, ${COLORS.rise}, ${COLORS.rise}BB)`, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* 섹터별 승률 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>섹터별 승률</span>
      </div>
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column" as const, gap: 8 }}>
        {s.sectors.map((sec, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: COLORS.sub, borderRadius: 10, border: `1px solid ${COLORS.line}` }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{sec.name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: COLORS.dim }}>{sec.trades}회</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: sec.winRate >= 60 ? COLORS.rise : COLORS.mid, fontVariantNumeric: "tabular-nums" }}>{sec.winRate}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
