"use client";

import { useState } from "react";
import { COLORS } from "@/lib/constants";

export interface LearningSnapshot {
  id: string;
  created_at: string;
  sample_size: number;
  confidence: "none" | "low" | "medium" | "high";
  weights_trending: Record<string, number> | null;
  weights_ranging: Record<string, number> | null;
  weights_source: string;
  atr_mult_stop: number;
  atr_mult_profit: number;
  atr_mult_trailing: number;
  atr_source: string;
  target_risk_amount: number;
  take_profit_ratio: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  is_active: boolean;
  expires_at: string;
}

interface LearningSectionProps {
  snapshot: LearningSnapshot | null;
  isExpired: boolean;
  history: LearningSnapshot[];
  abStats?: { avgBase: number; avgLearned: number; sampleSize: number };
}

const CONF_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  none:   { label: "데이터 부족", color: COLORS.dim,   bg: COLORS.sub },
  low:    { label: "낮음",       color: "#92400E",    bg: "#FEF3C7" },
  medium: { label: "보통",       color: "#1D4ED8",    bg: "#DBEAFE" },
  high:   { label: "높음",       color: "#15803D",    bg: "#DCFCE7" },
};

const WEIGHT_NAMES = ["RSI", "MACD", "이동평균", "볼린저", "거래량", "캔들패턴"];
const BASE_WEIGHTS = {
  trending: { RSI: 8, MACD: 26, 이동평균: 22, 볼린저: 8, 거래량: 21, 캔들패턴: 15 },
  ranging:  { RSI: 21, MACD: 13, 이동평균: 13, 볼린저: 21, 거래량: 17, 캔들패턴: 15 },
};

export function LearningSection({ snapshot, isExpired, history, abStats }: LearningSectionProps) {
  const [activeRegime, setActiveRegime] = useState<"trending" | "ranging">("trending");
  const conf = snapshot?.confidence ?? "none";
  const confStyle = CONF_LABELS[conf] ?? CONF_LABELS.none;

  const daysSince = snapshot
    ? Math.floor((Date.now() - new Date(snapshot.created_at).getTime()) / 86400000)
    : null;

  const lastLearnedText = daysSince !== null
    ? daysSince === 0 ? "오늘" : `${daysSince}일 전`
    : "없음";

  return (
    <div>
      {/* ── 헤더 ── */}
      <div style={{ padding: "20px 20px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          자가학습 현황
        </span>
        {snapshot && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: confStyle.bg, color: confStyle.color,
          }}>
            신뢰도 {confStyle.label}
          </span>
        )}
      </div>

      {/* 만료 경고 */}
      {isExpired && snapshot && (
        <div style={{ margin: "0 16px 8px", padding: "8px 12px", borderRadius: 8, background: "#FEF3C7", border: "1px solid #FDE68A" }}>
          <span style={{ fontSize: 11, color: "#92400E", fontWeight: 600 }}>
            ⚠ 학습 데이터 만료됨 ({lastLearnedText}) — 최신 스냅샷으로 폴백 사용 중
          </span>
        </div>
      )}

      {!snapshot ? (
        <div style={{ padding: "20px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: COLORS.dim }}>학습 데이터 없음 (매주 월요일 자동 학습)</span>
        </div>
      ) : (
        <>
          {/* ── 요약 카드 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 16px 16px" }}>
            {[
              { label: "마지막 학습", value: lastLearnedText, sub: `샘플 ${snapshot.sample_size}건` },
              { label: "학습 승률", value: `${snapshot.win_rate?.toFixed(1) ?? "—"}%`, sub: `평균 수익 ${snapshot.avg_win?.toFixed(2) ?? "—"}%` },
              { label: "익절 비율", value: `${snapshot.take_profit_ratio ?? 50}%`, sub: snapshot.atr_source === "learned" ? "학습값" : "기본값" },
            ].map((card, i) => (
              <div key={i} style={{ background: COLORS.sub, borderRadius: 10, padding: "10px 12px", border: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.dim }}>{card.label}</span>
                <div style={{ marginTop: 5 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: COLORS.ink }}>{card.value}</span>
                </div>
                <div style={{ marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>{card.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── ATR 배수 ── */}
          <div style={{ margin: "0 16px 12px", padding: "12px 14px", borderRadius: 10, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim }}>ATR 배수</span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: snapshot.atr_source === "learned" ? "#DBEAFE" : COLORS.sub,
                color: snapshot.atr_source === "learned" ? "#1D4ED8" : COLORS.dim,
                border: `1px solid ${snapshot.atr_source === "learned" ? "#BFDBFE" : COLORS.line}`,
              }}>
                {snapshot.atr_source === "learned" ? "학습값" : "기본값"}
              </span>
            </div>
            {[
              { label: "손절", value: snapshot.atr_mult_stop ?? 2.0, base: 2.0 },
              { label: "익절", value: snapshot.atr_mult_profit ?? 3.0, base: 3.0 },
              { label: "트레일링", value: snapshot.atr_mult_trailing ?? 1.5, base: 1.5 },
            ].map((row) => (
              <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: COLORS.mid, width: 60 }}>{row.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: COLORS.dim }}>기본 {row.base}x</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: row.value !== row.base ? "#1D4ED8" : COLORS.ink }}>
                    → {row.value.toFixed(1)}x
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* ── A/B 비교 카드 ── */}
          {abStats && (
            <div style={{ margin: "0 16px 12px", padding: "12px 14px", borderRadius: 10, background: COLORS.sub, border: `1px solid ${COLORS.line}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim }}>A/B 점수 비교 (최근 {abStats.sampleSize}건)</span>
                {abStats.avgLearned > abStats.avgBase && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#DCFCE7", color: "#15803D", border: "1px solid #BBF7D0" }}>
                    학습값 우세
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "기본 점수 (A)", value: abStats.avgBase, color: COLORS.dim, bg: COLORS.line },
                  { label: "학습 점수 (B)", value: abStats.avgLearned, color: "#1D4ED8", bg: "#DBEAFE" },
                ].map((item) => (
                  <div key={item.label} style={{ padding: "10px 12px", borderRadius: 8, background: item.bg, textAlign: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: item.color, display: "block" }}>{item.label}</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: item.color, fontVariantNumeric: "tabular-nums" }}>{item.value.toFixed(1)}</span>
                    <span style={{ fontSize: 9, color: item.color, display: "block", marginTop: 2 }}>평균 점수</span>
                  </div>
                ))}
              </div>
              {abStats.avgLearned !== abStats.avgBase && (
                <div style={{ marginTop: 8, textAlign: "center" }}>
                  <span style={{ fontSize: 10, color: COLORS.dim }}>
                    학습값이 기본값보다{" "}
                    <span style={{ fontWeight: 700, color: abStats.avgLearned > abStats.avgBase ? "#15803D" : COLORS.rise }}>
                      {Math.abs(abStats.avgLearned - abStats.avgBase).toFixed(1)}점 {abStats.avgLearned > abStats.avgBase ? "높음" : "낮음"}
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── 가중치 바 차트 (trending / ranging 탭) ── */}
          {snapshot.weights_trending && (
            <div style={{ margin: "0 16px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["trending", "ranging"] as const).map((regime) => {
                    const hasData = regime === "trending" ? !!snapshot.weights_trending : !!snapshot.weights_ranging;
                    if (!hasData && regime === "ranging") return null;
                    return (
                      <button
                        key={regime}
                        onClick={() => setActiveRegime(regime)}
                        style={{
                          padding: "3px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                          fontSize: 10, fontWeight: 700, fontFamily: "inherit",
                          background: activeRegime === regime ? COLORS.hero : COLORS.sub,
                          color: activeRegime === regime ? "#fff" : COLORS.dim,
                        }}
                      >
                        {regime === "trending" ? "추세장" : "횡보장"}
                      </button>
                    );
                  })}
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: snapshot.weights_source === "learned" ? "#DCFCE7" : COLORS.sub,
                  color: snapshot.weights_source === "learned" ? "#15803D" : COLORS.dim,
                  border: `1px solid ${snapshot.weights_source === "learned" ? "#BBF7D0" : COLORS.line}`,
                }}>
                  {snapshot.weights_source === "learned" ? "학습값" : "기본값"}
                </span>
              </div>
              {WEIGHT_NAMES.map((name) => {
                const baseMap = BASE_WEIGHTS[activeRegime];
                const base = baseMap[name as keyof typeof baseMap] ?? 0;
                const weightsData = activeRegime === "trending"
                  ? snapshot.weights_trending
                  : (snapshot.weights_ranging ?? snapshot.weights_trending);
                const learned = (weightsData as Record<string, number>)[name] ?? base;
                return (
                  <div key={name} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: COLORS.mid }}>{name}</span>
                      <span style={{ fontSize: 10, color: COLORS.dim }}>기본 {base} → 학습 {learned}</span>
                    </div>
                    <div style={{ display: "flex", gap: 3, height: 6 }}>
                      <div style={{ flex: base, background: COLORS.line, borderRadius: 3 }} />
                      <div style={{ flex: Math.max(learned - base, 0), background: "#1D4ED8", borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 학습 이력 ── */}
          {history.length > 1 && (
            <>
              <div style={{ height: 1, background: COLORS.line }} />
              <div style={{ padding: "16px 20px 8px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.dim }}>학습 이력 (최근 {history.length}회)</span>
              </div>
              <div style={{ margin: "0 16px 16px", borderRadius: 10, border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", background: COLORS.sub, padding: "8px 12px" }}>
                  {["날짜", "샘플", "승률", "신뢰도"].map((h) => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: COLORS.dim }}>{h}</span>
                  ))}
                </div>
                {history.map((h) => {
                  const hConf = CONF_LABELS[h.confidence] ?? CONF_LABELS.none;
                  return (
                    <div key={h.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "8px 12px", borderTop: `1px solid ${COLORS.line}` }}>
                      <span style={{ fontSize: 11, color: COLORS.mid }}>
                        {new Date(h.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                      </span>
                      <span style={{ fontSize: 11, color: COLORS.mid }}>{h.sample_size}건</span>
                      <span style={{ fontSize: 11, color: COLORS.mid }}>{h.win_rate?.toFixed(0) ?? "—"}%</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: hConf.color }}>{hConf.label}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
