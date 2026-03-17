/**
 * MACD (Moving Average Convergence Divergence)
 * - MACD 라인이 시그널 라인 상향돌파 → 매수
 * - MACD 라인이 시그널 라인 하향돌파 → 매도
 */

function ema(data, period) {
  const k = 2 / (period + 1);
  const result = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function calcMACD(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return null;

  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine.slice(slow - 1), signalPeriod);

  // 마지막 값 정렬
  const macdSliced = macdLine.slice(slow - 1);
  const offset = macdSliced.length - signalLine.length;

  return {
    macd: macdSliced.slice(offset),
    signal: signalLine,
    histogram: signalLine.map((s, i) => macdSliced[i + offset] - s),
  };
}

export function analyzeMACD(closes) {
  const result = calcMACD(closes);
  if (!result) return { signal: "neutral", strength: 0, data: null, reason: "데이터 부족" };

  const { macd, signal, histogram } = result;
  const len = histogram.length;
  const curr = histogram[len - 1];
  const prev = histogram[len - 2];

  // 골든크로스: 히스토그램이 음 → 양 전환
  if (prev < 0 && curr > 0) {
    const strength = Math.abs(curr) > Math.abs(prev) ? 2 : 1;
    return { signal: "buy", strength, data: { macd: macd[len - 1], signal: signal[len - 1] }, reason: "MACD 골든크로스" };
  }

  // 데드크로스: 히스토그램이 양 → 음 전환
  if (prev > 0 && curr < 0) {
    const strength = Math.abs(curr) > Math.abs(prev) ? 2 : 1;
    return { signal: "sell", strength, data: { macd: macd[len - 1], signal: signal[len - 1] }, reason: "MACD 데드크로스" };
  }

  return { signal: "neutral", strength: 0, data: { macd: macd[len - 1], signal: signal[len - 1] }, reason: "MACD 변화 없음" };
}
