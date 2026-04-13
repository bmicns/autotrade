// NEXIO 기술지표 분석 엔진 v3
// 7개 지표: RSI, MACD, 이동평균, 볼린저밴드, 거래량, ADX + 캔들패턴
// 가중치 점수제 + 시장 레짐 감지 + 캔들 패턴 분석

import { detectPatterns, patternBuyScore } from "@/lib/candle-patterns";

export interface DailyCandle {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

export interface IndicatorResult {
  name: string;
  value: string;
  desc: string;
  hit: boolean;
  score: number;      // 0~100 가중 점수
  weight: number;     // 적용된 가중치
}

export interface SignalRaw {
  rsi: number;
  macd: number;
  macdSignal: number;
  macdCrossover: string;
  ma5: number;
  ma20: number;
  bbPosition: string;
  volumeRatio: number;
  atr: number;
  adx: number;
  regime: "trending" | "ranging";
}

export interface SignalResult {
  indicators: IndicatorResult[];
  totalScore: number;        // 가중 합산 점수 (0~100)
  matchCount: number;
  strength: "strong" | "weak" | "none";
  side: "buy" | "sell" | "hold";
  comment: string;
  raw: SignalRaw;
}

// ─── RSI ─────────────────────────────────────────
function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// ─── MACD ────────────────────────────────────────
function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcMACD(closes: number[]) {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0, crossover: "none" as const };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine.slice(-9), 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const prevMacd = macdLine[macdLine.length - 2];
  const prevSignal = signalLine.length >= 2 ? signalLine[signalLine.length - 2] : signal;

  let crossover: "golden" | "dead" | "none" = "none";
  if (prevMacd <= prevSignal && macd > signal) crossover = "golden";
  if (prevMacd >= prevSignal && macd < signal) crossover = "dead";

  return { macd, signal, histogram: macd - signal, crossover };
}

// ─── SMA ─────────────────────────────────────────
function sma(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  const slice = data.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

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

// ─── 볼린저밴드 ──────────────────────────────────
function calcBollinger(closes: number[], period = 20, mult = 2) {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0, position: "middle" as const };
  const slice = closes.slice(-period);
  const middle = slice.reduce((s, v) => s + v, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period);
  const upper = middle + mult * std;
  const lower = middle - mult * std;
  const current = closes[closes.length - 1];

  let position: "below" | "above" | "middle" = "middle";
  if (current <= lower) position = "below";
  if (current >= upper) position = "above";

  return { upper, middle, lower, position };
}

// ─── 거래량 분석 ─────────────────────────────────
function calcVolume(volumes: number[], period = 20) {
  if (volumes.length < period + 1) return { ratio: 100, spike: false };
  const avg = volumes.slice(-period - 1, -1).reduce((s, v) => s + v, 0) / period;
  const current = volumes[volumes.length - 1];
  const ratio = avg > 0 ? (current / avg) * 100 : 100;
  return { ratio, spike: ratio >= 200 };
}

// ─── ATR (Average True Range) ────────────────────
export function calcATR(candles: DailyCandle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

// ─── ADX (Average Directional Index) ─────────────
function calcADX(candles: DailyCandle[], period = 14): number {
  if (candles.length < period * 2) return 25; // 기본값 (중립)
  const pDMs: number[] = [], nDMs: number[] = [], trs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    pDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    nDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    ));
  }

  // Smoothed averages
  const smooth = (arr: number[]) => {
    const result = [arr.slice(0, period).reduce((s, v) => s + v, 0)];
    for (let i = period; i < arr.length; i++) {
      result.push(result[result.length - 1] - result[result.length - 1] / period + arr[i]);
    }
    return result;
  };

  const sTR = smooth(trs);
  const sPDM = smooth(pDMs);
  const sNDM = smooth(nDMs);

  const dxs: number[] = [];
  for (let i = 0; i < sTR.length; i++) {
    if (sTR[i] === 0) continue;
    const pDI = (sPDM[i] / sTR[i]) * 100;
    const nDI = (sNDM[i] / sTR[i]) * 100;
    const sum = pDI + nDI;
    if (sum > 0) dxs.push((Math.abs(pDI - nDI) / sum) * 100);
  }

  if (dxs.length < period) return 25;
  const adx = dxs.slice(-period).reduce((s, v) => s + v, 0) / period;
  return adx;
}

// ─── 가중치 점수제 종합 신호 분석 ────────────────
export function analyzeSignal(candles: DailyCandle[]): SignalResult {
  const emptyRaw: SignalRaw = { rsi: 50, macd: 0, macdSignal: 0, macdCrossover: "none", ma5: 0, ma20: 0, bbPosition: "middle", volumeRatio: 100, atr: 0, adx: 25, regime: "ranging" };

  if (candles.length < 26) {
    return { indicators: [], totalScore: 0, matchCount: 0, strength: "none", side: "hold", comment: "데이터 부족 (최소 26일 필요)", raw: emptyRaw };
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  // 지표 계산
  const rsi = calcRSI(closes);
  const macd = calcMACD(closes);
  const ma = calcMA(closes);
  const bb = calcBollinger(closes);
  const vol = calcVolume(volumes);
  const atr = calcATR(candles);
  const adx = calcADX(candles);

  // 시장 레짐 감지: ADX > 25 = 추세장, ≤ 25 = 횡보장
  const regime: "trending" | "ranging" = adx > 25 ? "trending" : "ranging";

  // ── #4 가중치: 레짐에 따라 차등 + 캔들 패턴 ──
  // 기술지표 85점 + 캔들패턴 15점 = 100점
  const weights = regime === "trending"
    ? { rsi: 8, macd: 26, ma: 22, bb: 8, vol: 21, pattern: 15 }
    : { rsi: 21, macd: 13, ma: 13, bb: 21, vol: 17, pattern: 15 };

  // 매수/매도 판정
  const rsiBuy = rsi < 30, rsiSell = rsi > 70;
  const macdBuy = macd.crossover === "golden", macdSell = macd.crossover === "dead";
  const maBuy = ma.crossUp || ma.above, maSell = !ma.above;
  const bbBuy = bb.position === "below", bbSell = bb.position === "above";

  // 캔들 패턴 감지
  const patterns = detectPatterns(candles);
  const patternBuyHit = patternBuyScore(patterns) > 0;
  const patternDesc = patterns.length > 0 ? patterns.map((p) => p.nameKo).join(", ") : "패턴 없음";

  // 점수 계산 (hit이면 해당 가중치 점수 부여)
  const buyScores = [
    { hit: rsiBuy, w: weights.rsi },
    { hit: macdBuy, w: weights.macd },
    { hit: maBuy, w: weights.ma },
    { hit: bbBuy, w: weights.bb },
    { hit: vol.spike, w: weights.vol },
    { hit: patternBuyHit, w: weights.pattern },
  ];
  const patternSellHit = patterns.some((p) => p.type === "bearish");
  const sellScores = [
    { hit: rsiSell, w: weights.rsi },
    { hit: macdSell, w: weights.macd },
    { hit: maSell, w: weights.ma },
    { hit: bbSell, w: weights.bb },
    { hit: vol.spike, w: weights.vol },
    { hit: patternSellHit, w: weights.pattern },
  ];

  const buyTotal = buyScores.reduce((s, x) => s + (x.hit ? x.w : 0), 0);
  const sellTotal = sellScores.reduce((s, x) => s + (x.hit ? x.w : 0), 0);
  const buyCount = buyScores.filter((x) => x.hit).length;
  const sellCount = sellScores.filter((x) => x.hit).length;

  const indicators: IndicatorResult[] = [
    { name: "RSI", value: rsi.toFixed(1), desc: rsi < 30 ? "과매도 구간" : rsi > 70 ? "과매수 구간" : "중립 구간", hit: rsiBuy, score: rsiBuy ? weights.rsi : 0, weight: weights.rsi },
    { name: "MACD", value: macd.crossover === "golden" ? "골든크로스" : macd.crossover === "dead" ? "데드크로스" : "대기", desc: macd.crossover === "golden" ? "추세 상승 전환" : macd.crossover === "dead" ? "추세 하락 전환" : "신호 없음", hit: macdBuy, score: macdBuy ? weights.macd : 0, weight: weights.macd },
    { name: "이동평균", value: ma.above ? "5일>20일" : "5일<20일", desc: ma.crossUp ? "돌파 확인" : ma.above ? "상승 추세" : "하락 추세", hit: maBuy, score: maBuy ? weights.ma : 0, weight: weights.ma },
    { name: "볼린저", value: bb.position === "below" ? "하단 이탈" : bb.position === "above" ? "상단 돌파" : "밴드 내", desc: bb.position === "below" ? "반등 가능성" : bb.position === "above" ? "과열 주의" : "중립", hit: bbBuy, score: bbBuy ? weights.bb : 0, weight: weights.bb },
    { name: "거래량", value: `${Math.round(vol.ratio)}%`, desc: "20일 평균 대비", hit: vol.spike, score: vol.spike ? weights.vol : 0, weight: weights.vol },
    { name: "캔들패턴", value: patternDesc, desc: patterns.length > 0 ? `${patterns.length}개 감지` : "감지된 패턴 없음", hit: patternBuyHit, score: patternBuyHit ? weights.pattern : 0, weight: weights.pattern },
  ];

  // 가중 점수 기반 판단 (기존 다수결도 병행)
  let side: "buy" | "sell" | "hold" = "hold";
  let totalScore = 0;
  let matchCount = 0;
  let strength: "strong" | "weak" | "none" = "none";

  if (buyTotal >= sellTotal) {
    totalScore = buyTotal;
    matchCount = buyCount;
    // 강한: 70점 이상 OR 4개 이상 / 약한: 40점 이상 OR 2개 이상
    if (buyTotal >= 70 || buyCount >= 4) { strength = "strong"; side = "buy"; }
    else if (buyTotal >= 40 || buyCount >= 2) { strength = "weak"; side = "buy"; }
  } else {
    totalScore = sellTotal;
    matchCount = sellCount;
    if (sellTotal >= 70 || sellCount >= 4) { strength = "strong"; side = "sell"; }
    else if (sellTotal >= 40 || sellCount >= 2) { strength = "weak"; side = "sell"; }
  }

  const comment = side === "buy"
    ? `매수 신호 ${matchCount}/6 (${totalScore}점, ${regime === "trending" ? "추세장" : "횡보장"}). ${rsiBuy ? "RSI 과매도. " : ""}${macdBuy ? "MACD 골든크로스. " : ""}${patternBuyHit ? patternDesc + ". " : ""}${vol.spike ? "거래량 급증." : ""}`
    : side === "sell"
    ? `매도 신호 ${matchCount}/6 (${totalScore}점). ${rsiSell ? "RSI 과매수. " : ""}${macdSell ? "MACD 데드크로스. " : ""}${patternSellHit ? patternDesc + ". " : ""}`
    : `대기 (${regime === "trending" ? "추세장" : "횡보장"}, ADX ${adx.toFixed(0)}).`;

  const raw: SignalRaw = {
    rsi, macd: macd.macd, macdSignal: macd.signal, macdCrossover: macd.crossover,
    ma5: ma.ma5, ma20: ma.ma20, bbPosition: bb.position, volumeRatio: vol.ratio, atr, adx, regime,
  };

  return { indicators, totalScore, matchCount, strength, side, comment, raw };
}

// ─── 학습된 가중치로 신호 분석 ────────────────────
export function analyzeSignalWithWeights(candles: DailyCandle[], customWeights?: { trending: Record<string, number>; ranging: Record<string, number> }): SignalResult {
  const result = analyzeSignal(candles);
  if (!customWeights || candles.length < 26) return result;

  const regime = result.raw.regime;
  const w = customWeights[regime];
  if (!w) return result;

  // 커스텀 가중치로 매수/매도 점수 독립 재계산
  // indicators 배열의 hit은 매수 기준이므로, 매도는 원본 raw 데이터로 판정
  const raw = result.raw;
  const sellConditions: Record<string, boolean> = {
    RSI: raw.rsi > 70,
    MACD: raw.macdCrossover === "dead",
    이동평균: raw.ma5 < raw.ma20,
    볼린저: raw.bbPosition === "above",
    거래량: raw.volumeRatio >= 200,
    캔들패턴: result.indicators.find((i) => i.name === "캔들패턴")?.value.includes("하락") ?? false,
  };

  let buyTotal = 0, sellTotal = 0;
  let buyCount = 0, sellCount = 0;
  for (const ind of result.indicators) {
    const weight = w[ind.name] ?? ind.weight;
    ind.weight = weight;
    ind.score = ind.hit ? weight : 0;
    if (ind.hit) { buyTotal += weight; buyCount++; }
    if (sellConditions[ind.name]) { sellTotal += weight; sellCount++; }
  }

  let totalScore: number;
  let strength: "strong" | "weak" | "none" = "none";
  let side: "buy" | "sell" | "hold" = "hold";
  let matchCount: number;

  if (buyTotal >= sellTotal) {
    totalScore = buyTotal;
    matchCount = buyCount;
    if (buyTotal >= 70 || buyCount >= 4) { strength = "strong"; side = "buy"; }
    else if (buyTotal >= 40 || buyCount >= 2) { strength = "weak"; side = "buy"; }
  } else {
    totalScore = sellTotal;
    matchCount = sellCount;
    if (sellTotal >= 70 || sellCount >= 4) { strength = "strong"; side = "sell"; }
    else if (sellTotal >= 40 || sellCount >= 2) { strength = "weak"; side = "sell"; }
  }

  return { ...result, totalScore, matchCount, strength, side };
}

// ─── ATR 배수 인터페이스 ──────────────────────────
export interface AtrMultipliers {
  stop: number;       // 기본 2.0
  profit: number;     // 기본 3.0
  trailing: number;   // 기본 1.5
}

export const DEFAULT_ATR_MULTIPLIERS: AtrMultipliers = {
  stop: 2.0,
  profit: 3.0,
  trailing: 1.5,
};

// ─── ATR 기반 동적 손절/익절 계산 ─────────────────
export function calcDynamicRisk(
  atr: number,
  currentPrice: number,
  multipliers: AtrMultipliers = DEFAULT_ATR_MULTIPLIERS
) {
  const stopLossPercent = currentPrice > 0 ? -((atr * multipliers.stop) / currentPrice) * 100 : -5;
  const takeProfitPercent = currentPrice > 0 ? ((atr * multipliers.profit) / currentPrice) * 100 : 5;
  const trailingPercent = currentPrice > 0 ? -((atr * multipliers.trailing) / currentPrice) * 100 : -3;
  return {
    stopLoss: Math.min(stopLossPercent, -2),       // 최소 -2%
    takeProfit: Math.max(takeProfitPercent, 3),     // 최소 +3%
    trailingStop: Math.min(trailingPercent, -1.5),  // 최소 -1.5%
  };
}

// ─── ATR 기반 포지션 사이징 ───────────────────────
// 목표 손실 금액 / 손절 폭 비율 = 투자 금액 (변동성 역비례)
export function calcPositionSize(
  atr: number,
  currentPrice: number,
  targetRiskAmount: number,   // 원 (기본 30000)
  maxPerTrade: number,        // 원 상한선 (기본 1000000)
  stopMultiplier = 2.0
): number {
  if (atr <= 0 || currentPrice <= 0) return maxPerTrade;

  const stopRatio = (atr * stopMultiplier) / currentPrice;
  if (stopRatio <= 0) return maxPerTrade;

  const calculated = targetRiskAmount / stopRatio;
  const capped = Math.min(calculated, maxPerTrade);

  // 최소 1주 금액 보장
  return Math.max(Math.floor(capped), currentPrice);
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
