"use client";

import { COLORS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";

export function StrategyTab() {
  const kisConnected = useAppStore((s) => s.kisConnected);

  // 엔진에서 사용하는 실제 파라미터 (설정 탭 값 기반)
  const params = [
    { name: "RSI 매수 기준", value: "< 30" },
    { name: "RSI 매도 기준", value: "> 70" },
    { name: "지표 일치 기준 (강한)", value: "4개 이상 / 5개" },
    { name: "지표 일치 기준 (약한)", value: "2~3개 / 5개" },
    { name: "손절 라인", value: "-5%" },
    { name: "1차 익절", value: "+5%" },
    { name: "트레일링 스탑", value: "고점 -3%" },
    { name: "1회 매매 한도", value: "100만원" },
    { name: "1일 최대 횟수", value: "5회" },
  ];

  return (
    <div>
      {/* 현재 전략 파라미터 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>자동매매 전략</span>
      </div>
      <div style={{ padding: "0 20px" }}>
        {params.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderTop: `1px solid ${COLORS.line}` }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink }}>{p.name}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{p.value}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: COLORS.line, marginTop: 8 }} />

      {/* 분석 지표 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>분석 지표 (5종)</span>
      </div>
      <div style={{ padding: "0 20px 16px" }}>
        {["RSI — 과매수·과매도", "MACD — 추세 전환", "이동평균 — 5일/20일 크로스", "볼린저밴드 — 변동성", "거래량 — 20일 평균 대비"].map((ind, i) => (
          <div key={i} style={{ padding: "10px 0", borderTop: i > 0 ? `1px solid ${COLORS.line}` : "none" }}>
            <span style={{ fontSize: 13, color: COLORS.mid }}>{ind}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: COLORS.line }} />

      {/* 엔진 상태 */}
      <div style={{ padding: "20px 20px 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "-0.5px", textTransform: "uppercase" as const }}>엔진 상태</span>
      </div>
      <div style={{ padding: "0 20px 20px" }}>
        <div style={{ padding: "14px 16px", borderRadius: 10, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: kisConnected ? "#22C55E" : COLORS.dim }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
              {kisConnected ? "Vercel Cron 활성 — 평일 09시 자동 실행" : "KIS 미연결 — 엔진 비활성"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
