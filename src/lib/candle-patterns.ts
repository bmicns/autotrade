/**
 * 캔들 패턴 감지 — 12가지 핵심 패턴
 * 반전 상승(4) + 반전 하락(4) + 중립/확인(4)
 */

import type { DailyCandle } from "@/lib/kis/indicators";

export interface CandlePattern {
  name: string;
  nameKo: string;
  type: "bullish" | "bearish" | "neutral";
  reliability: number; // 1~3 (높을수록 신뢰)
  score: number; // 매매 점수 기여 (-15 ~ +15)
}

// ─── 유틸 ──────────────────────────────────────

function body(c: DailyCandle) { return Math.abs(c.close - c.open); }
function upperShadow(c: DailyCandle) { return c.high - Math.max(c.open, c.close); }
function lowerShadow(c: DailyCandle) { return Math.min(c.open, c.close) - c.low; }
function range(c: DailyCandle) { return c.high - c.low || 0.01; }
function isBullish(c: DailyCandle) { return c.close > c.open; }
function isBearish(c: DailyCandle) { return c.close < c.open; }
function bodyRatio(c: DailyCandle) { return body(c) / range(c); }

// 최근 N일 평균 몸통 크기
function avgBody(candles: DailyCandle[], n: number) {
  const slice = candles.slice(-n);
  return slice.reduce((s, c) => s + body(c), 0) / slice.length;
}

// ─── 패턴 감지 ─────────────────────────────────

/** 전체 패턴 감지 (최근 3개 캔들 기준) */
export function detectPatterns(candles: DailyCandle[]): CandlePattern[] {
  if (candles.length < 5) return [];

  const patterns: CandlePattern[] = [];
  const c = candles[candles.length - 1]; // 현재
  const p = candles[candles.length - 2]; // 이전
  const pp = candles[candles.length - 3]; // 2일전
  const avg = avgBody(candles.slice(-20), 20);

  // ── 반전 상승 패턴 ──

  // 1. 망치형 (Hammer): 하락 추세 후, 하단 꼬리 ≥ 몸통×2, 상단 꼬리 작음
  if (
    isBearish(p) &&
    lowerShadow(c) >= body(c) * 2 &&
    upperShadow(c) <= body(c) * 0.5 &&
    body(c) > 0
  ) {
    patterns.push({ name: "Hammer", nameKo: "망치형", type: "bullish", reliability: 2, score: 10 });
  }

  // 2. 불리시 장악형 (Bullish Engulfing): 음봉 후 양봉이 완전 감싸기
  if (
    isBearish(p) && isBullish(c) &&
    c.open <= p.close && c.close >= p.open &&
    body(c) > body(p) * 1.1
  ) {
    patterns.push({ name: "Bullish Engulfing", nameKo: "상승 장악형", type: "bullish", reliability: 3, score: 15 });
  }

  // 3. 모닝스타 (Morning Star): 음봉→소형→양봉
  if (
    isBearish(pp) && body(pp) > avg * 0.8 &&
    body(p) < avg * 0.3 &&
    isBullish(c) && body(c) > avg * 0.8 &&
    c.close > (pp.open + pp.close) / 2
  ) {
    patterns.push({ name: "Morning Star", nameKo: "모닝스타", type: "bullish", reliability: 3, score: 15 });
  }

  // 4. 관통형 (Piercing): 음봉 후 양봉이 50% 이상 관통
  if (
    isBearish(p) && isBullish(c) &&
    c.open < p.low &&
    c.close > (p.open + p.close) / 2 &&
    c.close < p.open
  ) {
    patterns.push({ name: "Piercing", nameKo: "관통형", type: "bullish", reliability: 2, score: 10 });
  }

  // ── 반전 하락 패턴 ──

  // 5. 교수형 (Hanging Man): 상승 추세 후 망치형 모양
  if (
    isBullish(p) &&
    lowerShadow(c) >= body(c) * 2 &&
    upperShadow(c) <= body(c) * 0.5 &&
    body(c) > 0
  ) {
    patterns.push({ name: "Hanging Man", nameKo: "교수형", type: "bearish", reliability: 2, score: -10 });
  }

  // 6. 베어리시 장악형 (Bearish Engulfing)
  if (
    isBullish(p) && isBearish(c) &&
    c.open >= p.close && c.close <= p.open &&
    body(c) > body(p) * 1.1
  ) {
    patterns.push({ name: "Bearish Engulfing", nameKo: "하락 장악형", type: "bearish", reliability: 3, score: -15 });
  }

  // 7. 이브닝스타 (Evening Star): 양봉→소형→음봉
  if (
    isBullish(pp) && body(pp) > avg * 0.8 &&
    body(p) < avg * 0.3 &&
    isBearish(c) && body(c) > avg * 0.8 &&
    c.close < (pp.open + pp.close) / 2
  ) {
    patterns.push({ name: "Evening Star", nameKo: "이브닝스타", type: "bearish", reliability: 3, score: -15 });
  }

  // 8. 먹구름형 (Dark Cloud Cover)
  if (
    isBullish(p) && isBearish(c) &&
    c.open > p.high &&
    c.close < (p.open + p.close) / 2 &&
    c.close > p.open
  ) {
    patterns.push({ name: "Dark Cloud Cover", nameKo: "먹구름형", type: "bearish", reliability: 2, score: -10 });
  }

  // ── 중립/확인 패턴 ──

  // 9. 도지 (Doji): 몸통이 전체 범위의 5% 이하
  if (bodyRatio(c) <= 0.05 && range(c) > 0) {
    // 십자도지: 양쪽 꼬리가 모두 길면
    if (upperShadow(c) > range(c) * 0.3 && lowerShadow(c) > range(c) * 0.3) {
      patterns.push({ name: "Long-legged Doji", nameKo: "십자도지", type: "neutral", reliability: 2, score: 0 });
    } else {
      patterns.push({ name: "Doji", nameKo: "도지", type: "neutral", reliability: 1, score: 0 });
    }
  }

  // 10. 팽이형 (Spinning Top): 작은 몸통 + 양쪽 꼬리
  if (
    bodyRatio(c) > 0.05 && bodyRatio(c) < 0.3 &&
    upperShadow(c) > body(c) && lowerShadow(c) > body(c)
  ) {
    patterns.push({ name: "Spinning Top", nameKo: "팽이형", type: "neutral", reliability: 1, score: 0 });
  }

  // 11. 양봉 마루보주 (Bullish Marubozu): 꼬리 거의 없는 강한 양봉
  if (
    isBullish(c) && bodyRatio(c) > 0.85 && body(c) > avg * 1.2
  ) {
    patterns.push({ name: "Bullish Marubozu", nameKo: "양봉 마루보주", type: "bullish", reliability: 2, score: 8 });
  }

  // 12. 음봉 마루보주 (Bearish Marubozu)
  if (
    isBearish(c) && bodyRatio(c) > 0.85 && body(c) > avg * 1.2
  ) {
    patterns.push({ name: "Bearish Marubozu", nameKo: "음봉 마루보주", type: "bearish", reliability: 2, score: -8 });
  }

  return patterns;
}

/** 캔들 패턴 점수 합산 (매수 신호용) */
export function patternBuyScore(patterns: CandlePattern[]): number {
  return patterns.reduce((sum, p) => sum + Math.max(0, p.score), 0);
}

/** 캔들 패턴 점수 합산 (매도 신호용) */
export function patternSellScore(patterns: CandlePattern[]): number {
  return patterns.reduce((sum, p) => sum + Math.min(0, p.score), 0);
}
