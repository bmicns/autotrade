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
    const chgRate = real?.changeRate ?? stock?.change ?? 0;
    const pct = h.avgPrice > 0 ? ((cur - h.avgPrice) / h.avgPrice) * 100 : 0;
    return { ...h, cur, pct, chgRate, up: pct >= 0, history: stock?.history ?? [cur] };
  });

  const total = enriched.reduce((s, h) => s + h.cur * h.quantity, 0);

  // 국내만이라 섹터별 비중으로 표시
  const sectors = [
    { name: "반도체", ratio: 65 },
    { name: "IT/플랫폼", ratio: 20 },
    { name: "기타", ratio: 15 },
  ];

  return (
    <div>
      {/* 요약 */}
      <div className="flex items-center gap-5 border-b px-5 py-5" style={{ borderColor: COLORS.line }}>
        <div className="relative shrink-0">
          <Donut ratio={65} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="text-xs font-extrabold" style={{ color: COLORS.rise }}>65%</span>
            <div className="mt-px"><span className="text-[10px]" style={{ color: COLORS.dim }}>반도체</span></div>
          </div>
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-tight" style={{ color: COLORS.dim }}>총 평가금액</span>
          <div className="mt-1.5">
            <span className="text-lg font-extrabold tabular-nums" style={{ color: COLORS.ink }}>
              {Math.round(total).toLocaleString("ko-KR")}
            </span>
            <span className="text-xs" style={{ color: COLORS.mid }}> 원</span>
          </div>
          <div className="mt-2.5 flex gap-5">
            {sectors.map((sec) => (
              <div key={sec.name}>
                <span className="text-xs" style={{ color: COLORS.dim }}>{sec.name}</span>
                <div><span className="text-xs font-bold" style={{ color: COLORS.rise }}>{sec.ratio}%</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 보유 종목 */}
      <div className="flex items-center justify-between px-5 pb-2.5 pt-5">
        <span className="text-xs font-bold uppercase tracking-tight" style={{ color: COLORS.dim }}>보유 종목 ({enriched.length})</span>
      </div>
      {enriched.map((h) => (
        <div key={h.code}>
          <div className="flex items-center justify-between px-5 py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px]"
                style={{ background: h.up ? COLORS.riseL : COLORS.fallL, border: `1.5px solid ${h.up ? COLORS.riseB : COLORS.fallB}` }}
              >
                <span className="text-xs font-extrabold" style={{ color: h.up ? COLORS.rise : COLORS.fall }}>{h.code.slice(0, 4)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold" style={{ color: COLORS.ink }}>{h.name}</span>
                <div className="mt-0.5">
                  <span className="text-xs" style={{ color: COLORS.dim }}>{h.quantity}주 · 평균 {h.avgPrice.toLocaleString()}</span>
                </div>
                {h.up && (
                  <div className="mt-1.5">
                    <div className="mb-0.5 flex justify-between">
                      <span className="text-[10px]" style={{ color: COLORS.dim }}>트레일링 스탑</span>
                      <span className="text-[10px] font-semibold" style={{ color: COLORS.rise }}>고점 -3% 감시</span>
                    </div>
                    <div className="h-[3px] rounded-sm" style={{ background: COLORS.line }}>
                      <div className="h-full w-[70%] rounded-sm" style={{ background: COLORS.rise }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Sparkline data={h.history} color={h.up ? COLORS.rise : COLORS.fall} />
              <div className="min-w-[72px] text-right">
                <span className="text-xs font-bold tabular-nums" style={{ color: COLORS.ink }}>{h.cur.toLocaleString()}</span>
                <div className="mt-0.5">
                  <span className="text-xs font-bold tabular-nums" style={{ color: h.up ? COLORS.rise : COLORS.fall }}>
                    {h.up ? "+" : ""}{h.pct.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="h-px" style={{ background: COLORS.line }} />
        </div>
      ))}
    </div>
  );
}
