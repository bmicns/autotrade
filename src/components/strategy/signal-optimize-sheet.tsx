"use client";

import { COLORS } from "@/lib/constants";
import { SignalThresholds } from "./signal-edit-sheet";

export interface OptimizeResult {
  sampleSize: number;
  current:     SignalThresholds;
  recommended: SignalThresholds;
  analysis: {
    rsiBuyWinRate:        number;
    strongScoreWinRate:   number;
    rsiBuySharpe?:        number;
    strongScoreSharpe?:   number;
    rsiBuyComposite?:     number;
    strongScoreComposite?: number;
    weakOffset?:          number;
  };
}

const LABELS: Record<keyof SignalThresholds, string> = {
  rsiBuy:      "RSI 매수",
  rsiSell:     "RSI 매도",
  strongScore: "강한 신호",
  weakScore:   "약한 신호",
};

interface Props {
  result:  OptimizeResult;
  onApply: (recommended: SignalThresholds) => void;
  onClose: () => void;
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display: "inline-flex", flexDirection: "column", alignItems: "center",
      padding: "6px 10px", borderRadius: 8,
      background: accent ? `${COLORS.rise}18` : COLORS.sub,
      border: `1px solid ${accent ? COLORS.riseB : COLORS.line}`,
    }}>
      <span style={{ fontSize: 9, color: COLORS.dim, marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: accent ? COLORS.rise : COLORS.ink }}>{value}</span>
    </div>
  );
}

export function SignalOptimizeSheet({ result, onApply, onClose }: Props) {
  const keys = Object.keys(LABELS) as (keyof SignalThresholds)[];
  const { sampleSize, current, recommended, analysis } = result;

  const fmt  = (v?: number) => v === undefined ? "—" : v.toFixed(2);
  const fmtPct = (v?: number) => v === undefined ? "—" : `${(v * 100).toFixed(0)}%`;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 998 }}
      />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
        background: COLORS.bg, borderRadius: "20px 20px 0 0",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
        padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.line, margin: "0 auto 16px" }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>자동 최적화 결과</div>
        <div style={{ fontSize: 12, color: COLORS.dim, marginBottom: 12 }}>
          샘플 {sampleSize}건 분석 · 승률 40% + 수익률 35% + 샤프 25% 복합 스코어
        </div>

        {/* 분석 지표 Pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 16 }}>
          <StatPill label="RSI 매수 승률"    value={fmtPct(analysis.rsiBuyWinRate)}        accent={analysis.rsiBuyWinRate > 0.5} />
          <StatPill label="강한신호 승률"    value={fmtPct(analysis.strongScoreWinRate)}    accent={analysis.strongScoreWinRate > 0.5} />
          <StatPill label="RSI 샤프"         value={fmt(analysis.rsiBuySharpe)} />
          <StatPill label="강한신호 샤프"    value={fmt(analysis.strongScoreSharpe)} />
          <StatPill label="RSI 복합스코어"   value={fmt(analysis.rsiBuyComposite)} />
          <StatPill label="신호 복합스코어"  value={fmt(analysis.strongScoreComposite)} />
          {analysis.weakOffset !== undefined && (
            <StatPill label="약한신호 간격"  value={`-${analysis.weakOffset}`} />
          )}
        </div>

        {/* 현재값 vs 추천값 비교 */}
        <div style={{
          borderRadius: 12, border: `1px solid ${COLORS.line}`,
          overflow: "hidden", marginBottom: 20,
        }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            background: COLORS.sub, padding: "10px 14px",
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim }}>항목</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim, textAlign: "center" }}>현재</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.rise, textAlign: "center" }}>추천</span>
          </div>

          {keys.map((k, i) => {
            const changed = current[k] !== recommended[k];
            return (
              <div key={k} style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                padding: "12px 14px",
                borderTop: `1px solid ${COLORS.line}`,
                background: i % 2 === 0 ? COLORS.bg : COLORS.sub,
              }}>
                <span style={{ fontSize: 13, color: COLORS.ink }}>{LABELS[k]}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.mid, textAlign: "center" }}>
                  {current[k]}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700, textAlign: "center",
                  color: changed ? COLORS.rise : COLORS.mid,
                }}>
                  {recommended[k]}{changed ? " ✓" : ""}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "14px 0", borderRadius: 12, border: `1.5px solid ${COLORS.line}`,
            background: "transparent", color: COLORS.mid, fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>취소</button>
          <button onClick={() => onApply(recommended)} style={{
            flex: 2, padding: "14px 0", borderRadius: 12, border: "none",
            background: COLORS.ink, color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}>추천값 적용</button>
        </div>
      </div>
    </>
  );
}
