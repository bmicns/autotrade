// NEXIO 기술지표 분석 엔진 v5
// 12개 지표: RSI, MACD, MA, EMA, BB, 거래량, ADX, StochRSI, OBV, 이격도, VWAP, POC
// 계산 함수는 indicators-calc.ts에서 import

import { detectPatterns, patternBuyScore } from "@/lib/candle-patterns";
import {
  calcRSI,
  calcMACD,
  calcBB,
  calcATR,
  calcADX,
  calcDynamicRisk,
  calcPositionSize,
  calcStochRSI,
  calcOBV,
  calcDisparity,
  calcEMALine,
  sma,
  type DailyCandle,
  type AtrMultipliers,
  DEFAULT_ATR_MULTIPLIERS,
} from "./indicators-calc";

// re-export for external consumers
export type { DailyCandle, AtrMultipliers };
export { calcATR, calcDynamicRisk, calcPositionSize, DEFAULT_ATR_MULTIPLIERS };

// ─── 분봉 캔들 타입 (VWAP/POC용) ─────────────────
export interface MinuteCandle {
  time: string;
  close: number;
  high: number;
  low: number;
  volume: number;
}

function _calcVWAP(candles: MinuteCandle[]): number {
  if (candles.length === 0) return 0;
  let sumPV = 0, sumV = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    sumPV += typical * c.volume;
    sumV  += c.volume;
  }
  return sumV > 0 ? sumPV / sumV : 0;
}

function _calcPOC(candles: MinuteCandle[]): number {
  if (candles.length < 5) return 0;
  const prices = candles.map((c) => c.close);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const range = maxP - minP;
  if (range === 0) return prices[0];
  const raw = range / 20;
  const bucketSize = raw < 50 ? 10 : raw < 200 ? 50 : raw < 1000 ? 100 : raw < 5000 ? 500 : 1000;
  const buckets = new Map<number, number>();
  for (const c of candles) {
    const b = Math.round(c.close / bucketSize) * bucketSize;
    buckets.set(b, (buckets.get(b) ?? 0) + c.volume);
  }
  let maxVol = 0, poc = 0;
  for (const [p, v] of buckets) { if (v > maxVol) { maxVol = v; poc = p; } }
  return poc;
}

export interface IndicatorResult {
  name: string;
  value: string;
  desc: string;
  hit: boolean;
  score: number;
  weight: number;
}

export interface SignalRaw {
  rsi: number;
  macd: number;
  macdSignal: number;
  macdCrossover: string;
  ma5: number;
  ma20: number;
  ema5: number;
  ema20: number;
  bbPosition: string;
  volumeRatio: number;
  atr: number;
  adx: number;
  regime: "trending" | "ranging";
  stochRsiK: number;
  stochRsiD: number;
  obvSlope: number;
  disparity: number;
  patternSellHit: boolean;
  vwap?: number;
  poc?: number;
  vwapSell?: boolean;
  pocSell?: boolean;
}

export interface SignalResult {
  indicators: IndicatorResult[];
  totalScore: number;
  matchCount: number;
  strength: "strong" | "weak" | "none";
  side: "buy" | "sell" | "hold";
  comment: string;
  raw: SignalRaw;
}

// ─── 신호 임계값 타입 ─────────────────────────────
export interface SignalThresholds {
  rsiBuy?: number;
  rsiSell?: number;
  strongScore?: number;
  weakScore?: number;
}

// ─── 내부 유틸: MA 계산 ───────────────────────────
function calcMA(closes: number[]) {
  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const prevCloses5 = closes.slice(0, -1);
  const prevMa5 = sma(prevCloses5, 5);
  const prevMa20 = sma(prevCloses5, 20);
  const crossUp = prevMa5 <= prevMa20 && ma5 > ma20;
  const above = ma5 > ma20;
  return { ma5, ma20, crossUp, above };
}

// ─── 내부 유틸: 거래량 분석 ──────────────────────
function calcVolume(volumes: number[], period = 20) {
  if (volumes.length < period + 1) return { ratio: 100, spike: false };
  const avg = volumes.slice(-period - 1, -1).reduce((s, v) => s + v, 0) / period;
  const current = volumes[volumes.length - 1];
  const ratio = avg > 0 ? (current / avg) * 100 : 100;
  return { ratio, spike: ratio >= 200 };
}

// ─── 가중치 점수제 종합 신호 분석 ────────────────
export function analyzeSignal(candles: DailyCandle[], thresholds?: SignalThresholds, minuteCandles?: MinuteCandle[]): SignalResult {
  const emptyRaw: SignalRaw = {
    rsi: 50, macd: 0, macdSignal: 0, macdCrossover: "none",
    ma5: 0, ma20: 0, ema5: 0, ema20: 0, bbPosition: "middle", volumeRatio: 100,
    atr: 0, adx: 25, regime: "ranging",
    stochRsiK: 50, stochRsiD: 50, obvSlope: 0, disparity: 0,
    patternSellHit: false,
  };

  if (candles.length < 26) {
    return { indicators: [], totalScore: 0, matchCount: 0, strength: "none", side: "hold", comment: "데이터 부족 (최소 26일 필요)", raw: emptyRaw };
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  // 지표 계산
  const rsi = calcRSI(closes);
  const macd = calcMACD(closes);
  const ma = calcMA(closes);
  const emaLine = calcEMALine(closes);
  const bb = calcBB(closes);
  const vol = calcVolume(volumes);
  const atr = calcATR(candles);
  const adx = calcADX(candles);

  // 신규 지표
  const stochRsi = calcStochRSI(candles);
  const obv = calcOBV(candles);
  const disparity = calcDisparity(candles);

  // VWAP + POC (분봉 데이터 있을 때)
  const currentPrice = closes[closes.length - 1];
  const vwap = minuteCandles && minuteCandles.length > 0 ? _calcVWAP(minuteCandles) : 0;
  const poc  = minuteCandles && minuteCandles.length >= 5 ? _calcPOC(minuteCandles) : 0;
  const vwapBuy  = vwap > 0 && currentPrice < vwap * 0.995;
  const vwapSell = vwap > 0 && currentPrice > vwap * 1.005;
  const pocBuy   = poc > 0 && Math.abs(currentPrice - poc) / poc < 0.01;
  const pocSell  = poc > 0 && currentPrice > poc * 1.02;

  // 시장 레짐 감지: ADX > 25 = 추세장
  const regime: "trending" | "ranging" = adx > 25 ? "trending" : "ranging";

  // 레짐별 가중치 (12개 지표 — 합계 120 유지)
  // VWAP는 추세장에서 비중 높임 (모멘텀 확인), POC는 지지선 역할로 동일
  const weights = regime === "trending"
    ? { rsi: 6, macd: 21, ma: 13, ema: 8, bb: 6, vol: 17, pattern: 13, stochRsi: 5, obv: 6, disparity: 4, vwap: 15, poc: 6 }
    : { rsi: 18, macd: 10, ma: 8, ema: 6, bb: 17, vol: 14, pattern: 13, stochRsi: 9, obv: 3, disparity: 4, vwap: 12, poc: 6 };

  // 임계값
  const rsiBuyThreshold  = thresholds?.rsiBuy      ?? 30;
  const rsiSellThreshold = thresholds?.rsiSell     ?? 70;
  const strongScoreThreshold = thresholds?.strongScore ?? 70;
  const weakScoreThreshold   = thresholds?.weakScore   ?? 40;

  // 매수/매도 판정
  const rsiBuy  = rsi < rsiBuyThreshold;
  const rsiSell = rsi > rsiSellThreshold;
  const macdBuy  = macd.crossover === "golden";
  const macdSell = macd.crossover === "dead";
  const maBuy  = ma.crossUp || ma.above;
  const maSell = !ma.above;
  const emaBuy  = emaLine.crossUp || emaLine.above;
  const emaSell = !emaLine.above;
  const bbBuy  = bb.position === "below";
  const bbSell = bb.position === "above";

  // 캔들 패턴
  const patterns = detectPatterns(candles);
  const patternBuyHit  = patternBuyScore(patterns) > 0;
  const patternSellHit = patterns.some((p) => p.type === "bearish");
  const patternDesc    = patterns.length > 0 ? patterns.map((p) => p.nameKo).join(", ") : "패턴 없음";

  // 신규 지표 점수 (+/-는 totalScore에 직접 반영)
  const stochBuy  = stochRsi.k < 20 && stochRsi.d < 20;   // +8점
  const stochSell = stochRsi.k > 80 && stochRsi.d > 80;   // +8점 (매도)
  const obvBuy    = obv.obvSlope > 0;   // +5점
  const obvSell   = obv.obvSlope < 0;   // -5점 (매도)
  const dispBuy   = disparity < -5;     // +7점 (심한 하락 → 반등 가능)
  const dispSell  = disparity > 10;     // -7점 (과열)

  // 점수 계산 (12개 지표 — weights 합계 120)
  const buyScores = [
    { hit: rsiBuy,        w: weights.rsi },
    { hit: macdBuy,       w: weights.macd },
    { hit: maBuy,         w: weights.ma },
    { hit: emaBuy,        w: weights.ema },
    { hit: bbBuy,         w: weights.bb },
    { hit: vol.spike,     w: weights.vol },
    { hit: patternBuyHit, w: weights.pattern },
    { hit: stochBuy,      w: weights.stochRsi },
    { hit: obvBuy,        w: weights.obv },
    { hit: dispBuy,       w: weights.disparity },
    { hit: vwapBuy,       w: weights.vwap },
    { hit: pocBuy,        w: weights.poc },
  ];
  const sellScores = [
    { hit: rsiSell,        w: weights.rsi },
    { hit: macdSell,       w: weights.macd },
    { hit: maSell,         w: weights.ma },
    { hit: emaSell,        w: weights.ema },
    { hit: bbSell,         w: weights.bb },
    { hit: vol.spike,      w: weights.vol },
    { hit: patternSellHit, w: weights.pattern },
    { hit: stochSell,      w: weights.stochRsi },
    { hit: obvSell,        w: weights.obv },
    { hit: dispSell,       w: weights.disparity },
    { hit: vwapSell,       w: weights.vwap },
    { hit: pocSell,        w: weights.poc },
  ];

  const buyTotal  = buyScores.reduce((s, x) => s + (x.hit ? x.w : 0), 0);
  const sellTotal = sellScores.reduce((s, x) => s + (x.hit ? x.w : 0), 0);
  const buyCount  = buyScores.filter((x) => x.hit).length;
  const sellCount = sellScores.filter((x) => x.hit).length;

  const indicators: IndicatorResult[] = [
    { name: "RSI",    value: rsi.toFixed(1),    desc: rsi < rsiBuyThreshold ? "과매도 구간" : rsi > rsiSellThreshold ? "과매수 구간" : "중립 구간", hit: rsiBuy,  score: rsiBuy  ? weights.rsi  : 0, weight: weights.rsi },
    { name: "MACD",   value: macd.crossover === "golden" ? "골든크로스" : macd.crossover === "dead" ? "데드크로스" : "대기", desc: macd.crossover === "golden" ? "추세 상승 전환" : macd.crossover === "dead" ? "추세 하락 전환" : "신호 없음", hit: macdBuy, score: macdBuy ? weights.macd : 0, weight: weights.macd },
    { name: "이동평균", value: ma.above ? "MA5>MA20" : "MA5<MA20", desc: ma.crossUp ? "골든크로스" : ma.above ? "상승 추세" : "하락 추세", hit: maBuy,  score: maBuy  ? weights.ma   : 0, weight: weights.ma },
    { name: "EMA",    value: emaLine.above ? "EMA5>EMA20" : "EMA5<EMA20", desc: emaLine.crossUp ? "EMA 골든크로스" : emaLine.above ? "EMA 상승 추세" : "EMA 하락 추세", hit: emaBuy, score: emaBuy ? weights.ema : 0, weight: weights.ema },
    { name: "볼린저",  value: bb.position === "below" ? "하단 이탈" : bb.position === "above" ? "상단 돌파" : "밴드 내", desc: bb.position === "below" ? "반등 가능성" : bb.position === "above" ? "과열 주의" : "중립", hit: bbBuy,  score: bbBuy  ? weights.bb   : 0, weight: weights.bb },
    { name: "거래량",  value: `${Math.round(vol.ratio)}%`, desc: "20일 평균 대비", hit: vol.spike, score: vol.spike ? weights.vol : 0, weight: weights.vol },
    { name: "캔들패턴", value: patternDesc, desc: patterns.length > 0 ? `${patterns.length}개 감지` : "감지된 패턴 없음", hit: patternBuyHit, score: patternBuyHit ? weights.pattern : 0, weight: weights.pattern },
    { name: "StochRSI", value: `K:${stochRsi.k.toFixed(1)} D:${stochRsi.d.toFixed(1)}`, desc: stochBuy ? "과매도 이중 확인" : stochSell ? "과매수 이중 확인" : "중립", hit: stochBuy, score: stochBuy ? weights.stochRsi : 0, weight: weights.stochRsi },
    { name: "OBV",      value: obv.obvSlope > 0 ? "매집" : obv.obvSlope < 0 ? "분산" : "중립", desc: `기울기 ${obv.obvSlope > 0 ? "+" : ""}${Math.round(obv.obvSlope).toLocaleString()}`, hit: obvBuy, score: obvBuy ? weights.obv : 0, weight: weights.obv },
    { name: "이격도",   value: `${disparity.toFixed(1)}%`, desc: dispBuy ? "과도 하락 (반등 가능)" : dispSell ? "과열 구간" : "정상 범위", hit: dispBuy, score: dispBuy ? weights.disparity : 0, weight: weights.disparity },
    { name: "VWAP",    value: vwap > 0 ? `${Math.round(vwap).toLocaleString()}` : "N/A", desc: vwap > 0 ? (vwapBuy ? `현재가 VWAP 하방 (${((currentPrice/vwap-1)*100).toFixed(1)}%)` : vwapSell ? `현재가 VWAP 상방 (${((currentPrice/vwap-1)*100).toFixed(1)}%)` : "VWAP 근처") : "분봉 데이터 없음", hit: vwapBuy, score: vwapBuy ? weights.vwap : 0, weight: weights.vwap },
    { name: "POC",     value: poc > 0 ? `${Math.round(poc).toLocaleString()}` : "N/A", desc: poc > 0 ? (pocBuy ? `POC 근처 (강한 지지)` : pocSell ? "POC 2% 상방 (과열)" : "POC 범위 외") : "분봉 데이터 없음", hit: pocBuy, score: pocBuy ? weights.poc : 0, weight: weights.poc },
  ];

  // 가중 점수 기반 판단
  let side: "buy" | "sell" | "hold" = "hold";
  let totalScore = 0;
  let matchCount = 0;
  let strength: "strong" | "weak" | "none" = "none";

  if (buyTotal >= sellTotal) {
    totalScore = buyTotal;
    matchCount = buyCount;
    if (buyTotal >= strongScoreThreshold || buyCount >= 4)  { strength = "strong"; side = "buy"; }
    else if (buyTotal >= weakScoreThreshold || buyCount >= 2) { strength = "weak";   side = "buy"; }
  } else {
    totalScore = sellTotal;
    matchCount = sellCount;
    if (sellTotal >= strongScoreThreshold || sellCount >= 4)  { strength = "strong"; side = "sell"; }
    else if (sellTotal >= weakScoreThreshold || sellCount >= 2) { strength = "weak";   side = "sell"; }
  }

  const comment = side === "buy"
    ? `매수 신호 ${matchCount}/9 (${totalScore}점, ${regime === "trending" ? "추세장" : "횡보장"}). ${rsiBuy ? "RSI 과매도. " : ""}${macdBuy ? "MACD 골든크로스. " : ""}${stochBuy ? "StochRSI 과매도. " : ""}${dispBuy ? `이격도 ${disparity.toFixed(1)}%. ` : ""}${patternBuyHit ? patternDesc + ". " : ""}${vol.spike ? "거래량 급증." : ""}`
    : side === "sell"
    ? `매도 신호 ${matchCount}/9 (${totalScore}점). ${rsiSell ? "RSI 과매수. " : ""}${macdSell ? "MACD 데드크로스. " : ""}${stochSell ? "StochRSI 과매수. " : ""}${dispSell ? `이격도 +${disparity.toFixed(1)}%. ` : ""}${patternSellHit ? patternDesc + ". " : ""}`
    : `대기 (${regime === "trending" ? "추세장" : "횡보장"}, ADX ${adx.toFixed(0)}).`;

  const raw: SignalRaw = {
    rsi, macd: macd.macd, macdSignal: macd.signal, macdCrossover: macd.crossover,
    ma5: ma.ma5, ma20: ma.ma20, ema5: emaLine.ema5, ema20: emaLine.ema20,
    bbPosition: bb.position, volumeRatio: vol.ratio,
    atr, adx, regime,
    stochRsiK: stochRsi.k, stochRsiD: stochRsi.d,
    obvSlope: obv.obvSlope,
    disparity,
    patternSellHit,
    vwap,
    poc,
    vwapSell,
    pocSell,
  };

  return { indicators, totalScore, matchCount, strength, side, comment, raw };
}

// ─── 학습된 가중치로 신호 분석 ────────────────────
export function analyzeSignalWithWeights(
  candles: DailyCandle[],
  customWeights?: { trending: Record<string, number>; ranging: Record<string, number> },
  thresholds?: SignalThresholds,
  minuteCandles?: MinuteCandle[]
): SignalResult {
  const result = analyzeSignal(candles, thresholds, minuteCandles);
  if (!customWeights || candles.length < 26) return result;

  const regime = result.raw.regime;
  const w = customWeights[regime];
  if (!w) return result;

  const strongScoreThreshold = thresholds?.strongScore ?? 70;
  const weakScoreThreshold   = thresholds?.weakScore   ?? 40;

  const raw = result.raw;
  const sellConditions: Record<string, boolean> = {
    RSI:    raw.rsi > (thresholds?.rsiSell ?? 70),
    MACD:   raw.macdCrossover === "dead",
    이동평균: raw.ma5 < raw.ma20,
    EMA:    raw.ema5 < raw.ema20,
    볼린저:  raw.bbPosition === "above",
    거래량:  raw.volumeRatio >= 200,
    캔들패턴: raw.patternSellHit,
    StochRSI: raw.stochRsiK > 80 && raw.stochRsiD > 80,
    OBV:    raw.obvSlope < 0,
    이격도:  raw.disparity > 10,
    VWAP:   raw.vwapSell ?? false,
    POC:    raw.pocSell ?? false,
  };

  let buyTotal = 0, sellTotal = 0;
  let buyCount = 0, sellCount = 0;
  for (const ind of result.indicators) {
    const weight = w[ind.name] ?? ind.weight;
    ind.weight = weight;
    ind.score  = ind.hit ? weight : 0;
    if (ind.hit)                      { buyTotal  += weight; buyCount++;  }
    if (sellConditions[ind.name])     { sellTotal += weight; sellCount++; }
  }

  let totalScore: number;
  let strength: "strong" | "weak" | "none" = "none";
  let side: "buy" | "sell" | "hold" = "hold";
  let matchCount: number;

  if (buyTotal >= sellTotal) {
    totalScore = buyTotal; matchCount = buyCount;
    if (buyTotal >= strongScoreThreshold || buyCount >= 4)  { strength = "strong"; side = "buy"; }
    else if (buyTotal >= weakScoreThreshold || buyCount >= 2) { strength = "weak";   side = "buy"; }
  } else {
    totalScore = sellTotal; matchCount = sellCount;
    if (sellTotal >= strongScoreThreshold || sellCount >= 4)  { strength = "strong"; side = "sell"; }
    else if (sellTotal >= weakScoreThreshold || sellCount >= 2) { strength = "weak";   side = "sell"; }
  }

  return { ...result, totalScore, matchCount, strength, side };
}

// ─── 손절/익절/트레일링 스탑 판단 ────────────────
export interface RiskCheckResult {
  action: "stop_loss" | "take_profit" | "trailing_stop" | "hold";
  reason: string;
  currentPnlRate: number;
}

export function checkRisk(
  avgPrice: number,
  currentPrice: number,
  highSinceBuy: number,
  stopLoss: number,
  takeProfit: number,
  trailingStop: number
): RiskCheckResult {
  const pnlRate = ((currentPrice - avgPrice) / avgPrice) * 100;
  const fromHigh = ((currentPrice - highSinceBuy) / highSinceBuy) * 100;

  if (pnlRate <= stopLoss) {
    return { action: "stop_loss", reason: `손절 (${pnlRate.toFixed(1)}% ≤ ${stopLoss.toFixed(1)}%)`, currentPnlRate: pnlRate };
  }
  if (pnlRate >= takeProfit) {
    return { action: "take_profit", reason: `익절 (${pnlRate.toFixed(1)}% ≥ +${takeProfit.toFixed(1)}%)`, currentPnlRate: pnlRate };
  }
  if (pnlRate > 0 && fromHigh <= trailingStop) {
    return { action: "trailing_stop", reason: `트레일링 (고점 대비 ${fromHigh.toFixed(1)}% ≤ ${trailingStop.toFixed(1)}%)`, currentPnlRate: pnlRate };
  }

  return { action: "hold", reason: "보유 유지", currentPnlRate: pnlRate };
}
