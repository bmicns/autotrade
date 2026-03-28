"use client";

import { COLORS, DUMMY_PERF } from "@/lib/constants";

export function StatsTab() {
  const s = DUMMY_PERF;
  const maxV = Math.max(...s.indicators.map((x) => x.value));

  return (
    <div>
      {/* 이번 달 성과 */}
      <div className="flex items-center justify-between px-5 pb-2.5 pt-5">
        <span className="text-xs font-bold uppercase tracking-tight" style={{ color: COLORS.dim }}>이번 달 성과</span>
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        {[
          { l: "승률", v: `${s.winRate}%`, c: COLORS.ink },
          { l: "손익비", v: `${s.profitFactor}`, c: s.profitFactor >= 1 ? COLORS.rise : COLORS.fall },
          { l: "실현손익", v: `+${(s.totalPnl / 10000).toFixed(0)}만`, c: COLORS.rise },
          { l: "총 매매", v: `${s.totalTrades}회`, c: COLORS.ink },
          { l: "평균수익", v: `+${s.avgProfit}%`, c: COLORS.rise },
          { l: "평균손실", v: `-${s.avgLoss}%`, c: COLORS.fall },
        ].map((item, i) => (
          <div key={i} className="rounded-[10px] p-3.5" style={{ background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
            <span className="text-xs" style={{ color: COLORS.dim }}>{item.l}</span>
            <div className="mt-2">
              <span className="text-sm font-extrabold tabular-nums" style={{ color: item.c }}>{item.v}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="h-px" style={{ background: COLORS.line }} />

      {/* 지표별 기여도 */}
      <div className="flex items-center justify-between px-5 pb-2.5 pt-5">
        <span className="text-xs font-bold uppercase tracking-tight" style={{ color: COLORS.dim }}>지표별 기여도</span>
      </div>
      <div className="flex flex-col gap-3 px-5 pb-4">
        {s.indicators.map((ind, i) => (
          <div key={i}>
            <div className="mb-1.5 flex justify-between">
              <span className="text-sm font-semibold" style={{ color: COLORS.ink }}>{ind.name}</span>
              <span className="text-sm font-bold" style={{ color: COLORS.rise }}>{ind.value}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-[3px]" style={{ background: COLORS.line }}>
              <div
                className="h-full rounded-[3px]"
                style={{ width: `${(ind.value / maxV) * 100}%`, background: `linear-gradient(to right, ${COLORS.rise}, ${COLORS.rise}BB)` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="h-px" style={{ background: COLORS.line }} />

      {/* 섹터별 승률 */}
      <div className="flex items-center justify-between px-5 pb-2.5 pt-5">
        <span className="text-xs font-bold uppercase tracking-tight" style={{ color: COLORS.dim }}>섹터별 승률</span>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {s.sectors.map((sec, i) => (
          <div key={i} className="flex items-center justify-between rounded-[10px] px-4 py-3" style={{ background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
            <span className="text-xs font-semibold" style={{ color: COLORS.ink }}>{sec.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: COLORS.dim }}>{sec.trades}회</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: sec.winRate >= 60 ? COLORS.rise : COLORS.mid }}>{sec.winRate}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
