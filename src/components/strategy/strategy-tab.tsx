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
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>현재 전략 파라미터</span>
      </div>
      <div style={{ padding: "0 20px" }}>
        {PARAMS.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderTop: `1px solid ${COLORS.line}` }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink }}>{p.name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {p.changed && <span style={{ fontSize: 12, color: COLORS.dim, textDecoration: "line-through" }}>{p.cur}</span>}
              <span style={{ fontSize: 14, fontWeight: 700, color: p.changed ? COLORS.rise : COLORS.ink }}>{p.sug}</span>
              {p.changed && <Badge label="변경 제안" tone="rise" />}
            </div>
          </div>
        ))}
      </div>

      {/* Claude 전략 개선안 */}
      <div style={{ margin: "16px 16px 0", padding: 16, borderRadius: 12, background: `${COLORS.fall}08`, border: `1px solid ${COLORS.fall}30` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.fall }}>3월 Claude 전략 개선안</span>
          <Badge label="승인 대기" tone="gold" />
        </div>
        <span style={{ fontSize: 14, color: COLORS.mid, lineHeight: 1.65 }}>
          RSI 28~30 구간 반등 성공률 74% 집계. 기준값 30→28 조정 시 진입 타이밍 개선. 거래량 기준 200%→180% 완화 시 놓치는 신호 약 12% 감소.
        </span>
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          {!approved ? (
            <>
              <button style={{
                flex: 1, padding: "12px 0", borderRadius: 8,
                border: `1px solid ${COLORS.lineD}`, background: "transparent",
                fontSize: 11, fontWeight: 600, color: COLORS.mid, cursor: "pointer", fontFamily: "inherit",
              }}>거절</button>
              <button onClick={() => setApproved(true)} style={{
                flex: 2, padding: "12px 0", borderRadius: 8,
                border: "none", background: COLORS.ink, color: "#fff",
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>승인 · 파라미터 적용</button>
            </>
          ) : (
            <div style={{ flex: 1, padding: 12, borderRadius: 8, textAlign: "center", background: COLORS.riseL, border: `1px solid ${COLORS.riseB}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.rise }}>✓ 파라미터 업데이트 완료</span>
            </div>
          )}
        </div>
      </div>

      {/* 버전 이력 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>버전 이력</span>
      </div>
      <div style={{ padding: "0 20px 16px" }}>
        {VERSIONS.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderTop: `1px solid ${COLORS.line}` }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{item.v}</span>
              <div style={{ marginTop: 3 }}>
                <span style={{ fontSize: 12, color: COLORS.dim }}>{item.d} · {item.n}</span>
              </div>
            </div>
            <Icon name="cr" size={16} color={COLORS.dim} strokeWidth={1.4} />
          </div>
        ))}
      </div>
    </div>
  );
}
