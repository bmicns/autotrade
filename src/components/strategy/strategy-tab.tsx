"use client";

import { useState } from "react";
import { COLORS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";

const PARAMS = [
  { name: "RSI 매수 기준", cur: "30", sug: "28", changed: true },
  { name: "지표 일치 기준", cur: "4개", sug: "4개", changed: false },
  { name: "트레일링 스탑", cur: "-3%", sug: "-3%", changed: false },
  { name: "거래량 기준", cur: "200%", sug: "180%", changed: true },
  { name: "1차 익절", cur: "+5%", sug: "+5%", changed: false },
];

const VERSIONS = [
  { v: "v1.2", d: "2026-03-01", n: "거래량 기준 완화" },
  { v: "v1.1", d: "2026-02-01", n: "트레일링 스탑 조정" },
  { v: "v1.0", d: "2026-01-01", n: "초기 파라미터" },
];

export function StrategyTab() {
  const [approved, setApproved] = useState(false);

  return (
    <div>
      {/* 현재 전략 파라미터 */}
      <div className="flex items-center justify-between px-5 pb-2.5 pt-5">
        <span className="text-xs font-bold uppercase tracking-tight" style={{ color: COLORS.dim }}>현재 전략 파라미터</span>
      </div>
      <div className="px-5">
        {PARAMS.map((p, i) => (
          <div key={i} className="flex items-center justify-between py-[13px]" style={{ borderTop: `1px solid ${COLORS.line}` }}>
            <span className="text-xs font-medium" style={{ color: COLORS.ink }}>{p.name}</span>
            <div className="flex items-center gap-2">
              {p.changed && <span className="text-xs line-through" style={{ color: COLORS.dim }}>{p.cur}</span>}
              <span className="text-xs font-bold" style={{ color: p.changed ? COLORS.rise : COLORS.ink }}>{p.sug}</span>
              {p.changed && <Badge label="변경 제안" tone="rise" />}
            </div>
          </div>
        ))}
      </div>

      {/* Claude 전략 개선안 */}
      <div className="mx-4 mt-4 rounded-xl p-4" style={{ background: `${COLORS.fall}08`, border: `1px solid ${COLORS.fall}30` }}>
        <div className="mb-2.5 flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: COLORS.fall }}>3월 Claude 전략 개선안</span>
          <Badge label="승인 대기" tone="gold" />
        </div>
        <span className="text-sm leading-relaxed" style={{ color: COLORS.mid }}>
          RSI 28~30 구간 반등 성공률 74% 집계. 기준값 30→28 조정 시 진입 타이밍 개선. 거래량 기준 200%→180% 완화 시 놓치는 신호 약 12% 감소.
        </span>
        <div className="mt-3.5 flex gap-2">
          {!approved ? (
            <>
              <button className="flex-1 rounded-lg border py-3 text-[11px] font-semibold" style={{ borderColor: COLORS.lineD, color: COLORS.mid, background: "transparent" }}>
                거절
              </button>
              <button onClick={() => setApproved(true)} className="flex-[2] rounded-lg border-none py-3 text-[11px] font-bold text-white" style={{ background: COLORS.ink }}>
                승인 · 파라미터 적용
              </button>
            </>
          ) : (
            <div className="flex-1 rounded-lg p-3 text-center" style={{ background: COLORS.riseL, border: `1px solid ${COLORS.riseB}` }}>
              <span className="text-xs font-bold" style={{ color: COLORS.rise }}>✓ 파라미터 업데이트 완료</span>
            </div>
          )}
        </div>
      </div>

      {/* 버전 이력 */}
      <div className="flex items-center justify-between px-5 pb-2.5 pt-5">
        <span className="text-xs font-bold uppercase tracking-tight" style={{ color: COLORS.dim }}>버전 이력</span>
      </div>
      <div className="px-5 pb-4">
        {VERSIONS.map((item, i) => (
          <div key={i} className="flex items-center justify-between py-3" style={{ borderTop: `1px solid ${COLORS.line}` }}>
            <div>
              <span className="text-xs font-bold" style={{ color: COLORS.ink }}>{item.v}</span>
              <div className="mt-0.5"><span className="text-xs" style={{ color: COLORS.dim }}>{item.d} · {item.n}</span></div>
            </div>
            <Icon name="cr" size={16} color={COLORS.dim} strokeWidth={1.4} />
          </div>
        ))}
      </div>
    </div>
  );
}
