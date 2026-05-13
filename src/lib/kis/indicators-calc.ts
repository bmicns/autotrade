// NEXIO 지표 순수 계산 함수 모음
// indicators.ts에서 분리: calcRSI, calcMACD, calcBB, calcATR, calcADX, calcDynamicRisk, calcPositionSize
// 신규 추가: calcStochRSI, calcOBV, calcDisparity

export interface DailyCandle {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

// ─── RSI ─────────────────────────────────────────
export function calcRSI(closes: number[], period = 14): number {
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

// ─── EMA (내부 유틸) ─────────────────────────────
export function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

// ─── EMA 라인 (EMA5/EMA20 크로스 판정) ───────────
export function calcEMALine(closes: number[]): { ema5: number; ema20: number; crossUp: boolean; above: boolean } {
  if (closes.length < 20) {
    const last = closes[closes.length - 1] || 0;
    return { ema5: last, ema20: last, crossUp: false, above: false };
  }
  const e5 = ema(closes, 5);
  const e20 = ema(closes, 20);
  const ema5 = e5[e5.length - 1];
  const ema20 = e20[e20.length - 1];
  const prevEma5 = e5[e5.length - 2];
  const prevEma20 = e20[e20.length - 2];
  return { ema5, ema20, crossUp: prevEma5 <= prevEma20 && ema5 > ema20, above: ema5 > ema20 };
}

// ─── SMA (내부 유틸) ─────────────────────────────
export function sma(data: number[], period: number): number {
  // 데이터 부족 시 마지막 값 반환 — 캔들 초기에 부분 평균보다 안전한 대체값
  if (data.length < period) return data[data.length - 1] || 0;
  const slice = data.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

// ─── MACD ────────────────────────────────────────
export function calcMACD(closes: number[]) {
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

// ─── 볼린저밴드 ──────────────────────────────────
export function calcBB(closes: number[], period = 20, mult = 2) {
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
export function calcADX(candles: DailyCandle[], period = 14): number {
  if (candles.length < period * 2) return 25;
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
  return dxs.slice(-period).reduce((s, v) => s + v, 0) / period;
}

// ─── ATR 배수 인터페이스 ──────────────────────────
export interface AtrMultipliers {
  stop: number;
  trailing: number;
}

export const DEFAULT_ATR_MULTIPLIERS: AtrMultipliers = {
  stop: 2.0,
  trailing: 1.5,
};

// ─── ATR 기반 동적 손절/트레일링 계산 ─────────────
export function calcDynamicRisk(
  atr: number,
  currentPrice: number,
  multipliers: AtrMultipliers = DEFAULT_ATR_MULTIPLIERS
) {
  const stopLossPercent = currentPrice > 0 ? -((atr * multipliers.stop) / currentPrice) * 100 : -5;
  const trailingPercent = currentPrice > 0 ? -((atr * multipliers.trailing) / currentPrice) * 100 : -3;
  return {
    stopLoss: Math.min(stopLossPercent, -2),
    trailingStop: Math.min(trailingPercent, -1.5),
  };
}

// ─── ATR 기반 포지션 사이징 ───────────────────────
export function calcPositionSize(
  atr: number,
  currentPrice: number,
  targetRiskAmount: number,
  maxPerTrade: number,
  stopMultiplier = 2.0
): number {
  if (atr <= 0 || currentPrice <= 0) return maxPerTrade;

  const stopRatio = (atr * stopMultiplier) / currentPrice;
  if (stopRatio <= 0) return maxPerTrade;

  const calculated = targetRiskAmount / stopRatio;
  const capped = Math.min(calculated, maxPerTrade);
  // 최소 1주 매수 가능 금액 보장 (단, maxPerTrade를 초과하지 않음)
  const minForOneShare = Math.min(currentPrice, maxPerTrade);
  return Math.max(Math.floor(capped), minForOneShare);
}

// ─── 스토캐스틱 RSI ───────────────────────────────
// RSI 계산 후 최근 period 내 RSI의 최고/최저로 스토캐스틱 계산
export function calcStochRSI(
  candles: DailyCandle[],
  period = 14,
  smoothK = 3,
  smoothD = 3
): { k: number; d: number } {
  const closes = candles.map((c) => c.close);
  // RSI 시리즈를 rolling 방식으로 계산
  if (closes.length < period * 2 + smoothK + smoothD) return { k: 50, d: 50 };

  const rsiSeries: number[] = [];
  for (let i = period; i < closes.length; i++) {
    rsiSeries.push(calcRSI(closes.slice(0, i + 1), period));
  }

  if (rsiSeries.length < period + smoothK + smoothD) return { k: 50, d: 50 };

  // 스토캐스틱 %K 계산
  const rawK: number[] = [];
  for (let i = period - 1; i < rsiSeries.length; i++) {
    const slice = rsiSeries.slice(i - period + 1, i + 1);
    const lowestRSI = Math.min(...slice);
    const highestRSI = Math.max(...slice);
    const range = highestRSI - lowestRSI;
    rawK.push(range === 0 ? 50 : ((rsiSeries[i] - lowestRSI) / range) * 100);
  }

  if (rawK.length < smoothK + smoothD) return { k: 50, d: 50 };

  // smoothedK = rawK의 이동평균
  const smoothedK: number[] = [];
  for (let i = smoothK - 1; i < rawK.length; i++) {
    const slice = rawK.slice(i - smoothK + 1, i + 1);
    smoothedK.push(slice.reduce((s, v) => s + v, 0) / smoothK);
  }

  if (smoothedK.length < smoothD) return { k: 50, d: 50 };

  // smoothedD = smoothedK의 이동평균
  const dSlice = smoothedK.slice(-smoothD);
  const d = dSlice.reduce((s, v) => s + v, 0) / smoothD;
  const k = smoothedK[smoothedK.length - 1];

  return { k, d };
}

// ─── OBV (On-Balance Volume) ─────────────────────
// 종가 상승 시 거래량 더하기, 하락 시 빼기
// obvSlope: 최근 5봉 OBV 기울기 (양수=매집, 음수=분산)
export function calcOBV(candles: DailyCandle[]): { obv: number; obvSlope: number } {
  if (candles.length < 2) return { obv: 0, obvSlope: 0 };

  const obvSeries: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const prev = obvSeries[i - 1];
    if (candles[i].close > candles[i - 1].close) {
      obvSeries.push(prev + candles[i].volume);
    } else if (candles[i].close < candles[i - 1].close) {
      obvSeries.push(prev - candles[i].volume);
    } else {
      obvSeries.push(prev);
    }
  }

  const obv = obvSeries[obvSeries.length - 1];

  // 최근 5봉 선형 기울기
  const slopeWindow = Math.min(5, obvSeries.length);
  const recent = obvSeries.slice(-slopeWindow);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const obvSlope = slopeWindow > 1 ? (last - first) / (slopeWindow - 1) : 0;

  return { obv, obvSlope };
}

// ─── 이격도 (MA20 괴리율) ─────────────────────────
// (현재가 - MA20) / MA20 * 100
// 양수: 과열, 음수: 과도 하락
export function calcDisparity(candles: DailyCandle[], period = 20): number {
  if (candles.length < period) return 0;
  const closes = candles.map((c) => c.close);
  const ma20 = sma(closes, period);
  if (ma20 === 0) return 0;
  const current = closes[closes.length - 1];
  return ((current - ma20) / ma20) * 100;
}
