"use client";

import { useState, useEffect } from "react";
import { COLORS, DUMMY_STOCKS, SIGNAL_INDICATORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";

function TimerBar({ total }: { total: number }) {
  const [left, setLeft] = useState(total);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const pct = (left / total) * 100;
  const col = pct > 50 ? COLORS.ink : COLORS.rise;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div>
      <div className="mb-1.5 flex justify-between">
        <span className="text-xs font-semibold" style={{ color: COLORS.mid }}>승인 타임아웃</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: col }}>{mm}:{ss}</span>
      </div>
      <div className="h-[3px] rounded-sm" style={{ background: COLORS.line }}>
        <div className="h-full rounded-sm transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%`, background: col }} />
      </div>
    </div>
  );
}

export function SignalTab() {
  const [sel, setSel] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const holdings = useAppStore((s) => s.holdings);
  const addTrade = useAppStore((s) => s.addTrade);
  const pending = holdings.slice(0, 2).map((h) => ({ ...h, match: 4 }));

  if (!pending.length) {
    return <div className="p-12 text-center"><span className="text-xs" style={{ color: COLORS.dim }}>보유 종목을 먼저 추가하세요</span></div>;
  }

  const s = pending[Math.min(sel, pending.length - 1)];
  const stock = DUMMY_STOCKS.find((x) => x.code === s.code);
  const price = stock?.price ?? s.avgPrice;

  return (
    <div>
      {/* 탭 선택 */}
      <div className="flex gap-2 px-4 pt-4">
        {pending.map((p, i) => (
          <button
            key={i}
            onClick={() => { setSel(i); setDone(null); }}
            className="flex-1 rounded-[10px] px-4 py-3 text-left"
            style={{
              border: `1.5px solid ${sel === i ? COLORS.rise : COLORS.line}`,
              background: sel === i ? COLORS.riseL : COLORS.sub,
            }}
          >
            <span className="text-xs font-bold" style={{ color: sel === i ? COLORS.rise : COLORS.ink }}>{p.name}</span>
            <div className="mt-0.5"><span className="text-xs" style={{ color: sel === i ? COLORS.rise : COLORS.dim }}>{p.match}/5 지표 일치</span></div>
          </button>
        ))}
      </div>

      {/* 카드 */}
      <div className="mx-4 mt-3 overflow-hidden rounded-xl" style={{ border: `1px solid ${COLORS.lineD}`, background: COLORS.card }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
          <div>
            <span className="text-lg font-bold" style={{ color: COLORS.ink }}>{s.name}</span>
            <div className="mt-1"><span className="text-xs" style={{ color: COLORS.dim }}>{s.code} · {s.market}</span></div>
          </div>
          <Badge label={`약한 신호 ${s.match}/5`} tone="gold" />
        </div>

        {/* 주문 정보 */}
        <div className="grid grid-cols-2 gap-px" style={{ borderBottom: `1px solid ${COLORS.line}`, background: COLORS.line }}>
          {[
            ["매매구분", "매수", COLORS.rise, true],
            ["현재가", price.toLocaleString() + "원", COLORS.ink, false],
            ["주문수량", s.quantity + "주", COLORS.ink, false],
            ["주문금액", (price * s.quantity).toLocaleString() + "원", COLORS.ink, false],
          ].map(([lbl, val, col, bold], i) => (
            <div key={i} className="px-4 py-3" style={{ background: COLORS.card }}>
              <span className="text-xs font-medium" style={{ color: COLORS.dim }}>{lbl as string}</span>
              <div className="mt-1">
                <span className="text-sm" style={{ fontWeight: bold ? 800 : 700, color: col as string }}>{val as string}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Claude 판단 */}
        <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${COLORS.line}`, background: `${COLORS.fall}08` }}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: COLORS.fall }}>Claude 판단</span>
            <Badge label="매수 · 신뢰도 높음" tone="fall" />
          </div>
          <span className="text-sm leading-relaxed" style={{ color: COLORS.mid }}>
            시장 하락 속 반도체 섹터 강세 유지. HBM4 수주 확정으로 펀더멘털 뒷받침. 외국인 순매수 전환 확인.
          </span>
        </div>

        {/* 지표 분석 */}
        <div className="px-5">
          <div className="pb-2 pt-3">
            <span className="text-xs font-bold uppercase tracking-tight" style={{ color: COLORS.dim }}>지표 분석</span>
          </div>
          {SIGNAL_INDICATORS.map((ind, i) => (
            <div key={i} className="flex items-center justify-between py-2.5" style={{ borderTop: `1px solid ${COLORS.line}` }}>
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                  style={{ background: ind.hit ? COLORS.rise : COLORS.sub }}
                >
                  <Icon name={ind.hit ? "ok" : "xx"} size={12} color={ind.hit ? "#fff" : COLORS.dim} strokeWidth={2.5} />
                </div>
                <div>
                  <span className="text-sm font-semibold" style={{ color: COLORS.ink }}>{ind.name}</span>
                  <div className="mt-px"><span className="text-xs" style={{ color: COLORS.dim }}>{ind.desc}</span></div>
                </div>
              </div>
              <span className="text-sm font-bold" style={{ color: ind.hit ? COLORS.rise : COLORS.dim }}>{ind.value}</span>
            </div>
          ))}
        </div>

        {/* 타이머 */}
        <div className="px-5 py-3.5" style={{ borderTop: `1px solid ${COLORS.line}` }}>
          <TimerBar total={180} />
        </div>
      </div>

      {/* 버튼 */}
      {done === null ? (
        <div className="flex gap-2 px-4 pb-4 pt-0">
          <button
            onClick={() => setDone("no")}
            className="flex-1 rounded-[10px] py-3.5 text-xs font-semibold"
            style={{ border: `1.5px solid ${COLORS.lineD}`, background: "transparent", color: COLORS.mid }}
          >
            거절
          </button>
          <button
            onClick={() => {
              setDone("yes");
              addTrade({
                id: crypto.randomUUID(),
                code: s.code,
                name: s.name,
                side: "buy",
                quantity: s.quantity,
                price,
                signalStrength: "weak",
                status: "executed",
                executedAt: new Date().toISOString(),
              });
            }}
            className="flex-[2] rounded-[10px] border-none py-3.5 text-xs font-bold text-white"
            style={{ background: COLORS.rise, boxShadow: `0 4px 20px ${COLORS.rise}50` }}
          >
            승인 · 매수 체결
          </button>
        </div>
      ) : (
        <div
          className="mx-4 mb-4 rounded-[10px] p-5 text-center"
          style={{
            background: done === "yes" ? COLORS.riseL : COLORS.sub,
            border: `1.5px solid ${done === "yes" ? COLORS.riseB : COLORS.lineD}`,
          }}
        >
          <span className="text-[22px]">{done === "yes" ? "✓" : "✕"}</span>
          <div className="mt-2">
            <span className="text-sm font-bold" style={{ color: done === "yes" ? COLORS.rise : COLORS.mid }}>
              {done === "yes" ? "매수 주문 체결 완료" : "주문 거절됨"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
