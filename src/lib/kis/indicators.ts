// NEXIO 기술지표 분석 엔진
// 기획서 기준 5개 지표: RSI, MACD, 이동평균, 볼린저밴드, 거래량

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
  hit: boolean; // 매수 신호 충족 여부
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
}

export interface SignalResult {
  indicators: IndicatorResult[];
  matchCount: number;      // 충족 지표 수
  strength: "strong" | "weak" | "none";  // 강한(4+) / 약한(2-3) / 없음(0-1)
  side: "buy" | "sell" | "hold";
  comment: string;
  raw: SignalRaw;          // 지표 원시값 (성과 분석용)
}

// ─── RSI (Relative Strength Index) ──────────────────
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
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ─── MACD ───────────────────────────────────────────
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

// ─── 이동평균 (MA Crossover) ────────────────────────
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

// ─── 볼린저밴드 ─────────────────────────────────────
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

// ─── 거래량 분석 ────────────────────────────────────
function calcVolume(volumes: number[], period = 20) {
  if (volumes.length < period + 1) return { ratio: 100, spike: false };
  const avg = volumes.slice(-period - 1, -1).reduce((s, v) => s + v, 0) / period;
  const current = volumes[volumes.length - 1];
  const ratio = avg > 0 ? (current / avg) * 100 : 100;
  return { ratio, spike: ratio >= 200 };
}

// ─── 종합 신호 분석 ────────────────────────────────
export function analyzeSignal(candles: DailyCandle[]): SignalResult {
  if (candles.length < 26) {
    return {
      indicators: [],
      matchCount: 0,
      strength: "none",
      side: "hold",
      comment: "데이터 부족 (최소 26일 필요)",
      raw: { rsi: 50, macd: 0, macdSignal: 0, macdCrossover: "none", ma5: 0, ma20: 0, bbPosition: "middle", volumeRatio: 100, atr: 0 },
    };
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const current = closes[closes.length - 1];

  // 1. RSI
  const rsi = calcRSI(closes);
  const rsiBuy = rsi < 30;
  const rsiSell = rsi > 70;

  // 2. MACD
  const macd = calcMACD(closes);
  const macdBuy = macd.crossover === "golden";
  const macdSell = macd.crossover === "dead";

  // 3. 이동평균
  const ma = calcMA(closes);
  const maBuy = ma.crossUp || ma.above;
  const maSell = !ma.above;

  // 4. 볼린저밴드
  const bb = calcBollinger(closes);
  const bbBuy = bb.position === "below";
  const bbSell = bb.position === "above";

  // 5. 거래량
  const vol = calcVolume(volumes);

  // 매수 신호 집계
  const buySignals = [rsiBuy, macdBuy, maBuy, bbBuy, vol.spike];
  const sellSignals = [rsiSell, macdSell, maSell, bbSell, vol.spike];
  const buyCount = buySignals.filter(Boolean).length;
  const sellCount = sellSignals.filter(Boolean).length;

  const indicators: IndicatorResult[] = [
    {
      name: "RSI",
      value: rsi.toFixed(1),
      desc: rsi < 30 ? "과매도 구간" : rsi > 70 ? "과매수 구간" : "중립 구간",
      hit: rsiBuy,
    },
    {
      name: "MACD",
      value: macd.crossover === "golden" ? "골든크로스" : macd.crossover === "dead" ? "데드크로스" : "대기",
      desc: macd.crossover === "golden" ? "추세 상승 전환" : macd.crossover === "dead" ? "추세 하락 전환" : "신호 없음",
      hit: macdBuy,
    },
    {
      name: "이동평균",
      value: ma.above ? "5일>20일" : "5일<20일",
      desc: ma.crossUp ? "돌파 확인" : ma.above ? "상승 추세" : "하락 추세",
      hit: maBuy,
    },
    {
      name: "볼린저",
      value: bb.position === "below" ? "하단 이탈" : bb.position === "above" ? "상단 돌파" : "밴드 내",
      desc: bb.position === "below" ? "반등 가능성" : bb.position === "above" ? "과열 주의" : "중립",
      hit: bbBuy,
    },
    {
      name: "거래량",
      value: `${Math.round(vol.ratio)}%`,
      desc: "20일 평균 대비",
      hit: vol.spike,
    },
  ];

  // 매수 vs 매도 판단
  let side: "buy" | "sell" | "hold" = "hold";
  let matchCount = 0;
  let strength: "strong" | "weak" | "none" = "none";

  if (buyCount >= sellCount) {
    matchCount = buyCount;
    if (buyCount >= 4) { strength = "strong"; side = "buy"; }
    else if (buyCount >= 2) { strength = "weak"; side = "buy"; }
  } else {
    matchCount = sellCount;
    if (sellCount >= 4) { strength = "strong"; side = "sell"; }
    else if (sellCount >= 2) { strength = "weak"; side = "sell"; }
  }

  const comment = side === "buy"
    ? `매수 신호 ${matchCount}/5. ${rsiBuy ? "RSI 과매도 반등 기대. " : ""}${macdBuy ? "MACD 골든크로스 확인. " : ""}${vol.spike ? "거래량 급증으로 신뢰도 높음." : ""}`
    : side === "sell"
    ? `매도 신호 ${matchCount}/5. ${rsiSell ? "RSI 과매수 구간. " : ""}${macdSell ? "MACD 데드크로스 확인. " : ""}`
    : "뚜렷한 매매 신호 없음. 대기.";

  const atr = calcATR(candles);
  const raw: SignalRaw = {
    rsi, macd: macd.macd, macdSignal: macd.signal, macdCrossover: macd.crossover,
    ma5: ma.ma5, ma20: ma.ma20, bbPosition: bb.position, volumeRatio: vol.ratio, atr,
  };

  return { indicators, matchCount, strength, side, comment, raw };
}

// ─── ATR (Average True Range) ────────────────────────
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

// ─── 손절/익절/트레일링 스탑 판단 ────────────────────
export interface RiskCheckResult {
  action: "stop_loss" | "take_profit" | "trailing_stop" | "hold";
  reason: string;
  currentPnlRate: number;
}

export function checkRisk(
  avgPrice: number,
  currentPrice: number,
  highSinceBuy: number,
  stopLoss: number,    // 예: -5 (%)
  takeProfit: number,  // 예: +5 (%)
  trailingStop: number // 예: -3 (%)
): RiskCheckResult {
  const pnlRate = ((currentPrice - avgPrice) / avgPrice) * 100;
  const fromHigh = ((currentPrice - highSinceBuy) / highSinceBuy) * 100;

  // 손절
  if (pnlRate <= stopLoss) {
    return { action: "stop_loss", reason: `손절 라인 도달 (${pnlRate.toFixed(1)}% ≤ ${stopLoss}%)`, currentPnlRate: pnlRate };
  }

  // 익절
  if (pnlRate >= takeProfit) {
    return { action: "take_profit", reason: `익절 라인 도달 (${pnlRate.toFixed(1)}% ≥ +${takeProfit}%)`, currentPnlRate: pnlRate };
  }

  // 트레일링 스탑 (수익 구간에서만)
  if (pnlRate > 0 && fromHigh <= trailingStop) {
    return { action: "trailing_stop", reason: `트레일링 스탑 (고점 대비 ${fromHigh.toFixed(1)}% ≤ ${trailingStop}%)`, currentPnlRate: pnlRate };
  }

  return { action: "hold", reason: "보유 유지", currentPnlRate: pnlRate };
}
