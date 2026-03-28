"use client";

import { COLORS, DUMMY_STOCKS, DUMMY_KOSPI, DUMMY_NEWS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/ui/sparkline";
import { Icon } from "@/components/ui/icons";

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between px-5 pb-2.5 pt-5">
      <span className="text-xs font-bold uppercase tracking-tight" style={{ color: COLORS.dim }}>{title}</span>
      {sub && <span className="text-xs" style={{ color: COLORS.dim }}>{sub}</span>}
    </div>
  );
}

export function HomeTab() {
  const holdings = useAppStore((s) => s.holdings);

  const totalKRW = holdings.reduce((sum, h) => {
    const stock = DUMMY_STOCKS.find((s) => s.code === h.code);
    return sum + (stock ? stock.price * h.quantity : 0);
  }, 0);

  const totalPnl = holdings.reduce((sum, h) => {
    const stock = DUMMY_STOCKS.find((s) => s.code === h.code);
    if (!stock) return sum;
    return sum + (stock.price - h.avgPrice) * h.quantity;
  }, 0);

  const pct = totalKRW > 0 ? (totalPnl / (totalKRW - totalPnl)) * 100 : 0;
  const isUp = totalPnl >= 0;

  return (
    <div>
      {/* 히어로 */}
      <div className="px-5 pb-5 pt-6 text-right" style={{ background: COLORS.hero }}>
        <div className="flex items-baseline justify-end gap-1.5">
          <span className="text-[56px] font-thin tracking-tight text-white tabular-nums md:text-[70px]">
            {Math.round(totalKRW).toLocaleString("ko-KR")}
          </span>
          <span className="text-sm font-medium text-white/50">원</span>
        </div>
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <span className="text-sm font-bold tabular-nums" style={{ color: isUp ? COLORS.rise : "#6B9DFF" }}>
            {isUp ? "+" : ""}{Math.round(totalPnl).toLocaleString("ko-KR")}
          </span>
          <Badge label={`${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`} tone={isUp ? "rise" : "fall"} />
          <div className="h-3.5 w-px bg-white/15" />
          <span className="text-sm font-medium text-white/45">KOSPI {DUMMY_KOSPI.value.toLocaleString()}</span>
          <Badge label={`${DUMMY_KOSPI.change >= 0 ? "+" : ""}${DUMMY_KOSPI.change.toFixed(2)}%`} tone={DUMMY_KOSPI.change >= 0 ? "rise" : "fall"} />
        </div>
        {/* 국면 배너 */}
        <div className="mt-3.5 flex items-center justify-between rounded-lg p-[9px_14px]" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <span className="text-[11px] font-semibold text-white/70">하락 추세 감지 — 매수 한도 50% 축소 운영 중</span>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF9500]" style={{ boxShadow: "0 0 6px #FF9500" }} />
        </div>
      </div>

      <div className="h-px" style={{ background: COLORS.line }} />

      {/* 보유 종목 */}
      <SectionHead title={`보유 종목 (${holdings.length})`} />
      {holdings.map((h) => {
        const stock = DUMMY_STOCKS.find((s) => s.code === h.code);
        const price = stock?.price ?? 0;
        const chg = stock?.change ?? 0;
        const up = chg >= 0;
        return (
          <div key={h.code}>
            <div className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: up ? COLORS.riseL : COLORS.fallL, border: `1.5px solid ${up ? COLORS.riseB : COLORS.fallB}` }}
                >
                  <Icon name={up ? "up" : "dn"} size={17} color={up ? COLORS.rise : COLORS.fall} strokeWidth={2} />
                </div>
                <div>
                  <span className="text-sm font-semibold" style={{ color: COLORS.ink }}>{h.name}</span>
                  <div className="mt-0.5">
                    <span className="text-xs" style={{ color: COLORS.dim }}>{h.quantity}주 · {h.market}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3.5">
                <Sparkline data={stock?.history ?? []} color={up ? COLORS.rise : COLORS.fall} />
                <div className="text-right">
                  <span className="text-sm font-bold tabular-nums" style={{ color: COLORS.ink }}>{price.toLocaleString("ko-KR")}</span>
                  <div className="mt-0.5">
                    <span className="text-xs font-bold tabular-nums" style={{ color: up ? COLORS.rise : COLORS.fall }}>
                      {up ? "+" : ""}{chg.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="h-px" style={{ background: COLORS.line }} />
          </div>
        );
      })}

      {/* 뉴스 */}
      <SectionHead title="시장 뉴스" />
      {DUMMY_NEWS.map((n, i) => (
        <div key={i}>
          <div className="px-5 py-3">
            <div className="flex items-start justify-between gap-3">
              <span className="flex-1 text-sm font-medium leading-relaxed" style={{ color: COLORS.ink }}>{n.title}</span>
              <Badge
                label={n.mood === "pos" ? "긍정" : n.mood === "neg" ? "부정" : "중립"}
                tone={n.mood === "pos" ? "rise" : n.mood === "neg" ? "fall" : "dim"}
              />
            </div>
            <div className="mt-1"><span className="text-xs" style={{ color: COLORS.dim }}>{n.source}</span></div>
          </div>
          <div className="h-px" style={{ background: COLORS.line }} />
        </div>
      ))}
    </div>
  );
}
